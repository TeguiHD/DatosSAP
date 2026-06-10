import { Injectable } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async kpiSummary() {
    const now = new Date();
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);

    const [
      plantsTotal,
      plantsInRisk,
      overdueWorkOrders,
      upcomingOccurrences30d,
      pendingApprovals,
      hours,
      health,
    ] = await Promise.all([
      this.prisma.plant.count(),
      this.prisma.plant.count({ where: { healthScore: { lt: 70 } } }),
      this.prisma.workOrder.count({
        where: { status: { in: [WorkOrderStatus.SCHEDULED, WorkOrderStatus.ASSIGNED] }, plannedEnd: { lt: now } },
      }),
      this.prisma.maintenanceOccurrence.count({
        where: { scheduledFor: { gte: now, lte: in30Days } },
      }),
      this.prisma.workOrder.count({ where: { status: WorkOrderStatus.PENDING_CLIENT_APPROVAL } }),
      this.prisma.workOrder.aggregate({ _sum: { plannedHours: true } }),
      this.prisma.plant.aggregate({ _avg: { healthScore: true } }),
    ]);

    const actualHours = await this.prisma.hhEntry.aggregate({ _sum: { hours: true } });

    return {
      generatedAt: now.toISOString(),
      plantsTotal,
      plantsInRisk,
      overdueWorkOrders,
      upcomingOccurrences30d,
      plannedHours: hours._sum.plannedHours ?? 0,
      actualHours: actualHours._sum.hours ?? 0,
      averageHealthScore: health._avg.healthScore,
      pendingApprovals,
    };
  }
}
