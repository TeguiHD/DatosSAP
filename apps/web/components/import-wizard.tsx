'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Play,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';

type FileType = 'KKS_FIORI' | 'POSICIONES_ESSC_SUR' | 'PLANES_MANTENCION';
type ImportStatus = 'UPLOADED' | 'MAPPED' | 'DRY_RUN_READY' | 'BLOCKED' | 'APPLYING' | 'APPLIED' | 'FAILED';
type StepKey = 'upload' | 'preview' | 'mapping' | 'analysis' | 'issues' | 'apply' | 'result';

interface ImportJob {
  id: string;
  originalName: string;
  fileType: FileType;
  status: ImportStatus;
  dryRun?: {
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
    metadata?: Record<string, unknown>;
  };
  issues?: ImportIssue[];
}

interface ImportIssue {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  code: string;
  message: string;
  rowNumber?: number | null;
  resolvedAt?: string | null;
}

interface PreviewPayload {
  fileType: FileType;
  sheet: string;
  headers: string[];
  rows: unknown[][];
}

interface ProgressPayload {
  status: ImportStatus;
  phase: string;
  progress: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  openCritical: number;
  terminal: boolean;
}

interface PlantOption {
  id: string;
  name: string;
  client: { name: string };
}

const steps: { key: StepKey; label: string }[] = [
  { key: 'upload', label: 'Subir archivo' },
  { key: 'preview', label: 'Vista previa' },
  { key: 'mapping', label: 'Mapeo' },
  { key: 'analysis', label: 'Analisis' },
  { key: 'issues', label: 'Resolver conflictos' },
  { key: 'apply', label: 'Aplicar' },
  { key: 'result', label: 'Resultado' },
];

const fileTypeLabels: Record<FileType, string> = {
  KKS_FIORI: 'Arbol KKS Fiori',
  POSICIONES_ESSC_SUR: 'Posiciones ESSC Sur',
  PLANES_MANTENCION: 'Planes de mantencion',
};

const statusLabels: Record<ImportStatus, string> = {
  UPLOADED: 'Archivo recibido',
  MAPPED: 'Procesando',
  DRY_RUN_READY: 'Analisis listo',
  BLOCKED: 'Bloqueado por conflictos',
  APPLYING: 'Aplicando',
  APPLIED: 'Aplicado',
  FAILED: 'Fallido',
};

