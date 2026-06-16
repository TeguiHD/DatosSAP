import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedRequestUser, PlantAccessService } from '../access/plant-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { KksService } from './kks.service';

type AssetFindManyArgs = { where: { plantId?: { in: string[] }; OR?: unknown[] }; take?: number };
type AssetTreeNode = {
  id: string;
  plantId: string;
  parentId: null;
  nodeType: 'TECHNICAL_LOCATION';
  technicalObject: string;
  kks: string;
  kksDescription: string;
  equipmentCode: null;
  equipmentDescription: null;
  systemStatus: string;
  _count: { children: number };
};

describe('KksService', () => {
  it('loads only one tree level with hasChildren instead of returning the full tree', async () => {
    const findMany = vi.fn<(args: AssetFindManyArgs) => Promise<AssetTreeNode[]>>().mockResolvedValue([
      {
        id: 'asset-1',
        plantId: 'plant-1',
        parentId: null,
        nodeType: 'TECHNICAL_LOCATION',
        technicalObject: 'ESZS-70',
        kks: 'ESZS-70',
        kksDescription: 'Camilo Ferron',
        equipmentCode: null,
        equipmentDescription: null,
        systemStatus: 'ACTIVO',
        _count: { children: 3 },
      },
    ]);
    const prisma = {
      assetKksNode: {
        findMany,
      },
    } as unknown as PrismaService;
    const access = {
      requireUser: vi.fn((user?: AuthenticatedRequestUser) => user as AuthenticatedRequestUser),
      plantIdFilter: vi.fn().mockResolvedValue(['plant-1']),
    } as unknown as PlantAccessService;

    const service = new KksService(prisma, access);
    const result = await service.tree({ plantId: 'plant-1', parentId: '' }, { userId: 'admin-1', role: Role.ADMIN }, true);

    const firstCall = findMany.mock.calls[0]?.[0];
    expect(firstCall?.where.plantId).toEqual({ in: ['plant-1'] });
    expect(Array.isArray(firstCall?.where.OR)).toBe(true);
    expect(firstCall?.take).toBe(50);
    expect(result).toEqual([expect.objectContaining({ id: 'asset-1', hasChildren: true })]);
  });
});
