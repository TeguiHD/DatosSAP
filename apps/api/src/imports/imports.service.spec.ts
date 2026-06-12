import { IssueSeverity } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ImportsService } from './imports.service';

type FindAsset = (
  equipmentCode?: string | null,
  technicalObject?: string | null,
  sourcePlantCode?: string | null,
  canonicalPlantCode?: string | null,
) => Promise<{ id: string } | null>;

type ExcludeResolvedIssues = (
  issues: {
    severity: IssueSeverity;
    code: string;
    message: string;
  }[],
) => Promise<
  {
    severity: IssueSeverity;
    code: string;
    message: string;
  }[]
>;

function createService(overrides: Record<string, unknown>) {
  return new ImportsService(
    overrides as unknown as PrismaService,
  );
}

describe('ImportsService Posiciones contract', () => {
  it('resolves equipment before technical object without using KKS', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'asset-1' });
    const service = createService({
      assetKksNode: { findFirst },
    });
    const findAsset = Reflect.get(
      service,
      'findAsset',
    ) as FindAsset;

    await findAsset.call(
      service,
      'ESZS-A1-EQU10',
      'ESZS-A1-LOC10',
      'ESZS-A1',
      'ESZS-B2',
    );

    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { equipmentCode: 'ESZS-B2-EQU10' },
    });
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        OR: [
          { equipmentCode: 'ESZS-B2-LOC10' },
          { technicalObject: 'ESZS-B2-LOC10' },
        ],
      },
    });
    expect(JSON.stringify(findFirst.mock.calls)).not.toContain(
      '"kks"',
    );
  });

  it('removes the CEMIN blocker only after its alias exists', async () => {
    const issues = [
      {
        severity: IssueSeverity.CRITICAL,
        code: 'CEMIN_ALIAS_REQUIRED',
        message: 'Alias requerido',
      },
      {
        severity: IssueSeverity.WARNING,
        code: 'POSITIONS_ASSET_CONTEXT_MISSING',
        message: 'Activo pendiente',
      },
    ];
    const service = createService({
      importMapping: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      plantAlias: {
        findUnique: vi.fn().mockResolvedValue({
          plantId: 'plant-cemin',
        }),
      },
    });
    const excludeResolvedIssues = Reflect.get(
      service,
      'excludeResolvedIssues',
    ) as ExcludeResolvedIssues;

    const result = await excludeResolvedIssues.call(
      service,
      issues,
    );

    expect(result).toEqual([issues[1]]);
  });
});
