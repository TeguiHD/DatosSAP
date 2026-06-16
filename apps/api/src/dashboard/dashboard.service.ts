import { Injectable } from '@nestjs/common';
import { IssueSeverity, PlantStatus, Prisma, WorkOrderStatus } from '@prisma/client';
import { AuthenticatedRequestUser, PlantAccessService } from '../access/plant-access.service';
import { KpiService } from '../kpi/kpi.service';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVE_WORK_ORDER_STATUSES = [
  WorkOrderStatus.SCHEDULED,
  WorkOrderStatus.CLIENT_NOTIFIED,
  WorkOrderStatus.PENDING_ACCESS,
  WorkOrderStatus.PENDING_EXECUTION_APPROVAL,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.PENDING_EVIDENCE,
  WorkOrderStatus.PENDING_SUPERVISOR_REVIEW,
  WorkOrderStatus.PENDING_CLIENT_APPROVAL,
  WorkOrderStatus.PENDING_CONFORMITY,
  WorkOrderStatus.REOPENED,
  WorkOrderStatus.POSTPONED,
];

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlantAccessService,
    private readonly kpi: KpiService,
  ) {}

  async kpiSummary(maybeUser?: AuthenticatedRequestUser) {
    const user = this.access.requireUser(maybeUser);
    const plantIds = await this.access.plantIdFilter(user);
    if (plantIds?.length === 0) {
      return this.emptySummary();
    }

    const now = new Date();
    const plantWhere: Prisma.PlantWhereInput = plantIds ? { id: { in: plantIds } } : {};
    const workOrderWhere: Prisma.WorkOrderWhereInput = plantIds ? { plantId: { in: plantIds } } : {};
    const [plants, inProgress, criticalAlerts] = await Promise.all([
      this.prisma.plant.findMany({
        where: plantWhere,
        select: { id: true, code: true, name: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.workOrder.count({
        where: { ...workOrderWhere, status: { in: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.PENDING_EVIDENCE] } },
      }),
      this.prisma.workOrder.findMany({
        where: {
          ...workOrderWhere,
          criticality: IssueSeverity.CRITICAL,
          status: { in: ACTIVE_WORK_ORDER_STATUSES },
          plannedEnd: { lt: now },
        },
        select: {
          id: true,
          code: true,
          title: true,
          plannedEnd: true,
          plant: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ plannedEnd: 'asc' }, { createdAt: 'desc' }],
        take: 5,
      }),
    ]);

    const kpis = await Promise.all(plants.map((plant) => this.kpi.plantSummary(plant.id, now)));
    const overdueByPlant = plants
      .map((plant, index) => ({
        plantId: plant.id,
        code: plant.code,
        name: plant.name,
        overdue: kpis[index]?.overdueWorkOrders ?? 0,
      }))
      .filter((row) => row.overdue > 0)
      .sort((left, right) => right.overdue - left.overdue || left.name.localeCompare(right.name));
    const plannedHh = kpis.reduce((sum, row) => sum + row.plannedHours, 0);
    const actualHh = kpis.reduce((sum, row) => sum + row.actualHours, 0);

    return {
      generatedAt: now.toISOString(),
      plantsTotal: plants.length,
      plantsActive: plants.filter((plant) => plant.status === PlantStatus.ACTIVE).length,
      plantsStandby: plants.filter((plant) => plant.status === PlantStatus.STANDBY).length,
      overdueTotal: kpis.reduce((sum, row) => sum + row.overdueWorkOrders, 0),
      overdueByPlant,
      upcoming30d: kpis.reduce((sum, row) => sum + row.upcomingOccurrences30d, 0),
      inProgress,
      plannedHh,
      actualHh,
      hhDeviation: actualHh - plannedHh,
      criticalAlerts: criticalAlerts.map((workOrder) => ({
        id: workOrder.id,
        workOrderId: workOrder.id,
        code: workOrder.code,
        title: workOrder.title,
        plantId: workOrder.plant.id,
        plantCode: workOrder.plant.code,
        plantName: workOrder.plant.name,
        dueAt: workOrder.plannedEnd,
        message: `${workOrder.code} vencida en ${workOrder.plant.name}`,
      })),
    };
  }

  private emptySummary() {
    return {
      generatedAt: new Date().toISOString(),
      plantsTotal: 0,
      plantsActive: 0,
      plantsStandby: 0,
      overdueTotal: 0,
      overdueByPlant: [],
      upcoming30d: 0,
      inProgress: 0,
      plannedHh: 0,
      actualHh: 0,
      hhDeviation: 0,
      criticalAlerts: [],
    };
  }
}
