import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IssueSeverity, MilestoneStatus, Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface WorkOrderListQuery {
  status?: WorkOrderStatus;
  plantId?: string;
  q?: string;
}

interface CreateWorkOrderInput {
  plantId: string;
  title: string;
  assetNodeId?: string;
  description?: string;
  plannedHours?: number;
}

const transitionRules: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  DRAFT: [WorkOrderStatus.SCHEDULED, WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED],
  SCHEDULED: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.POSTPONED, WorkOrderStatus.CANCELLED],
  ASSIGNED: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.REOPENED, WorkOrderStatus.CANCELLED],
  IN_PROGRESS: [WorkOrderStatus.PENDING_EVIDENCE, WorkOrderStatus.PENDING_SUPERVISOR_REVIEW, WorkOrderStatus.CANCELLED],
  PENDING_EVIDENCE: [WorkOrderStatus.PENDING_SUPERVISOR_REVIEW, WorkOrderStatus.REOPENED, WorkOrderStatus.CANCELLED],
  PENDING_SUPERVISOR_REVIEW: [WorkOrderStatus.COMPLETED, WorkOrderStatus.REJECTED, WorkOrderStatus.REOPENED],
  PENDING_CLIENT_APPROVAL: [WorkOrderStatus.CLOSED, WorkOrderStatus.REJECTED, WorkOrderStatus.REOPENED],
  COMPLETED: [WorkOrderStatus.CLOSED, WorkOrderStatus.SIGNED, WorkOrderStatus.REOPENED],
  CLOSED: [WorkOrderStatus.SIGNED, WorkOrderStatus.REOPENED],
  SIGNED: [WorkOrderStatus.REOPENED],
  REJECTED: [WorkOrderStatus.REOPENED],
  REOPENED: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
  POSTPONED: [WorkOrderStatus.SCHEDULED, WorkOrderStatus.CANCELLED],
  SKIPPED: [WorkOrderStatus.REOPENED],
  CANCELLED: [WorkOrderStatus.REOPENED],
};

@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: WorkOrderListQuery) {
    const where: Prisma.WorkOrderWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.plantId) {
      where.plantId = query.plantId;
    }
    if (query.q?.trim()) {
      const search = query.q.trim();
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { plant: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.workOrder.findMany({
      where,
      include: {
        plant: { include: { client: true } },
        assetNode: true,
        assignments: { where: { status: 'ACTIVE' }, include: { personnel: true, user: true } },
        evidenceFiles: true,
        hhEntries: true,
        milestones: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ plannedStart: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
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

  async timeline(id: string) {
    return this.prisma.auditEvent.findMany({
      where: { resource: 'work_order', resourceId: id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
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
