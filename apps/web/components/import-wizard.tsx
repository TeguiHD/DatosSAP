'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Play, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiUrl } from '@/lib/api';

type FileType = 'KKS_FIORI' | 'POSICIONES_ESSC_SUR' | 'PLANES_MANTENCION';

interface ImportJob {
  id: string;
  originalName: string;
  fileType: FileType;
  status: string;
  dryRun?: {
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
    metadata?: Record<string, unknown>;
  };
  issues?: {
    id: string;
    severity: string;
    code: string;
    message: string;
    rowNumber?: number | null;
    resolvedAt?: string | null;
  }[];
}

const defaultFiles: Record<FileType, string> = {
  KKS_FIORI: '../26MayoPRUEBAPOWERBI/Arbol Jerarquico ESSC 2026 (Fiori).xlsx',
  POSICIONES_ESSC_SUR: '../Copia de Posiciones de mantenimiento ESSC Sur (17-04-2026).xlsx',
  PLANES_MANTENCION: '../26MayoPRUEBAPOWERBI/Planes_Mantencion_ESSC.xlsx',
};

export function ImportWizard() {
  const [fileType, setFileType] = useState<FileType>('POSICIONES_ESSC_SUR');
  const [storageKey, setStorageKey] = useState(defaultFiles.POSICIONES_ESSC_SUR);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createJob() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(apiUrl('/import/jobs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalName: storageKey, storageKey, fileType }),
      });
      if (!response.ok) throw new Error(await response.text());
      setJob((await response.json()) as ImportJob);
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : 'No se pudo crear el job');
    } finally {
      setPending(false);
    }
  }

  async function runJob(action: 'dry-run' | 'apply') {
    if (!job) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/import/jobs/${job.id}/${action}`), { method: 'POST' });
      if (!response.ok) throw new Error(await response.text());
      setJob((await response.json()) as ImportJob);
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : 'No se pudo ejecutar la accion');
    } finally {
      setPending(false);
    }
  }

  async function resolveCemin(issueId: string) {
    if (!job) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/import/jobs/${job.id}/resolve-issue`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId,
          resolution: {
            sourceValue: 'ESZS-A1',
            targetPlantCode: 'ESZS-B2',
            sourceType: 'PLANT_ALIAS',
            notes: 'Homologacion CEMIN validada para importacion inicial',
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const refreshed = await fetch(apiUrl(`/import/jobs/${job.id}`));
      if (refreshed.ok) setJob((await refreshed.json()) as ImportJob);
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : 'No se pudo resolver CEMIN');
    } finally {
      setPending(false);
    }
  }

  const criticalOpen = job?.issues?.some((issue) => issue.severity === 'CRITICAL' && !issue.resolvedAt) ?? false;

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert className="border-red-200 bg-red-50 text-red-950">
          <AlertTitle>Error de importacion</AlertTitle>
          <AlertDescription className="text-red-900">{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Wizard de importacion local</CardTitle>
          <CardDescription>Para producción se reemplaza ruta local por upload privado; el contrato dry-run/apply ya queda activo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[220px_1fr_auto]">
          <Select
            value={fileType}
            onValueChange={(value) => {
              const next = value as FileType;
              setFileType(next);
              setStorageKey(defaultFiles[next]);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tipo de Excel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="KKS_FIORI">KKS Fiori</SelectItem>
              <SelectItem value="POSICIONES_ESSC_SUR">Posiciones ESSC Sur</SelectItem>
              <SelectItem value="PLANES_MANTENCION">Planes Mantencion</SelectItem>
            </SelectContent>
          </Select>
          <Input value={storageKey} onChange={(event) => setStorageKey(event.target.value)} placeholder="../archivo.xlsx" />
          <Button onClick={createJob} disabled={pending}>
            <FileUp data-icon="inline-start" aria-hidden="true" />
            Crear job
          </Button>
        </CardContent>
      </Card>

      {job ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>{job.originalName}</CardTitle>
                <CardDescription>Estado: {job.status}</CardDescription>
              </div>
              <Badge variant={job.status === 'BLOCKED' ? 'danger' : 'secondary'}>{job.fileType}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Button variant="outline" onClick={() => runJob('dry-run')} disabled={pending}>
                <Play data-icon="inline-start" aria-hidden="true" />
                Dry-run
              </Button>
              <Button onClick={() => runJob('apply')} disabled={pending || criticalOpen}>
                <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
                Aplicar
              </Button>
              {criticalOpen ? (
                <Button variant="destructive" onClick={() => resolveCemin(job.issues?.find((issue) => issue.severity === 'CRITICAL' && !issue.resolvedAt)?.id ?? '')} disabled={pending}>
                  <ShieldAlert data-icon="inline-start" aria-hidden="true" />
                  Resolver CEMIN
                </Button>
              ) : null}
            </div>

            {job.dryRun ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label="Creados" value={job.dryRun.created ?? 0} />
                <Metric label="Actualizados" value={job.dryRun.updated ?? 0} />
                <Metric label="Omitidos" value={job.dryRun.skipped ?? 0} />
                <Metric label="Errores" value={job.dryRun.errors ?? 0} />
              </div>
            ) : null}

            {job.issues?.length ? (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severidad</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Fila</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {job.issues.map((issue) => (
                      <TableRow key={issue.id}>
                        <TableCell>
                          <Badge variant={severityVariant(issue.severity)}>{issue.severity}</Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{issue.code}</p>
                          <p className="text-sm text-muted-foreground">{issue.message}</p>
                        </TableCell>
                        <TableCell className="font-mono">{issue.rowNumber ?? 'N/D'}</TableCell>
                        <TableCell>{issue.resolvedAt ? 'Resuelto' : 'Pendiente'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ejecuta dry-run para ver issues y auditoría previa.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Primero crea un job</AlertTitle>
          <AlertDescription>El flujo correcto es crear job, dry-run, resolver conflictos y aplicar.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-mono text-2xl font-semibold">{value}</p>
    </div>
  );
}

function severityVariant(severity: string): BadgeProps['variant'] {
  if (severity === 'CRITICAL') return 'danger';
  if (severity === 'WARNING') return 'warning';
  return 'info';
}
