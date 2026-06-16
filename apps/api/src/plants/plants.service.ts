import { Injectable, NotFoundException } from '@nestjs/common';
import { FrequencyCode, OccurrenceStatus, PlantStatus, Prisma, WorkOrderStatus } from '@prisma/client';
import { AuthenticatedRequestUser, PlantAccessService } from '../access/plant-access.service';
import { normalizePagination, paginated } from '../common/pagination';
import { KpiService } from '../kpi/kpi.service';
import { PrismaService } from '../prisma/prisma.service';

const TERMINAL_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.SIGNED,
  WorkOrderStatus.CANCELLED,
  WorkOrderStatus.SKIPPED,
];
const TERMINAL_OCCURRENCE_STATUSES: OccurrenceStatus[] = [OccurrenceStatus.COMPLETED, OccurrenceStatus.SKIPPED, OccurrenceStatus.CANCELLED];

@Injectable()
export class PlantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlantAccessService,
    private readonly kpi: KpiService,
  ) {}

  async list(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    const { page, limit } = normalizePagination(query);
    const plantIds = await this.access.plantIdFilter(user);
    if (plantIds?.length === 0) {
      return paginated([], 0, page, limit);
    }

    const where: Prisma.PlantWhereInput = {};
    if (plantIds) where.id = { in: plantIds };
    if (query.status && this.isPlantStatus(query.status)) where.status = query.status;
    if (query.clientId) where.clientId = query.clientId;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const plants = await this.prisma.plant.findMany({
      where,
      include: { client: true },
      orderBy: query.orderBy === 'name' ? [{ name: 'asc' }] : [{ healthScore: 'asc' }, { name: 'asc' }],
    });
    const rows = await Promise.all(plants.map((plant) => this.toPlantListItem(plant)));
    const sorted = this.sortPlants(rows, query.orderBy);
    const total = sorted.length;
    const start = (page - 1) * limit;
    return paginated(sorted.slice(start, start + limit), total, page, limit);
  }

  async detail(id: string, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    await this.access.ensurePlantAccess(id, user);
    const plant = await this.prisma.plant.findUnique({
      where: { id },
      include: {
        client: true,
        aliases: true,
        recertificationCycles: { orderBy: { dueAt: 'asc' } },
        _count: { select: { assetNodes: true, occurrences: true, workOrders: true } },
      },
    });
    if (!plant) {
      throw new NotFoundException('Plant not found');
    }
    return {
      ...this.toPlantBase(plant),
      aliases: plant.aliases.map((alias) => ({ aliasCode: alias.aliasCode, source: alias.source, reason: alias.reason })),
      counts: plant._count,
      recertifications: plant.recertificationCycles,
      userScope: { hasAccess: true, unrestricted: this.access.isUnrestricted(user) },
    };
  }

  async summary(id: string, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    await this.access.ensurePlantAccess(id, user);
    const plant = await this.prisma.plant.findUnique({ where: { id }, include: { client: true } });
    if (!plant) throw new NotFoundException('Plant not found');

    const now = new Date();
    const kpi = await this.kpi.plantSummary(id, now);
    const [inProgressCount, completedCount, nextRecertification] = await Promise.all([
      this.prisma.workOrder.count({
        where: { plantId: id, status: { in: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.PENDING_EVIDENCE, WorkOrderStatus.PENDING_SUPERVISOR_REVIEW] } },
      }),
      this.prisma.workOrder.count({
        where: { plantId: id, status: { in: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CLOSED, WorkOrderStatus.SIGNED] }, updatedAt: { gte: this.daysAgo(now, 30) } },
      }),
      this.prisma.recertificationCycle.findFirst({
        where: { plantId: id, status: 'PENDING' },
        orderBy: { dueAt: 'asc' },
      }),
    ]);

    return {
      plant: this.toPlantBase(plant),
      overdueCount: kpi.overdueWorkOrders,
      inProgressCount,
      upcoming30d: kpi.upcomingOccurrences30d,
      completedCount,
      plannedHh: kpi.plannedHours,
      actualHh: kpi.actualHours,
      hhDeviation: kpi.actualHours - kpi.plannedHours,
      nextRecertification: nextRecertification
        ? {
            id: nextRecertification.id,
            code: nextRecertification.code,
            label: `${nextRecertification.label} · ${this.formatDate(nextRecertification.dueAt)} · ${this.daysUntil(nextRecertification.dueAt, now)} días`,
            dueAt: nextRecertification.dueAt,
            status: nextRecertification.status,
          }
        : null,
      refreshedAt: kpi.refreshedAt,
    };
  }

  async maintenance(id: string, query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    await this.access.ensurePlantAccess(id, user);
    const { page, limit } = normalizePagination(query);
    const skip = (page - 1) * limit;
    const readLimit = skip + limit;
    const now = new Date();
    const occurrenceWhere: Prisma.MaintenanceOccurrenceWhereInput = { plantId: id };
    const workOrderWhere: Prisma.WorkOrderWhereInput = { plantId: id };

    if (query.status && this.isOccurrenceStatus(query.status)) occurrenceWhere.status = query.status;
    if (query.status && this.isWorkOrderStatus(query.status)) workOrderWhere.status = query.status;
    if (query.frequency && this.isFrequencyCode(query.frequency)) occurrenceWhere.template = { frequency: { code: query.frequency } };
    if (query.from || query.to) {
      occurrenceWhere.scheduledFor = this.dateRange(query.from, query.to);
      workOrderWhere.plannedStart = this.dateRange(query.from, query.to);
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      occurrenceWhere.OR = [
        { template: { activityName: { contains: search, mode: 'insensitive' } } },
        { template: { planName: { contains: search, mode: 'insensitive' } } },
        { assetNode: { equipmentCode: { contains: search, mode: 'insensitive' } } },
        { assetNode: { kksDescription: { contains: search, mode: 'insensitive' } } },
      ];
      workOrderWhere.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { assetNode: { equipmentCode: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [occurrenceTotal, workOrderTotal, occurrences, workOrders] = await Promise.all([
      this.prisma.maintenanceOccurrence.count({ where: occurrenceWhere }),
      this.prisma.workOrder.count({ where: workOrderWhere }),
      this.prisma.maintenanceOccurrence.findMany({
        where: occurrenceWhere,
        include: { template: { include: { frequency: true } }, assetNode: true, workOrder: true },
        orderBy: { scheduledFor: 'asc' },
        take: readLimit,
      }),
      this.prisma.workOrder.findMany({
        where: workOrderWhere,
        include: { assetNode: true, assignments: { where: { status: 'ACTIVE' }, take: 3 } },
        orderBy: [{ plannedStart: 'asc' }, { createdAt: 'desc' }],
        take: readLimit,
      }),
    ]);
    const rows = [
      ...occurrences.map((occurrence) => ({
        kind: 'OCCURRENCE' as const,
        id: occurrence.id,
        title: occurrence.template.activityName,
        status: occurrence.status,
        date: occurrence.scheduledFor,
        isOverdue: occurrence.scheduledFor < now && !TERMINAL_OCCURRENCE_STATUSES.includes(occurrence.status),
        frequency: occurrence.template.frequency.code,
        asset: this.toAssetRef(occurrence.assetNode),
        workOrderId: occurrence.workOrder?.id ?? null,
      })),
      ...workOrders.map((workOrder) => ({
        kind: 'WORK_ORDER' as const,
        id: workOrder.id,
        title: workOrder.title,
        status: workOrder.status,
        date: workOrder.plannedStart ?? workOrder.createdAt,
        isOverdue: Boolean(workOrder.plannedEnd && workOrder.plannedEnd < now && !TERMINAL_WORK_ORDER_STATUSES.includes(workOrder.status)),
        criticality: workOrder.criticality,
        asset: this.toAssetRef(workOrder.assetNode),
        workOrderId: workOrder.id,
      })),
    ].sort((left, right) => Number(right.isOverdue) - Number(left.isOverdue) || left.date.getTime() - right.date.getTime());

    return paginated(rows.slice(skip, skip + limit), occurrenceTotal + workOrderTotal, page, limit);
  }

  async recertifications(id: string, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    await this.access.ensurePlantAccess(id, user);
    return this.prisma.recertificationCycle.findMany({
      where: { plantId: id },
      orderBy: { dueAt: 'asc' },
      select: { id: true, code: true, label: true, dueAt: true, status: true, cycleYears: true, isIrregular: true, completedAt: true },
    });
  }

  private async toPlantListItem(plant: Prisma.PlantGetPayload<{ include: { client: true } }>) {
    const [kpi, nextRecertification, nextMaintenanceDue] = await Promise.all([
      this.kpi.plantSummary(plant.id),
      this.prisma.recertificationCycle.findFirst({
        where: { plantId: plant.id, status: 'PENDING' },
        orderBy: { dueAt: 'asc' },
        select: { id: true, label: true, dueAt: true, status: true },
      }),
      this.prisma.maintenanceOccurrence.findFirst({
        where: {
          plantId: plant.id,
          isHistorical: false,
          status: { notIn: [OccurrenceStatus.COMPLETED, OccurrenceStatus.SKIPPED, OccurrenceStatus.CANCELLED] },
        },
        orderBy: { scheduledFor: 'asc' },
        select: { id: true, scheduledFor: true, status: true },
      }),
    ]);

    return {
      ...this.toPlantBase(plant),
      nextRecertification,
      nextMaintenanceDue,
      overdueCount: kpi.overdueWorkOrders,
      upcomingCount: kpi.upcomingOccurrences30d,
      healthScore: kpi.healthScore,
    };
  }

  private toPlantBase(plant: Prisma.PlantGetPayload<{ include: { client: true } }>) {
    return {
      id: plant.id,
      code: plant.code,
      name: plant.name,
      status: plant.status,
      clientId: plant.clientId,
      clientName: plant.client.name,
      latitude: plant.latitude,
      longitude: plant.longitude,
      centerCode: plant.centerCode,
      commissionedAt: plant.commissionedAt,
      healthScore: plant.healthScore,
    };
  }

  private sortPlants<T extends { name: string; overdueCount: number; healthScore: number | null }>(rows: T[], orderBy?: string) {
    if (orderBy === 'overdue') return rows.sort((a, b) => b.overdueCount - a.overdueCount || a.name.localeCompare(b.name));
    if (orderBy === 'name') return rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows.sort((a, b) => (a.healthScore ?? 999) - (b.healthScore ?? 999) || a.name.localeCompare(b.name));
  }

  private dateRange(from?: string, to?: string) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return range;
  }

  private daysAgo(now: Date, days: number) {
    const next = new Date(now);
    next.setDate(next.getDate() - days);
    return next;
  }

  private daysUntil(value: Date, now: Date) {
    return Math.ceil((value.getTime() - now.getTime()) / 86_400_000);
  }

  private formatDate(value: Date) {
    return value.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago' });
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

  private isPlantStatus(value: string): value is PlantStatus {
    return Object.values(PlantStatus).includes(value as PlantStatus);
  }

  private isOccurrenceStatus(value: string): value is OccurrenceStatus {
    return Object.values(OccurrenceStatus).includes(value as OccurrenceStatus);
  }

  private isWorkOrderStatus(value: string): value is WorkOrderStatus {
    return Object.values(WorkOrderStatus).includes(value as WorkOrderStatus);
  }

  private isFrequencyCode(value: string): value is FrequencyCode {
    return Object.values(FrequencyCode).includes(value as FrequencyCode);
  }
}
