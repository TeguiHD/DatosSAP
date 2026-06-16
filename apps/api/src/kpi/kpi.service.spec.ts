import { WorkOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { KpiService } from './kpi.service';

type WorkOrderForKpi = {
  id: string;
  status: WorkOrderStatus;
  plannedEnd: Date;
  plannedHours: number;
  actualHours: number;
};
type KpiUpsertArgs = {
  update: {
    overdueWorkOrders: number;
    upcomingOccurrences30d: number;
    plannedHours: number;
    actualHours: number;
    refreshedAt: Date;
  };
};

describe('KpiService', () => {
  it('uses a fresh KpiDailySummary cache based on refreshedAt', async () => {
    const cached = {
      plantId: 'plant-1',
      day: new Date('2026-06-15T00:00:00.000Z'),
      refreshedAt: new Date('2026-06-15T11:59:00.000Z'),
    };
    const workOrderFindMany = vi.fn<() => Promise<WorkOrderForKpi[]>>();
    const prisma = {
      kpiDailySummary: { findUnique: vi.fn().mockResolvedValue(cached) },
      workOrder: { findMany: workOrderFindMany },
    } as unknown as PrismaService;

    const service = new KpiService(prisma);
    await expect(service.plantSummary('plant-1', new Date('2026-06-15T12:00:00.000Z'))).resolves.toBe(cached);
    expect(workOrderFindMany).not.toHaveBeenCalled();
  });

  it('recalculates and persists stale KPI summaries', async () => {
    const upserted = {
      plantId: 'plant-1',
      overdueWorkOrders: 1,
      upcomingOccurrences30d: 7,
      plannedHours: 15,
      actualHours: 6,
      healthScore: 88,
      refreshedAt: new Date('2026-06-15T12:00:00.000Z'),
    };
    const upsert = vi.fn<(args: KpiUpsertArgs) => Promise<typeof upserted>>().mockResolvedValue(upserted);
    const prisma = {
      kpiDailySummary: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert,
      },
      workOrder: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'wo-1', status: WorkOrderStatus.IN_PROGRESS, plannedEnd: new Date('2026-06-14T12:00:00.000Z'), plannedHours: 10, actualHours: 3 },
          { id: 'wo-2', status: WorkOrderStatus.ASSIGNED, plannedEnd: new Date('2026-06-16T12:00:00.000Z'), plannedHours: 5, actualHours: 2 },
        ]),
      },
      hhEntry: {
        groupBy: vi.fn().mockResolvedValue([{ workOrderId: 'wo-1', _sum: { hours: 4 } }]),
      },
      maintenanceOccurrence: {
        count: vi.fn().mockResolvedValue(7),
      },
      plant: {
        findUnique: vi.fn().mockResolvedValue({ healthScore: 88 }),
      },
    } as unknown as PrismaService;

    const service = new KpiService(prisma);
    await expect(service.plantSummary('plant-1', new Date('2026-06-15T12:00:00.000Z'))).resolves.toBe(upserted);
    const firstCall = upsert.mock.calls[0]?.[0];
    expect(firstCall?.update).toMatchObject({
      overdueWorkOrders: 1,
      upcomingOccurrences30d: 7,
      plannedHours: 15,
      actualHours: 6,
      refreshedAt: new Date('2026-06-15T12:00:00.000Z'),
    });
  });
});
