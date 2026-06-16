import { Injectable } from '@nestjs/common';
import { OccurrenceStatus, Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const KPI_TTL_MS = 5 * 60 * 1000;
const TERMINAL_WORK_ORDER_STATUSES = [
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.SIGNED,
  WorkOrderStatus.CANCELLED,
  WorkOrderStatus.SKIPPED,
];

@Injectable()
export class KpiService {
  constructor(private readonly prisma: PrismaService) {}

  async plantSummary(plantId: string, now = new Date()) {
    const day = this.dayStart(now);
    const cached = await this.prisma.kpiDailySummary.findUnique({
      where: { plantId_day: { plantId, day } },
    });
    if (cached && now.getTime() - cached.refreshedAt.getTime() < KPI_TTL_MS) {
      return cached;
    }

    const next30 = new Date(now);
    next30.setDate(next30.getDate() + 30);
    const activeWorkOrderWhere: Prisma.WorkOrderWhereInput = {
      plantId,
      status: { notIn: TERMINAL_WORK_ORDER_STATUSES },
    };
    const workOrders = await this.prisma.workOrder.findMany({
      where: activeWorkOrderWhere,
      select: { id: true, plannedEnd: true, plannedHours: true, actualHours: true },
    });
    const workOrderIds = workOrders.map((workOrder) => workOrder.id);
    const hhEntries = workOrderIds.length
      ? await this.prisma.hhEntry.groupBy({
          by: ['workOrderId'],
          where: { workOrderId: { in: workOrderIds } },
          _sum: { hours: true },
        })
      : [];
    const hoursByWorkOrder = new Map(hhEntries.map((entry) => [entry.workOrderId, entry._sum.hours ?? 0]));

    const [upcomingOccurrences30d, plant] = await Promise.all([
      this.prisma.maintenanceOccurrence.count({
        where: {
          plantId,
          isHistorical: false,
          status: { notIn: [OccurrenceStatus.COMPLETED, OccurrenceStatus.SKIPPED, OccurrenceStatus.CANCELLED] },
          scheduledFor: { gte: this.dateOnly(now), lte: this.dateOnly(next30) },
        },
      }),
      this.prisma.plant.findUnique({ where: { id: plantId }, select: { healthScore: true } }),
    ]);

    const overdueWorkOrders = workOrders.filter((workOrder) => workOrder.plannedEnd && workOrder.plannedEnd < now).length;
    const plannedHours = workOrders.reduce((sum, workOrder) => sum + (workOrder.plannedHours ?? 0), 0);
    const actualHours = workOrders.reduce((sum, workOrder) => {
      const hh = hoursByWorkOrder.get(workOrder.id);
      return sum + (hh ?? workOrder.actualHours ?? 0);
    }, 0);

    return this.prisma.kpiDailySummary.upsert({
      where: { plantId_day: { plantId, day } },
      update: {
        overdueWorkOrders,
        upcomingOccurrences30d,
        plannedHours,
        actualHours,
        healthScore: plant?.healthScore ?? null,
        refreshedAt: now,
      },
      create: {
        plantId,
        day,
        overdueWorkOrders,
        upcomingOccurrences30d,
        plannedHours,
        actualHours,
        healthScore: plant?.healthScore ?? null,
        refreshedAt: now,
      },
    });
  }

  dayStart(value: Date) {
    const next = new Date(value);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  dateOnly(value: Date) {
    const next = new Date(value);
    next.setHours(0, 0, 0, 0);
    return next;
  }
}
