import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface MonthQuery {
  year: number;
  month: number;
  plantId?: string;
}

interface RangeQuery {
  from?: string;
  to?: string;
  plantId?: string;
  groupBy?: string;
}

@Injectable()
export class PlanningService {
  constructor(private readonly prisma: PrismaService) {}

  async month(query: MonthQuery) {
    const from = new Date(Date.UTC(query.year, query.month - 1, 1));
    const to = new Date(Date.UTC(query.year, query.month, 1));
    const where: Prisma.MaintenanceOccurrenceWhereInput = {
      scheduledFor: { gte: from, lt: to },
    };
    if (query.plantId) {
      where.plantId = query.plantId;
    }
    return this.prisma.maintenanceOccurrence.findMany({
      where,
      include: { plant: { include: { client: true } }, template: true, workOrder: true },
      orderBy: { scheduledFor: 'asc' },
      take: 500,
    });
  }

  async list(query: RangeQuery) {
    const scheduledFor: Prisma.DateTimeFilter<'MaintenanceOccurrence'> = {};
    if (query.from) {
      scheduledFor.gte = new Date(query.from);
    }
    if (query.to) {
      scheduledFor.lte = new Date(query.to);
    }
    const where: Prisma.MaintenanceOccurrenceWhereInput = {};
    if (query.plantId) {
      where.plantId = query.plantId;
    }
    if (query.from || query.to) {
      where.scheduledFor = scheduledFor;
    }
    return this.prisma.maintenanceOccurrence.findMany({
      where,
      include: { plant: { include: { client: true } }, template: true, workOrder: true },
      orderBy: { scheduledFor: 'asc' },
      take: 200,
    });
  }

  async gantt(query: RangeQuery) {
    const rows = await this.list(query);
    return {
      groupBy: query.groupBy ?? 'plant',
      rows: rows.map((row) => ({
        id: row.id,
        group: row.plant.name,
        title: row.template.activityName,
        start: row.scheduledFor,
        end: row.scheduledFor,
        status: row.status,
      })),
    };
  }
}
