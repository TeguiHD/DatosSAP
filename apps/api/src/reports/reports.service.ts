import { Injectable } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async executive(query: { plantId?: string }) {
    const where = query.plantId ? { plantId: query.plantId } : {};
    const [totalWorkOrders, closedWorkOrders, signedWorkOrders, overdueWorkOrders, hours, plants] = await Promise.all([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.count({ where: { ...where, status: { in: [WorkOrderStatus.CLOSED, WorkOrderStatus.SIGNED] } } }),
      this.prisma.workOrder.count({ where: { ...where, status: WorkOrderStatus.SIGNED } }),
      this.prisma.workOrder.count({
        where: { ...where, plannedEnd: { lt: new Date() }, status: { notIn: [WorkOrderStatus.CLOSED, WorkOrderStatus.SIGNED, WorkOrderStatus.CANCELLED] } },
      }),
      this.prisma.workOrder.aggregate({ where, _sum: { plannedHours: true } }),
      this.prisma.plant.findMany({
        where: query.plantId ? { id: query.plantId } : {},
        include: { client: true, _count: { select: { workOrders: true, occurrences: true, assetNodes: true } } },
        orderBy: [{ healthScore: 'asc' }, { name: 'asc' }],
        take: 50,
      }),
    ]);
    const actualHours = await this.prisma.hhEntry.aggregate({
      where: query.plantId ? { workOrder: { plantId: query.plantId } } : {},
      _sum: { hours: true },
    });

    return {
      generatedAt: new Date().toISOString(),
      totalWorkOrders,
      closedWorkOrders,
      signedWorkOrders,
      overdueWorkOrders,
      plannedHours: hours._sum.plannedHours ?? 0,
      actualHours: actualHours._sum.hours ?? 0,
      compliance: totalWorkOrders > 0 ? Math.round((closedWorkOrders / totalWorkOrders) * 100) : null,
      plants,
    };
  }

  async exportCsv(query: { plantId?: string }) {
    const rows = await this.prisma.workOrder.findMany({
      where: query.plantId ? { plantId: query.plantId } : {},
      include: { plant: { include: { client: true } }, assetNode: true, hhEntries: true, evidenceFiles: true },
      orderBy: [{ plannedStart: 'asc' }, { createdAt: 'desc' }],
      take: 1000,
    });
    const header = ['codigo', 'planta', 'cliente', 'titulo', 'estado', 'hh_plan', 'hh_real', 'evidencias'];
    const body = rows.map((row) =>
      [
        row.code,
        row.plant.name,
        row.plant.client.name,
        row.title,
        row.status,
        String(row.plannedHours ?? 0),
        String(row.hhEntries.reduce((sum, entry) => sum + entry.hours, 0)),
        String(row.evidenceFiles.length),
      ]
        .map((value) => `"${value.replaceAll('"', '""')}"`)
        .join(','),
    );
    return [header.join(','), ...body].join('\n');
  }
}