export function ImportWizard() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [step, setStep] = useState<StepKey>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentStepIndex = steps.findIndex((item) => item.key === step);

  const openCriticalIssues = useMemo(
    () => job?.issues?.filter((issue) => issue.severity === 'CRITICAL' && !issue.resolvedAt) ?? [],
    [job?.issues],
  );
  const hasOpenCritical = openCriticalIssues.length > 0;

  const setSafeError = useCallback((value: unknown, fallback: string) => {
    setError(value instanceof Error ? sanitizeText(value.message) : fallback);
  }, []);

  const refreshJob = useCallback(async (jobId: string) => {
    const response = await fetch(apiUrl(`/import/jobs/${jobId}`));
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const nextJob = (await response.json()) as ImportJob;
    setJob(nextJob);
    return nextJob;
  }, []);

  const loadPlants = useCallback(async () => {
    const response = await fetch(apiUrl('/plants'));
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    setPlants((await response.json()) as PlantOption[]);
  }, []);

  const uploadFile = useCallback(async () => {
    if (!file) {
      setError('Selecciona un archivo Excel para continuar.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(apiUrl('/import/jobs'), {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const created = (await response.json()) as ImportJob;
      setJob(created);
      const previewResponse = await fetch(apiUrl(`/import/jobs/${created.id}/preview`));
      if (!previewResponse.ok) {
        throw new Error(await readError(previewResponse));
      }
      setPreview((await previewResponse.json()) as PreviewPayload);
      setStep('preview');
    } catch (uploadError) {
      setSafeError(uploadError, 'No se pudo subir el archivo.');
    } finally {
      setPending(false);
    }
  }, [file, setSafeError]);

  const startSse = useCallback(
    (jobId: string, action: 'dry-run' | 'apply') => {
      eventSourceRef.current?.close();
      const source = new EventSource(apiUrl(`/import/jobs/${jobId}/progress`));
      eventSourceRef.current = source;
      source.onmessage = async (event) => {
        const data = JSON.parse(event.data as string) as ProgressPayload;
        setProgress(data);
        if (!data.terminal) {
          return;
        }
        source.close();
        eventSourceRef.current = null;
        const nextJob = await refreshJob(jobId);
        setPending(false);
        if (data.status === 'FAILED') {
          setStep(action === 'apply' ? 'apply' : 'analysis');
          setError('La importacion fallo. Revisa el archivo y vuelve a ejecutar.');
          return;
        }
        if (action === 'dry-run') {
          if (nextJob.issues?.some((issue) => issue.severity === 'CRITICAL' && !issue.resolvedAt)) {
            await loadPlants();
            setStep('issues');
            return;
          }
          setStep('apply');
          return;
        }
        setStep('result');
      };
      source.onerror = () => {
        source.close();
        eventSourceRef.current = null;
        setPending(false);
        setError('Se perdio la conexion de progreso. Actualiza el estado del job.');
      };
    },
    [loadPlants, refreshJob],
  );

  const runDryRun = useCallback(async () => {
    if (!job) return;
    setPending(true);
    setError(null);
    setProgress({ status: 'MAPPED', phase: 'Analizando archivo', progress: 18, created: 0, updated: 0, skipped: 0, errors: 0, openCritical: 0, terminal: false });
    try {
      const response = await fetch(apiUrl(`/import/jobs/${job.id}/dry-run`), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setStep('analysis');
      startSse(job.id, 'dry-run');
    } catch (dryRunError) {
      setPending(false);
      setSafeError(dryRunError, 'No se pudo ejecutar el analisis.');
    }
  }, [job, setSafeError, startSse]);

  const resolveCriticalIssue = useCallback(async () => {
    if (!job || !openCriticalIssues[0] || !selectedPlantId) {
      setError('Selecciona la planta correcta para continuar.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/import/jobs/${job.id}/resolve-issue`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: openCriticalIssues[0].id,
          sourceValue: 'ESZS-A1',
          targetPlantId: selectedPlantId,
          sourceType: 'PLANT_ALIAS',
          source: 'EXCEL_POSICIONES_ESSC_SUR',
          reason: 'Homologacion manual validada desde el wizard de importacion',
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      await refreshJob(job.id);
      await runDryRun();
    } catch (resolveError) {
      setPending(false);
      setSafeError(resolveError, 'No se pudo resolver el conflicto.');
    }
  }, [job, openCriticalIssues, refreshJob, runDryRun, selectedPlantId, setSafeError]);

  const applyImport = useCallback(async () => {
    if (!job) return;
    setPending(true);
    setError(null);
    setProgress({ status: 'APPLYING', phase: 'Aplicando cambios', progress: 35, created: 0, updated: 0, skipped: 0, errors: 0, openCritical: 0, terminal: false });
    try {
      const response = await fetch(apiUrl(`/import/jobs/${job.id}/apply`), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      startSse(job.id, 'apply');
    } catch (applyError) {
      setPending(false);
      setSafeError(applyError, 'No se pudo aplicar la importacion.');
    }
  }, [job, setSafeError, startSse]);

  return (
    <div className="flex flex-col gap-6">
      <StepRail currentStepIndex={currentStepIndex} />

      {error ? (
        <Alert variant="danger">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Atencion requerida</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === 'upload' ? (
        <UploadStep file={file} pending={pending} onFile={setFile} onUpload={uploadFile} />
      ) : null}

      {step === 'preview' && job && preview ? (
        <PreviewStep job={job} preview={preview} onBack={() => setStep('upload')} onNext={() => setStep('mapping')} />
      ) : null}

      {step === 'mapping' && job ? (
        <MappingStep job={job} pending={pending} onBack={() => setStep('preview')} onAnalyze={runDryRun} />
      ) : null}

      {step === 'analysis' ? (
        <AnalysisStep progress={progress} job={job} pending={pending} />
      ) : null}

      {step === 'issues' && job ? (
        <IssuesStep
          issues={openCriticalIssues}
          plants={plants}
          selectedPlantId={selectedPlantId}
          pending={pending}
          onPlant={setSelectedPlantId}
          onResolve={resolveCriticalIssue}
        />
      ) : null}

      {step === 'apply' && job ? (
        <ApplyStep job={job} pending={pending} hasOpenCritical={hasOpenCritical} onBack={() => setStep('issues')} onApply={applyImport} />
      ) : null}

      {step === 'result' && job ? (
        <ResultStep job={job} progress={progress} />
      ) : null}
    </div>
  );
}

function StepRail({ currentStepIndex }: { currentStepIndex: number }) {
  return (
    <Card>
      <CardContent className="grid gap-2 pt-4 sm:grid-cols-7 sm:pt-5">
        {steps.map((item, index) => {
          const active = index === currentStepIndex;
          const complete = index < currentStepIndex;
          return (
            <div
              key={item.key}
              className={cn(
                'flex min-h-12 items-center gap-2 rounded-md border px-3 py-2 text-sm',
                active && 'border-primary bg-primary text-primary-foreground',
                complete && 'border-transparent bg-muted text-foreground',
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs">
                {index + 1}
              </span>
              <span className="truncate">{item.label}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function UploadStep({
  file,
  pending,
  onFile,
  onUpload,
}: {
  file: File | null;
  pending: boolean;
  onFile: (file: File | null) => void;
  onUpload: () => void;
}) {
  const acceptFile = (candidate?: File) => {
    if (!candidate) return;
    if (!/\.(xlsx|xlsm)$/i.test(candidate.name)) return;
    onFile(candidate);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subir Excel industrial</CardTitle>
        <CardDescription>El archivo queda en almacenamiento privado, luego se analiza antes de tocar datos operacionales.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label
          className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/35 px-4 py-8 text-center transition-colors hover:bg-muted focus-within:ring-2 focus-within:ring-ring"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            acceptFile(event.dataTransfer.files[0]);
          }}
        >
          <UploadCloud aria-hidden="true" />
          <span className="text-base font-medium">Arrastra el archivo o seleccionalo desde tu equipo</span>
          <span className="text-sm text-muted-foreground">Formatos aceptados: .xlsx y .xlsm</span>
          <input
            type="file"
            accept=".xlsx,.xlsm"
            className="sr-only"
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />
        </label>

        {file ? (
          <div className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex min-w-0 items-center gap-2">
              <FileSpreadsheet aria-hidden="true" />
              <span className="truncate font-medium">{file.name}</span>
            </span>
            <Badge variant="secondary">{formatBytes(file.size)}</Badge>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onUpload} disabled={!file || pending}>
            <FileUp data-icon="inline-start" aria-hidden="true" />
            Subir y continuar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewStep({
  job,
  preview,
  onBack,
  onNext,
}: {
  job: ImportJob;
  preview: PreviewPayload;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista previa del archivo</CardTitle>
        <CardDescription>
          {fileTypeLabels[job.fileType]} · Hoja detectada: {sanitizeText(preview.sheet)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {preview.headers.slice(0, 8).map((header, index) => (
                  <TableHead key={`${header}-${index}`}>{sanitizeText(header)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.slice(0, 10).map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {preview.headers.slice(0, 8).map((_, columnIndex) => (
                    <TableCell key={columnIndex} className="max-w-48 truncate">
                      {sanitizeCell(row[columnIndex])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <FooterActions onBack={onBack} onNext={onNext} nextLabel="Confirmar vista previa" />
      </CardContent>
    </Card>
  );
}

function MappingStep({
  job,
  pending,
  onBack,
  onAnalyze,
}: {
  job: ImportJob;
  pending: boolean;
  onBack: () => void;
  onAnalyze: () => void;
}) {
  const mappingRows = getMappingRows(job.fileType);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapeo automatico</CardTitle>
        <CardDescription>El tipo de Excel fue reconocido. No hay configuracion manual en esta etapa.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <MappingMetric label="Tipo detectado" value={fileTypeLabels[job.fileType]} />
          <MappingMetric label="Destino principal" value={mappingRows[0]?.target ?? 'Modelo operacional'} />
          <MappingMetric label="Regla" value="Dry-run obligatorio" />
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Origen</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Validacion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappingRows.map((row) => (
                <TableRow key={row.source}>
                  <TableCell>{row.source}</TableCell>
                  <TableCell>{row.target}</TableCell>
                  <TableCell>{row.validation}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={onBack}>Volver</Button>
          <Button onClick={onAnalyze} disabled={pending}>
            <Play data-icon="inline-start" aria-hidden="true" />
            Iniciar analisis
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalysisStep({ progress, job, pending }: { progress: ProgressPayload | null; job: ImportJob | null; pending: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Analisis de importacion</CardTitle>
        <CardDescription>{progress?.phase ?? 'Preparando worker de importacion'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Progress value={progress?.progress ?? 16} />
        {pending || !progress?.terminal ? (
          <LoadingSkeleton variant="cards" />
        ) : null}
        <ResultMetrics
          created={progress?.created ?? job?.dryRun?.created ?? 0}
          updated={progress?.updated ?? job?.dryRun?.updated ?? 0}
          skipped={progress?.skipped ?? job?.dryRun?.skipped ?? 0}
          errors={progress?.errors ?? job?.dryRun?.errors ?? 0}
        />
      </CardContent>
    </Card>
  );
}

function IssuesStep({
  issues,
  plants,
  selectedPlantId,
  pending,
  onPlant,
  onResolve,
}: {
  issues: ImportIssue[];
  plants: PlantOption[];
  selectedPlantId: string;
  pending: boolean;
  onPlant: (value: string) => void;
  onResolve: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resolver conflictos críticos</CardTitle>
        <CardDescription>El apply queda bloqueado hasta que estos conflictos se resuelvan.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="danger">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Catálogo de plantas requiere confirmacion</AlertTitle>
          <AlertDescription>
            Se encontró un código de planta que no coincide con el catálogo. Selecciona la planta correcta para continuar.
          </AlertDescription>
        </Alert>

        {issues.map((issue) => (
          <div key={issue.id} className="rounded-md border bg-background p-3">
            <p className="font-medium">Conflicto pendiente</p>
            <p className="text-sm text-muted-foreground">{friendlyIssueMessage(issue)}</p>
          </div>
        ))}

        <div className="grid gap-2">
          <span className="text-sm font-medium">Planta correcta</span>
          <Select value={selectedPlantId} onValueChange={onPlant}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona planta destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {plants.map((plant) => (
                  <SelectItem key={plant.id} value={plant.id}>
                    {plant.name} · {plant.client.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Badge variant={severityVariant(issues[0]?.severity ?? 'CRITICAL')}>Bloqueante</Badge>
          <Button onClick={onResolve} disabled={!selectedPlantId || pending}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            Resolver y re-analizar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApplyStep({
  job,
  pending,
  hasOpenCritical,
  onBack,
  onApply,
}: {
  job: ImportJob;
  pending: boolean;
  hasOpenCritical: boolean;
  onBack: () => void;
  onApply: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aplicar importacion</CardTitle>
        <CardDescription>Esta accion escribe en modelos operacionales. El dry-run queda registrado como evidencia.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ResultMetrics
          created={job.dryRun?.created ?? 0}
          updated={job.dryRun?.updated ?? 0}
          skipped={job.dryRun?.skipped ?? 0}
          errors={job.dryRun?.errors ?? 0}
        />
        {hasOpenCritical ? (
          <Alert variant="danger">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>No se puede aplicar</AlertTitle>
            <AlertDescription>Existen conflictos criticos pendientes de resolver.</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={onBack} disabled={!hasOpenCritical}>Volver a conflictos</Button>
          <Button onClick={onApply} disabled={pending || hasOpenCritical}>
            <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
            Aplicar datos
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultStep({ job, progress }: { job: ImportJob; progress: ProgressPayload | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultado de importacion</CardTitle>
        <CardDescription>{statusLabels[job.status]} · {fileTypeLabels[job.fileType]}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Importacion completada</AlertTitle>
          <AlertDescription>Los datos quedaron disponibles para las vistas operacionales correspondientes.</AlertDescription>
        </Alert>
        <ResultMetrics
          created={progress?.created ?? job.dryRun?.created ?? 0}
          updated={progress?.updated ?? job.dryRun?.updated ?? 0}
          skipped={progress?.skipped ?? job.dryRun?.skipped ?? 0}
          errors={progress?.errors ?? job.dryRun?.errors ?? 0}
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <Button asChild variant="outline">
            <Link href="/plantas">Ver plantas</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/activos">Ver activos</Link>
          </Button>
          <Button asChild>
            <Link href="/planificacion">Ver planificacion</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultMetrics({ created, updated, skipped, errors }: { created: number; updated: number; skipped: number; errors: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Metric label="Creados" value={created} />
      <Metric label="Actualizados" value={updated} />
      <Metric label="Omitidos" value={skipped} />
      <Metric label="Conflictos" value={errors} />
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

function MappingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function FooterActions({ onBack, onNext, nextLabel }: { onBack: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
      <Button variant="outline" onClick={onBack}>Volver</Button>
      <Button onClick={onNext}>{nextLabel}</Button>
    </div>
  );
}

function getMappingRows(fileType: FileType) {
  if (fileType === 'KKS_FIORI') {
    return [
      { source: 'Arbol tecnico', target: 'Activos/KKS', validation: 'Padres, duplicados y estado' },
      { source: 'Centro y puesto', target: 'Centros de trabajo', validation: 'Catalogo maestro' },
      { source: 'Descripcion', target: 'Historial de activo', validation: 'Hash de fila' },
    ];
  }
  if (fileType === 'POSICIONES_ESSC_SUR') {
    return [
      { source: 'Actividades MP', target: 'Plantillas', validation: 'Frecuencia cacheada' },
      { source: 'Matriz mensual', target: 'Ocurrencias', validation: '96 meses' },
      { source: 'Planta inferida', target: 'Catalogo', validation: 'Alias obligatorio si hay conflicto' },
    ];
  }
  return [
    { source: 'Plan', target: 'Orden de trabajo', validation: 'Idempotencia por numero' },
    { source: 'Equipo', target: 'Activo', validation: 'Resolucion por equipo' },
    { source: 'HH y avance', target: 'Memoria historica', validation: 'Sin inventar datos' },
  ];
}

function severityVariant(severity: string): BadgeProps['variant'] {
  if (severity === 'CRITICAL') return 'danger';
  if (severity === 'WARNING') return 'warning';
  return 'info';
}

function friendlyIssueMessage(issue: ImportIssue) {
  if (issue.code === 'CEMIN_ALIAS_REQUIRED') {
    return 'Se encontró un código de planta que no coincide con el catálogo. Selecciona la planta correcta para continuar.';
  }
  return sanitizeText(issue.message);
}

function sanitizeCell(value: unknown) {
  if (value === null || value === undefined || value === '') return 'N/D';
  return sanitizeText(String(value));
}

function sanitizeText(value: string) {
  return value
    .replace(/ESZS-[A-Z0-9]+/g, 'codigo interno')
    .replace(/[a-f0-9]{24,}/gi, '[dato tecnico]')
    .replace(/[_-]?hash/gi, 'dato tecnico');
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function readError(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    return parsed.message ?? text;
  } catch {
    return text;
  }
}
