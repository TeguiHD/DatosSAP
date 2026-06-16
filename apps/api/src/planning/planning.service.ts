import { Injectable } from '@nestjs/common';
import { FrequencyCode, OccurrenceStatus, Prisma, WorkOrderStatus } from '@prisma/client';
import { AuthenticatedRequestUser, PlantAccessService } from '../access/plant-access.service';
import { normalizePagination, paginated } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

const TERMINAL_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.SIGNED,
  WorkOrderStatus.CANCELLED,
  WorkOrderStatus.SKIPPED,
];
const TERMINAL_OCCURRENCE_STATUSES: OccurrenceStatus[] = [OccurrenceStatus.COMPLETED, OccurrenceStatus.SKIPPED, OccurrenceStatus.CANCELLED];

type PlanningEvent = {
  kind: 'OCCURRENCE' | 'WORK_ORDER';
  id: string;
  title: string;
  date: Date;
  endDate: Date | null;
  status: OccurrenceStatus | WorkOrderStatus;
  isOverdue: boolean;
  plant: { id: string; code: string; name: string; clientName: string };
  templateId: string | null;
  templateName: string | null;
  frequency: FrequencyCode | null;
  workOrderId: string | null;
  responsibleId: string | null;
  asset: {
    id: string;
    kksCode: string;
    description: string | null;
    equipmentNumber: string | null;
  } | null;
};

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlantAccessService,
  ) {}

  async operational(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const view = this.normalizeView(query.view);
    if (view === 'calendar') return this.calendar(query, maybeUser);
    if (view === 'gantt') return this.gantt(query, maybeUser);
    return this.list(query, maybeUser, view);
  }

  async month(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const year = Number(query.year ?? new Date().getFullYear()) || new Date().getFullYear();
    const month = Number(query.month ?? new Date().getMonth() + 1) || new Date().getMonth() + 1;
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    return this.legacyList(
      {
        ...query,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      maybeUser,
    );
  }

  async legacyList(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    const where = await this.occurrenceWhere(query, user);
    if (where === null) return [];
    return this.prisma.maintenanceOccurrence.findMany({
      where,
      include: { plant: { include: { client: true } }, template: true, workOrder: true },
      orderBy: { scheduledFor: 'asc' },
      take: 200,
    });
  }

  async legacyGantt(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const rows = await this.legacyList(query, maybeUser);
    return {
      groupBy: query.groupBy ?? 'plant',
      rows: rows.map((row) => ({
        id: row.id,
        group: row.plant.name,
        title: row.template.activityName,
        start: row.scheduledFor,
        end: row.dueDate ?? row.scheduledFor,
        status: row.status,
      })),
    };
  }

  private async list(query: Record<string, string | undefined>, maybeUser: AuthenticatedRequestUser | undefined, view: 'list' | 'grid') {
    const { page, limit } = normalizePagination(query);
    const events = await this.readEvents(query, maybeUser, 500);
    const sorted = this.sortOperational(events);
    const start = (page - 1) * limit;
    return {
      ...paginated(sorted.slice(start, start + limit), sorted.length, page, limit),
      view,
    };
  }

  private async calendar(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const events = this.sortByDate(await this.readEvents(query, maybeUser, 200)).slice(0, 200);
    const groups = new Map<string, PlanningEvent[]>();
    for (const event of events) {
      const key = event.date.toISOString().slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return {
      view: 'calendar',
      total: events.length,
      dates: [...groups.entries()].map(([date, items]) => ({ date, events: items })),
    };
  }

  private async gantt(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser) {
    const events = this.sortByDate(await this.readEvents(query, maybeUser, 500));
    const groups = new Map<string, { templateId: string | null; templateName: string; plant: PlanningEvent['plant']; slots: PlanningEvent[] }>();
    for (const event of events) {
      const key = event.templateId ?? `work-order:${event.id}`;
      const current = groups.get(key);
      if (current) {
        current.slots.push(event);
      } else {
        groups.set(key, {
          templateId: event.templateId,
          templateName: event.templateName ?? event.title,
          plant: event.plant,
          slots: [event],
        });
      }
    }
    return {
      view: 'gantt',
      groupBy: query.groupBy ?? 'template',
      total: events.length,
      data: [...groups.values()],
    };
  }

  private async readEvents(query: Record<string, string | undefined>, maybeUser?: AuthenticatedRequestUser, maxEvents = 500) {
    const user = this.access.requireUser(maybeUser);
    const [occurrenceWhere, workOrderWhere] = await Promise.all([this.occurrenceWhere(query, user), this.workOrderWhere(query, user)]);
    if (occurrenceWhere === null && workOrderWhere === null) return [];
    const take = Math.ceil(maxEvents / 2);
    const [occurrences, workOrders] = await Promise.all([
      occurrenceWhere === null
        ? []
        : this.prisma.maintenanceOccurrence.findMany({
            where: occurrenceWhere,
            include: {
              plant: { include: { client: true } },
              template: { include: { frequency: true } },
              assetNode: true,
              workOrder: true,
            },
            orderBy: { scheduledFor: 'asc' },
            take,
          }),
      workOrderWhere === null
        ? []
        : this.prisma.workOrder.findMany({
            where: workOrderWhere,
            include: {
              plant: { include: { client: true } },
              assetNode: true,
            },
            orderBy: [{ plannedStart: 'asc' }, { createdAt: 'desc' }],
            take,
          }),
    ]);
    const now = new Date();
    return [
      ...occurrences.map((occurrence): PlanningEvent => ({
        kind: 'OCCURRENCE',
        id: occurrence.id,
        title: occurrence.template.activityName,
        date: occurrence.scheduledFor,
        endDate: occurrence.dueDate,
        status: occurrence.status,
        isOverdue: occurrence.scheduledFor < now && !TERMINAL_OCCURRENCE_STATUSES.includes(occurrence.status),
        plant: this.toPlantRef(occurrence.plant),
        templateId: occurrence.templateId,
        templateName: occurrence.template.planName,
        frequency: occurrence.template.frequency.code,
        workOrderId: occurrence.workOrder?.id ?? null,
        responsibleId: null,
        asset: this.toAssetRef(occurrence.assetNode),
      })),
      ...workOrders.map((workOrder): PlanningEvent => ({
        kind: 'WORK_ORDER',
        id: workOrder.id,
        title: workOrder.title,
        date: workOrder.plannedStart ?? workOrder.createdAt,
        endDate: workOrder.plannedEnd,
        status: workOrder.status,
        isOverdue: Boolean(workOrder.plannedEnd && workOrder.plannedEnd < now && !TERMINAL_WORK_ORDER_STATUSES.includes(workOrder.status)),
        plant: this.toPlantRef(workOrder.plant),
        templateId: null,
        templateName: null,
        frequency: null,
        workOrderId: workOrder.id,
        responsibleId: workOrder.assignedUserId,
        asset: this.toAssetRef(workOrder.assetNode),
      })),
    ];
  }

  private async occurrenceWhere(query: Record<string, string | undefined>, user: AuthenticatedRequestUser) {
    const plantIds = await this.access.plantIdFilter(user, query.plantId);
    if (plantIds?.length === 0) return null;
    const where: Prisma.MaintenanceOccurrenceWhereInput = {};
    const and: Prisma.MaintenanceOccurrenceWhereInput[] = [];
    if (plantIds) where.plantId = { in: plantIds };
    if (query.from || query.to) where.scheduledFor = this.dateRange(query.from, query.to);
    if (query.status && this.isOccurrenceStatus(query.status)) where.status = query.status;
    if (query.frequency && this.isFrequencyCode(query.frequency)) {
      where.template = { frequency: { code: query.frequency } };
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      and.push({
        OR: [
          { template: { activityName: { contains: search, mode: 'insensitive' } } },
          { template: { planName: { contains: search, mode: 'insensitive' } } },
          { assetNode: { equipmentCode: { contains: search, mode: 'insensitive' } } },
          { assetNode: { kksDescription: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.responsibleId) {
      and.push({ workOrder: { assignments: { some: { OR: [{ userId: query.responsibleId }, { personnelId: query.responsibleId }], status: 'ACTIVE' } } } });
    }
    if (and.length) where.AND = and;
    return where;
  }

  private async workOrderWhere(query: Record<string, string | undefined>, user: AuthenticatedRequestUser) {
    const plantIds = await this.access.plantIdFilter(user, query.plantId);
    if (plantIds?.length === 0) return null;
    const where: Prisma.WorkOrderWhereInput = {};
    const and: Prisma.WorkOrderWhereInput[] = [];
    if (plantIds) where.plantId = { in: plantIds };
    if (query.from || query.to) where.plannedStart = this.dateRange(query.from, query.to);
    if (query.status && this.isWorkOrderStatus(query.status)) where.status = query.status;
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
          { assetNode: { equipmentCode: { contains: search, mode: 'insensitive' } } },
          { assetNode: { kksDescription: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    if (and.length) where.AND = and;
    return where;
  }

  private normalizeView(value?: string): 'calendar' | 'list' | 'gantt' | 'grid' {
    if (value === 'calendar' || value === 'gantt' || value === 'grid') return value;
    return 'list';
  }

  private sortOperational(events: PlanningEvent[]) {
    return events.sort((left, right) => Number(right.isOverdue) - Number(left.isOverdue) || left.date.getTime() - right.date.getTime());
  }

  private sortByDate(events: PlanningEvent[]) {
    return events.sort((left, right) => left.date.getTime() - right.date.getTime());
  }

  private dateRange(from?: string, to?: string) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    return range;
  }

  private toPlantRef(plant: { id: string; code: string; name: string; client: { name: string } }) {
    return {
      id: plant.id,
      code: plant.code,
      name: plant.name,
      clientName: plant.client.name,
    };
  }

  private toAssetRef(asset: { id: string; technicalObject: string; kks: string | null; kksDescription: string | null; equipmentCode: string | null } | null) {
    if (!asset) return null;
    return {
      id: asset.id,
      kksCode: asset.kks ?? asset.technicalObject,
      description: asset.kksDescription,
      equipmentNumber: asset.equipmentCode,
    };
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
