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

type KksRowForTest = {
  rowNumber: number;
  technicalObject: string;
  superiorObject?: string | null;
  parentEquipmentCode?: string | null;
  nodeType: 'TECHNICAL_LOCATION' | 'EQUIPMENT';
  plantCode?: string | null;
  kks?: string | null;
  kksDescription?: string | null;
  equipmentCode?: string | null;
  equipmentDescription?: string | null;
  planningGroup?: string | null;
  site?: string | null;
  systemStatus?: string | null;
  center?: string | null;
  workCenter?: string | null;
  costCenter?: string | null;
  raw: Record<string, unknown>;
  sourceHash: string;
};

type ResolveKksPlant = (
  row: KksRowForTest,
  cache?: Map<string, { id: string; code: string } | null>,
) => Promise<{ id: string; code: string } | null>;

function createService(overrides: Record<string, unknown>) {
  return new ImportsService(
    overrides as unknown as PrismaService,
  );
}

function kksRow(overrides: Partial<KksRowForTest>): KksRowForTest {
  return {
    rowNumber: 1,
    technicalObject: 'STREAM (ESZS)',
    nodeType: 'TECHNICAL_LOCATION',
    raw: {},
    sourceHash: 'hash',
    ...overrides,
  };
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
        findFirst: vi.fn().mockResolvedValue({
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

describe('ImportsService KKS plant resolution', () => {
  it('links KKS rows to an existing plant inferred from the KKS code', async () => {
    const findUnique = vi.fn().mockImplementation(({ where }: { where: { code: string } }) => {
      if (where.code === 'ESZS-10') {
        return Promise.resolve({ id: 'plant-10', code: 'ESZS-10' });
      }
      return Promise.resolve(null);
    });
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = createService({
      plant: { findUnique },
      plantAlias: { findFirst },
    });
    const resolveKksPlant = Reflect.get(service, 'resolveKksPlant') as ResolveKksPlant;

    const result = await resolveKksPlant.call(
      service,
      kksRow({
        plantCode: 'ESZS',
        kks: 'ESZS-10-ENG10-EG010',
        equipmentCode: '1000069629',
      }),
    );

    expect(result).toEqual({ id: 'plant-10', code: 'ESZS-10' });
    expect(findUnique).toHaveBeenCalledWith({
      where: { code: 'ESZS-10' },
      select: { id: true, code: true },
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('keeps external KKS roots without plant instead of creating master plants', async () => {
    const findUnique = vi.fn();
    const findFirst = vi.fn();
    const service = createService({
      plant: { findUnique },
      plantAlias: { findFirst },
    });
    const resolveKksPlant = Reflect.get(service, 'resolveKksPlant') as ResolveKksPlant;

    const result = await resolveKksPlant.call(
      service,
      kksRow({
        plantCode: 'EGZN',
        kks: 'EGZN-10-BXY10',
        equipmentCode: 'EGZN-10-BXY10',
      }),
    );

    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
