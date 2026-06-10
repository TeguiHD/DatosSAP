import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface DryRunPayload {
  file_type: string;
  created: number;
  errors: number;
  issues: { code: string; severity: string }[];
  metadata: Record<string, unknown>;
}

const repoRoot = resolve(__dirname, '../../..');
const importer = resolve(repoRoot, 'apps/importer/main.py');
const posiciones = resolve(repoRoot, '../Copia de Posiciones de mantenimiento ESSC Sur (17-04-2026).xlsx');
const kks = resolve(repoRoot, '../archivo-versiones-antiguas/26MayoPRUEBAPOWERBI/Arbol Jerarquico ESSC 2026 (Fiori).xlsx');

function dryRun(file: string, type: string) {
  const stdout = execFileSync('python3', [importer, 'dry-run', '--file', file, '--type', type], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout) as DryRunPayload;
}

describe('industrial Excel importer contract', () => {
  it('reads Posiciones ESSC Sur with cached formulas and blocks CEMIN', () => {
    const result = dryRun(posiciones, 'POSICIONES_ESSC_SUR');

    expect(result.metadata.templates).toBe(283);
    expect(result.metadata.month_columns).toBe(96);
    expect(result.metadata.occurrences).toBe(3061);
    expect(result.issues.some((issue) => issue.code === 'CEMIN_ALIAS_REQUIRED' && issue.severity === 'CRITICAL')).toBe(true);
  });

  it('reads KKS Fiori as the asset master', () => {
    const result = dryRun(kks, 'KKS_FIORI');

    expect(result.metadata.rows).toBe(4837);
    expect(result.file_type).toBe('KKS_FIORI');
  });
});
