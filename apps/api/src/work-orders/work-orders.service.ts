import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IssueSeverity, MilestoneStatus, Prisma, Role, WorkOrderStatus } from '@prisma/client';
import { AuthenticatedRequestUser, PlantAccessService } from '../access/plant-access.service';
import { normalizePagination, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

interface CreateWorkOrderInput {
  plantId: string;
  title: string;
  assetNodeId?: string;
  description?: string;
  plannedHours?: number;
}

const transitionRules: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  DRAFT: [WorkOrderStatus.SCHEDULED, WorkOrderStatus.CLIENT_NOTIFIED, WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED],
  SCHEDULED: [
    WorkOrderStatus.CLIENT_NOTIFIED,
    WorkOrderStatus.PENDING_ACCESS,
    WorkOrderStatus.PENDING_EXECUTION_APPROVAL,
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.POSTPONED,
    WorkOrderStatus.CANCELLED,
  ],
  CLIENT_NOTIFIED: [
    WorkOrderStatus.PENDING_ACCESS,
    WorkOrderStatus.PENDING_EXECUTION_APPROVAL,
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.CANCELLED,
  ],
  PENDING_ACCESS: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.REJECTED, WorkOrderStatus.CANCELLED],
  PENDING_EXECUTION_APPROVAL: [
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.REJECTED,
    WorkOrderStatus.CANCELLED,
  ],
  ASSIGNED: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.REOPENED, WorkOrderStatus.CANCELLED],
  IN_PROGRESS: [
    WorkOrderStatus.PENDING_EVIDENCE,
    WorkOrderStatus.PENDING_SUPERVISOR_REVIEW,
    WorkOrderStatus.PENDING_CONFORMITY,
    WorkOrderStatus.CANCELLED,
  ],
  PENDING_EVIDENCE: [WorkOrderStatus.PENDING_SUPERVISOR_REVIEW, WorkOrderStatus.REOPENED, WorkOrderStatus.CANCELLED],
  PENDING_SUPERVISOR_REVIEW: [
    WorkOrderStatus.PENDING_CONFORMITY,
    WorkOrderStatus.COMPLETED,
    WorkOrderStatus.REJECTED,
    WorkOrderStatus.REOPENED,
  ],
  PENDING_CLIENT_APPROVAL: [WorkOrderStatus.CLOSED, WorkOrderStatus.REJECTED, WorkOrderStatus.REOPENED],
  PENDING_CONFORMITY: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CLOSED, WorkOrderStatus.REJECTED, WorkOrderStatus.REOPENED],
  COMPLETED: [WorkOrderStatus.CLOSED, WorkOrderStatus.SIGNED, WorkOrderStatus.REOPENED],
  CLOSED: [WorkOrderStatus.SIGNED, WorkOrderStatus.REOPENED],
  SIGNED: [WorkOrderStatus.REOPENED],
  REJECTED: [WorkOrderStatus.REOPENED],
  REOPENED: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
  POSTPONED: [WorkOrderStatus.SCHEDULED, WorkOrderStatus.CANCELLED],
  SKIPPED: [WorkOrderStatus.REOPENED],
  CANCELLED: [WorkOrderStatus.REOPENED],
};
const COMMENT_READER_ROLES: Role[] = [Role.SUPERADMIN, Role.ADMIN, Role.SUPERVISOR];
const TERMINAL_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.SIGNED,
  WorkOrderStatus.CANCELLED,
  WorkOrderStatus.SKIPPED,
];

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlantAccessService,
  ) {}

  async list(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    const { page, limit, skip } = normalizePagination(query);
    const where = await this.buildListWhere(query, user);
    if (where === null) return paginated([], 0, page, limit);

    const readLimit = skip + limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.findMany({
        where,
        select: this.listSelect(),
        orderBy: [{ plannedStart: 'asc' }, { createdAt: 'desc' }],
        take: readLimit,
      }),
    ]);
    const now = new Date();
    const sorted = rows
      .map((row) => this.toListItem(row, now))
      .sort((left, right) => Number(right.isOverdue) - Number(left.isOverdue) || (left.plannedStart?.getTime() ?? 0) - (right.plannedStart?.getTime() ?? 0));
    return paginated(sorted.slice(skip, skip + limit), total, page, limit);
  }

  async detail(id: string, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        plant: { include: { client: true } },
        assetNode: true,
        milestones: { orderBy: { createdAt: 'asc' } },
        assignments: { include: { user: { select: { id: true, email: true, name: true } }, personnel: true } },
        visitPlan: true,
        _count: { select: { evidenceFiles: true, comments: true, hhEntries: true } },
      },
    });
    if (!workOrder) throw new NotFoundException('Work order not found');
    await this.ensureWorkOrderAccess(workOrder, user);
    return {
      ...workOrder,
      asset: this.toAssetRef(workOrder.assetNode),
      isOverdue: Boolean(workOrder.plannedEnd && workOrder.plannedEnd < new Date() && !this.isTerminal(workOrder.status)),
      counts: workOrder._count,
    };
  }

  async milestones(id: string, maybeUser?: AuthenticatedRequestUser) {
    await this.detail(id, maybeUser);
    return this.prisma.workOrderMilestone.findMany({
      where: { workOrderId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async comments(id: string, query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    await this.detail(id, user);
    const { page, limit, skip } = normalizePagination(query);
    const where: Prisma.WorkOrderCommentWhereInput = {
      workOrderId: id,
      ...(this.canReadInternalComments(user) ? {} : { internal: false }),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.workOrderComment.count({ where }),
      this.prisma.workOrderComment.findMany({
        where,
        include: { authorUser: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return paginated(data, total, page, limit);
  }

  async create(input: CreateWorkOrderInput) {
    const count = await this.prisma.workOrder.count();
    const workOrder = await this.prisma.workOrder.create({
      data: {
        code: `OT-${String(count + 1).padStart(6, '0')}`,
        plantId: input.plantId,
        title: input.title,
        status: WorkOrderStatus.DRAFT,
        criticality: IssueSeverity.INFO,
        ...(input.assetNodeId ? { assetNodeId: input.assetNodeId } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.plannedHours ? { plannedHours: input.plannedHours } : {}),
      },
    });
    await this.ensureMilestones(workOrder.id);
    await this.audit(workOrder.id, 'created', null, workOrder);
    return workOrder;
  }

  async assign(id: string, input: { userId?: string; personnelId?: string }) {
    if (!input.userId && !input.personnelId) {
      throw new BadRequestException('Assignment requires userId or personnelId');
    }
    const before = await this.mustFind(id);
    if (input.personnelId) {
      await this.validateSpecialty(id, input.personnelId);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.assignment.create({
        data: {
          workOrderId: id,
          ...(input.userId ? { userId: input.userId } : {}),
          ...(input.personnelId ? { personnelId: input.personnelId } : {}),
        },
      });
      const after = await tx.workOrder.update({
        where: { id },
        data: {
          status: WorkOrderStatus.ASSIGNED,
          ...(input.userId ? { assignedUserId: input.userId } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          resource: 'work_order',
          resourceId: id,
          action: 'assigned',
          before: this.asJson(before),
          after: this.asJson({ workOrder: after, assignment: input }),
        },
      });
      await this.markMilestone(tx, id, 'Asignada');
      await this.recalculateProgress(tx, id);
      return after;
    });
  }

  async registerHours(id: string, input: { hours: number; notes?: string; userId?: string }) {
    if (input.hours <= 0) {
      throw new BadRequestException('Hours must be greater than zero');
    }
    await this.mustFind(id);
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.hhEntry.create({
        data: {
          workOrderId: id,
          hours: input.hours,
          entryDate: new Date(),
          ...(input.userId ? { userId: input.userId } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          resource: 'work_order',
          resourceId: id,
          action: 'hh_registered',
          after: this.asJson(entry),
        },
      });
      await this.recalculateProgress(tx, id);
      return entry;
    });
  }

  async attachEvidence(id: string, input: { fileName: string; storageKey: string; checksum: string; mimeType?: string; sizeBytes?: number }) {
    await this.mustFind(id);
    return this.prisma.$transaction(async (tx) => {
      const evidence = await tx.evidenceFile.create({
        data: {
          workOrderId: id,
          fileName: input.fileName,
          storageKey: input.storageKey,
          checksum: input.checksum,
          mimeType: input.mimeType ?? 'application/octet-stream',
          sizeBytes: input.sizeBytes ?? 0,
          isRequired: true,
        },
      });
      await this.markMilestone(tx, id, 'Evidencia');
      const workOrder = await tx.workOrder.findUniqueOrThrow({ where: { id } });
      if (workOrder.status === WorkOrderStatus.PENDING_EVIDENCE) {
        await tx.workOrder.update({ where: { id }, data: { status: WorkOrderStatus.PENDING_SUPERVISOR_REVIEW } });
      }
      await tx.auditEvent.create({
        data: {
          resource: 'work_order',
          resourceId: id,
          action: 'evidence_attached',
          after: this.asJson({ fileName: evidence.fileName, checksum: evidence.checksum }),
        },
      });
      await this.recalculateProgress(tx, id);
      return evidence;
    });
  }

  async start(id: string) {
    return this.transition(id, WorkOrderStatus.IN_PROGRESS, 'started');
  }

  async complete(id: string) {
    const order = await this.mustFind(id);
    const evidenceCount = await this.prisma.evidenceFile.count({ where: { workOrderId: id } });
    const requiresEvidence = await this.requiresEvidence(id);
    if (requiresEvidence && evidenceCount === 0) {
      await this.prisma.workOrder.update({ where: { id }, data: { status: WorkOrderStatus.PENDING_EVIDENCE } });
      await this.audit(id, 'completion_blocked_missing_evidence', order, { status: WorkOrderStatus.PENDING_EVIDENCE });
      throw new BadRequestException('Required evidence must be attached before completing this work order');
    }
    return this.transition(id, WorkOrderStatus.COMPLETED, 'completed');
  }

  async approve(id: string) {
    return this.transition(id, WorkOrderStatus.CLOSED, 'approved');
  }

  async reject(id: string) {
    return this.transition(id, WorkOrderStatus.REJECTED, 'rejected');
  }

  async reopen(id: string) {
    return this.transition(id, WorkOrderStatus.REOPENED, 'reopened');
  }

  async sign(id: string) {
    return this.transition(id, WorkOrderStatus.SIGNED, 'signed');
  }

  async transition(id: string, status: WorkOrderStatus, action = 'status_changed') {
    const before = await this.mustFind(id);
    const allowed = transitionRules[before.status] ?? [];
    if (!allowed.includes(status) && before.status !== status) {
      throw new BadRequestException(`Invalid transition from ${before.status} to ${status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.workOrder.update({ where: { id }, data: { status } });
      await this.markStatusMilestone(tx, id, status);
      await this.recalculateProgress(tx, id);
      const refreshed = await tx.workOrder.findUniqueOrThrow({ where: { id } });
      await tx.auditEvent.create({
        data: {
          resource: 'work_order',
          resourceId: id,
          action,
          before: this.asJson(before),
          after: this.asJson(refreshed),
        },
      });
      return after;
    });
  }

  async timeline(id: string, maybeUser?: AuthenticatedRequestUser) {
    await this.detail(id, maybeUser);
    return this.prisma.auditEvent.findMany({
      where: { resource: 'work_order', resourceId: id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  private async buildListWhere(query: Record<string, string | undefined>, user: AuthenticatedRequestUser) {
    const plantIds = await this.access.plantIdFilter(user, query.plantId);
    if (plantIds?.length === 0) return null;

    const where: Prisma.WorkOrderWhereInput = {};
    const and: Prisma.WorkOrderWhereInput[] = [];
    if (plantIds) where.plantId = { in: plantIds };
    if (query.status && this.isWorkOrderStatus(query.status)) where.status = query.status;
    if (query.criticality && this.isIssueSeverity(query.criticality)) where.criticality = query.criticality;
    if (query.from || query.to) {
      where.plannedStart = this.dateRange(query.from, query.to);
    }
    if (query.responsibleId) {
      and.push({
        OR: [
          { assignedUserId: query.responsibleId },
          { assignments: { some: { userId: query.responsibleId, status: 'ACTIVE' } } },
          { assignments: { some: { personnelId: query.responsibleId, status: 'ACTIVE' } } },
        ],
      });
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      and.push({
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { plant: { name: { contains: search, mode: 'insensitive' } } },
          { assetNode: { equipmentCode: { contains: search, mode: 'insensitive' } } },
          { assetNode: { kksDescription: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    if (user.role === Role.TECNICO) {
      and.push({
        OR: [
          { assignedUserId: user.userId },
          { assignments: { some: { userId: user.userId, status: 'ACTIVE' } } },
        ],
      });
    }
    if (and.length) where.AND = and;
    return where;
  }

  private listSelect() {
    return {
      id: true,
      code: true,
      title: true,
      status: true,
      criticality: true,
      plannedStart: true,
      plannedEnd: true,
      plannedHours: true,
      actualHours: true,
      progress: true,
      visitPlanId: true,
      plant: { select: { id: true, code: true, name: true, client: { select: { name: true } } } },
      assetNode: { select: { id: true, technicalObject: true, kks: true, kksDescription: true, equipmentCode: true, equipmentDescription: true } },
      assignments: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          userId: true,
          personnelId: true,
          user: { select: { id: true, email: true, name: true } },
          personnel: { select: { id: true, name: true, isExternal: true } },
        },
      },
      milestones: { select: { id: true, status: true, weight: true } },
      _count: { select: { milestones: true, evidenceFiles: true, comments: true } },
    } satisfies Prisma.WorkOrderSelect;
  }

  private toListItem(row: {
    id: string;
    code: string;
    title: string;
    status: WorkOrderStatus;
    criticality: IssueSeverity;
    plannedStart: Date | null;
    plannedEnd: Date | null;
    plannedHours: number | null;
    actualHours: number | null;
    progress: number;
    visitPlanId: string | null;
    plant: { id: string; code: string; name: string; client: { name: string } };
    assetNode: { id: string; technicalObject: string; kks: string | null; kksDescription: string | null; equipmentCode: string | null; equipmentDescription: string | null } | null;
    assignments: unknown[];
    milestones: { status: MilestoneStatus; weight: number }[];
    _count: { milestones: number; evidenceFiles: number; comments: number };
  }, now: Date) {
    const completedWeight = row.milestones
      .filter((milestone) => milestone.status === MilestoneStatus.COMPLETED)
      .reduce((sum, milestone) => sum + milestone.weight, 0);
    const totalWeight = row.milestones.reduce((sum, milestone) => sum + milestone.weight, 0);
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      status: row.status,
      criticality: row.criticality,
      plannedStart: row.plannedStart,
      plannedEnd: row.plannedEnd,
      plannedHours: row.plannedHours,
      actualHours: row.actualHours,
      progress: totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : Math.round(row.progress),
      visitPlanId: row.visitPlanId,
      plant: {
        id: row.plant.id,
        code: row.plant.code,
        name: row.plant.name,
        clientName: row.plant.client.name,
      },
      asset: this.toAssetRef(row.assetNode),
      assignments: row.assignments,
      counts: row._count,
      isOverdue: Boolean(row.plannedEnd && row.plannedEnd < now && !this.isTerminal(row.status)),
    };
  }

  private async ensureWorkOrderAccess(workOrder: { id: string; plantId: string; assignedUserId?: string | null }, user: AuthenticatedRequestUser) {
    await this.access.ensurePlantAccess(workOrder.plantId, user);
    if (user.role !== Role.TECNICO) return;
    if (workOrder.assignedUserId === user.userId) return;
    const assignment = await this.prisma.assignment.findFirst({
      where: { workOrderId: workOrder.id, userId: user.userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException('Work order not found');
  }

  private canReadInternalComments(user: AuthenticatedRequestUser) {
    return COMMENT_READER_ROLES.includes(user.role);
  }

  private dateRange(from?: string, to?: string) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return range;
  }

  private toAssetRef(asset: { id: string; technicalObject: string; kks: string | null; kksDescription: string | null; equipmentCode: string | null; equipmentDescription: string | null } | null) {
    if (!asset) return null;
    return {
      id: asset.id,
      kksCode: asset.kks ?? asset.technicalObject,
      kksDescription: asset.kksDescription,
      equipmentNumber: asset.equipmentCode,
      equipmentDescription: asset.equipmentDescription,
    };
  }

  private isWorkOrderStatus(value: string): value is WorkOrderStatus {
    return Object.values(WorkOrderStatus).includes(value as WorkOrderStatus);
  }

  private isIssueSeverity(value: string): value is IssueSeverity {
    return Object.values(IssueSeverity).includes(value as IssueSeverity);
  }

  private isTerminal(status: WorkOrderStatus) {
    return TERMINAL_WORK_ORDER_STATUSES.includes(status);
  }

  private async mustFind(id: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id },
      include: { occurrence: { include: { template: true } }, milestones: true },
    });
    if (!workOrder) {
      throw new NotFoundException('Work order not found');
    }
    return workOrder;
  }

  private async requiresEvidence(id: string) {
    const order = await this.prisma.workOrder.findUnique({
      where: { id },
      include: { occurrence: { include: { template: true } } },
    });
    return order?.occurrence?.template.requiresEvidence ?? true;
  }

  private async validateSpecialty(workOrderId: string, personnelId: string) {
    const order = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: { occurrence: { include: { template: true } } },
    });
    const requiredSpecialtyId = order?.occurrence?.template.requiredSpecialtyId;
    if (!requiredSpecialtyId) {
      return;
    }
    const personnel = await this.prisma.personnel.findUnique({ where: { id: personnelId } });
    if (personnel?.primarySpecialtyId !== requiredSpecialtyId) {
      throw new BadRequestException('Personnel specialty does not match the work order requirement');
    }
  }

  private async ensureMilestones(workOrderId: string) {
    const existing = await this.prisma.workOrderMilestone.count({ where: { workOrderId } });
    if (existing) {
      return;
    }
    await this.prisma.workOrderMilestone.createMany({
      data: [
        ['Programada', 10],
        ['Asignada', 15],
        ['En ejecucion', 25],
        ['Evidencia', 20],
        ['Revision supervisor', 20],
        ['Firmada', 10],
      ].map(([label, weight]) => ({ workOrderId, label: String(label), weight: Number(weight) })),
    });
  }

  private async markStatusMilestone(tx: Prisma.TransactionClient, workOrderId: string, status: WorkOrderStatus) {
    if (status === WorkOrderStatus.SCHEDULED) await this.markMilestone(tx, workOrderId, 'Programada');
    if (status === WorkOrderStatus.ASSIGNED) await this.markMilestone(tx, workOrderId, 'Asignada');
    if (status === WorkOrderStatus.IN_PROGRESS) await this.markMilestone(tx, workOrderId, 'En ejecucion');
    if (status === WorkOrderStatus.PENDING_SUPERVISOR_REVIEW || status === WorkOrderStatus.COMPLETED) {
      await this.markMilestone(tx, workOrderId, 'Revision supervisor');
    }
    if (status === WorkOrderStatus.SIGNED) await this.markMilestone(tx, workOrderId, 'Firmada');
  }

  private async markMilestone(tx: Prisma.TransactionClient, workOrderId: string, label: string) {
    await this.ensureMilestones(workOrderId);
    await tx.workOrderMilestone.updateMany({
      where: { workOrderId, label },
      data: { status: MilestoneStatus.COMPLETED, completedAt: new Date() },
    });
  }

  private async recalculateProgress(tx: Prisma.TransactionClient, workOrderId: string) {
    const milestones = await tx.workOrderMilestone.findMany({ where: { workOrderId } });
    const totalWeight = milestones.reduce((sum, milestone) => sum + milestone.weight, 0);
    const completedWeight = milestones
      .filter((milestone) => milestone.status === MilestoneStatus.COMPLETED)
      .reduce((sum, milestone) => sum + milestone.weight, 0);
    const progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
    await tx.workOrder.update({ where: { id: workOrderId }, data: { progress } });
  }

  private async audit(workOrderId: string, action: string, before: unknown, after: unknown) {
    const data: Prisma.AuditEventUncheckedCreateInput = {
      resource: 'work_order',
      resourceId: workOrderId,
      action,
    };
    if (before) {
      data.before = this.asJson(before);
    }
    if (after) {
      data.after = this.asJson(after);
    }
    await this.prisma.auditEvent.create({
      data,
    });
  }

  private asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
