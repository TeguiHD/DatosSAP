import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedRequestUser, PlantAccessService } from '../access/plant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersService } from './work-orders.service';

type WorkOrderFindManyArgs = {
  where: {
    plantId?: { in: string[] };
    AND?: unknown[];
  };
};

describe('WorkOrdersService', () => {
  it('keeps TECNICO work-order lists limited to their assigned orders', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn<(args: WorkOrderFindManyArgs) => Promise<never[]>>().mockResolvedValue([]);
    const prisma = {
      $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
      workOrder: { count, findMany },
    } as unknown as PrismaService;
    const access = {
      requireUser: vi.fn((user?: AuthenticatedRequestUser) => user as AuthenticatedRequestUser),
      plantIdFilter: vi.fn().mockResolvedValue(['plant-1']),
    } as unknown as PlantAccessService;

    const service = new WorkOrdersService(prisma, access);
    const result = await service.list({ page: '1', limit: '10' }, { userId: 'tech-1', role: Role.TECNICO });

    expect(result).toEqual({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });
    const firstCall = findMany.mock.calls[0]?.[0];
    expect(firstCall?.where.plantId).toEqual({ in: ['plant-1'] });
    expect(JSON.stringify(firstCall?.where.AND)).toContain('tech-1');
    expect(JSON.stringify(firstCall?.where.AND)).toContain('assignedUserId');
  });
});
