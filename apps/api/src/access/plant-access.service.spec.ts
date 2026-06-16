import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PlantAccessService } from './plant-access.service';

type FindUniqueScopeArgs = { where: { userId_plantId: { plantId: string } } };

function serviceWithScopes(scopes: string[]) {
  const prisma = {
    userPlantScope: {
      findMany: vi.fn().mockResolvedValue(scopes.map((plantId) => ({ plantId }))),
      findUnique: vi.fn((args: FindUniqueScopeArgs) =>
        Promise.resolve(scopes.includes(args.where.userId_plantId.plantId) ? { id: 'scope-1' } : null),
      ),
    },
  } as unknown as PrismaService;
  return new PlantAccessService(prisma);
}

describe('PlantAccessService', () => {
  it('does not filter SUPERADMIN or ADMIN by plant scope', async () => {
    const service = serviceWithScopes([]);
    await expect(service.plantIdFilter({ userId: 'u1', role: Role.SUPERADMIN })).resolves.toBeNull();
    await expect(service.plantIdFilter({ userId: 'u1', role: Role.ADMIN }, 'plant-1')).resolves.toEqual(['plant-1']);
  });

  it('limits scoped roles to UserPlantScope and returns empty for missing scope', async () => {
    const service = serviceWithScopes(['plant-1']);
    await expect(service.plantIdFilter({ userId: 'u1', role: Role.SUPERVISOR })).resolves.toEqual(['plant-1']);
    await expect(service.plantIdFilter({ userId: 'u1', role: Role.CLIENTE_VIEWER }, 'plant-2')).resolves.toEqual([]);
  });

  it('returns 404-style errors for detail access outside scope', async () => {
    const service = serviceWithScopes(['plant-1']);
    await expect(service.ensurePlantAccess('plant-2', { userId: 'u1', role: Role.CLIENTE_VIEWER })).rejects.toBeInstanceOf(NotFoundException);
  });
});
