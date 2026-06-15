import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import {
  AssetNodeType,
  FrequencyCode,
  ImportFileType,
  ImportJobStatus,
  IssueSeverity,
  Prisma,
  WorkOrderStatus,
} from '@prisma/client';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';
import { createRedisConnection, IMPORT_QUEUE_NAME, type ImportQueuePayload } from './import.queue';

const execFileAsync = promisify(execFile);
const IMPORT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_ACTIVE_IMPORTS = 3;

export interface UploadedImportFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface CreateImportJobInput {
  originalName?: string;
  fileType?: ImportFileType;
  storageKey?: string;
  file?: UploadedImportFile;
  uploadedById?: string;
}

interface ImporterIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  row_number?: number | null;
  rowNumber?: number | null;
  suggested_action?: string | null;
  suggestedAction?: string | null;
}

interface DryRunPayload {
  file_type?: ImportFileType;
  fileType?: ImportFileType;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  issues: ImporterIssue[];
  metadata: Record<string, unknown>;
}

interface PreviewPayload {
  fileType: ImportFileType;
  sheet: string;
  headers: string[];
  rows: unknown[][];
}

interface KksExportRow {
  rowNumber: number;
  technicalObject: string;
  superiorObject?: string | null;
  parentEquipmentCode?: string | null;
  nodeType: AssetNodeType;
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
}

type ResolvedPlant = { id: string; code: string };

interface PosicionesTemplateRow {
  rowNumber: number;
  plantCode?: string | null;
  wbsElement?: string | null;
  planName?: string | null;
  routeSheet?: string | null;
  technicalLocation?: string | null;
  technicalObject?: string | null;
  equipment?: string | null;
  equipmentCode?: string | null;
  sourcePosition?: string | null;
  activityName?: string | null;
  frequencyLabel?: string | null;
  frequency: string;
  sourceFrequency?: string | null;
  monthsInterval?: number | null;
  startMonth?: number | null;
  estimatedHours?: number | null;
  contextInferred?: boolean;
  idempotencyHash: string;
  occurrences: {
    scheduledFor: string;
    dueDate: string;
    isHistorical: boolean;
    sourceMonthKey: string;
    sourceValue: string;
    sourceHash: string;
  }[];
  raw: Record<string, unknown>;
  sourceHash: string;
}

interface PlanesWorkOrderRow {
  rowNumber: number;
  planId: string;
  workOrderNumber?: string | null;
  equipmentNumber?: string | null;
  equipment?: string | null;
  kks?: string | null;
  title: string;
  scheduledStartDate?: string | null;
  scheduledEndDate?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedHours?: number | null;
  actualHours?: number | null;
  importedProgress?: number | null;
  status?: string | null;
  criticality?: string | null;
  requiredSpecialty?: string | null;
  specialty?: string | null;
  assignedTo?: string | null;
  metadata?: Record<string, unknown>;
  raw: Record<string, unknown>;
  sourceHash: string;
}

interface KksExportPayload {
  fileType: 'KKS_FIORI';
  rows: KksExportRow[];
}

interface PosicionesExportPayload {
  fileType: 'POSICIONES_ESSC_SUR';
  templates: PosicionesTemplateRow[];
}

interface PlanesExportPayload {
  fileType: 'PLANES_MANTENCION';
  workOrders: PlanesWorkOrderRow[];
}

type ExportPayload = KksExportPayload | PosicionesExportPayload | PlanesExportPayload;

@Injectable()
export class ImportsService implements OnModuleDestroy {
  private readonly logger = new Logger(ImportsService.name);
  private queue?: Queue;
  private s3?: S3Client;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async create(input: CreateImportJobInput) {
    if (!input.file && !input.storageKey) {
      throw new BadRequestException('Debes subir un archivo Excel para crear la importacion');
    }

    const originalName = input.file?.originalname ?? input.originalName ?? input.storageKey ?? 'import.xlsx';
    const fileType = input.fileType ?? this.detectFileType(originalName);
    const job = await this.prisma.importJob.create({
      data: {
        originalName,
        fileType,
        ...(input.uploadedById ? { uploadedBy: { connect: { id: input.uploadedById } } } : {}),
        ...(input.storageKey ? { storageKey: input.storageKey } : {}),
      },
    });

    if (input.file) {
      const stored = await this.persistUploadedFile(job.id, input.file);
      await this.prisma.$transaction([
        this.prisma.importFile.create({
          data: {
            importJobId: job.id,
            fileName: stored.objectKey,
            checksum: stored.checksum,
          },
        }),
        this.prisma.importJob.update({
          where: { id: job.id },
          data: { storageKey: stored.localPath },
        }),
      ]);
      await this.audit('CREATE', 'ImportJob', job.id, input.uploadedById, { fileType, originalName });
      return this.get(job.id);
    }

    await this.audit('CREATE', 'ImportJob', job.id, input.uploadedById, { fileType, originalName });
    return job;
  }

  async list({ page, pageSize }: { page: number; pageSize: number }) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(50, Math.max(1, pageSize));
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.importJob.count(),
      this.prisma.importJob.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        include: {
          uploadedBy: { select: { id: true, email: true, name: true } },
          issues: { take: 5, orderBy: { createdAt: 'desc' } },
          _count: { select: { issues: true, rows: true } },
        },
      }),
    ]);
    return {
      rows,
      total,
      page: safePage,
      pageSize: safePageSize,
      pages: Math.ceil(total / safePageSize),
    };
  }

  async get(id: string) {
    const job = await this.prisma.importJob.findUnique({
      where: { id },
      include: { issues: true, rows: { take: 20, orderBy: { rowNumber: 'asc' } }, mappings: true },
    });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    return job;
  }

  async listIssues(id: string, filters: { severity?: IssueSeverity; resolved?: boolean }) {
    await this.assertJob(id);
    return this.prisma.importIssue.findMany({
      where: {
        importJobId: id,
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.resolved === undefined
          ? {}
          : { resolvedAt: filters.resolved ? { not: null } : null }),
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async preview(id: string) {
    const job = await this.assertJob(id);
    const file = job.storageKey ?? job.originalName;
    return this.runImporter<PreviewPayload>('preview', file, job.fileType);
  }

  async enqueue(id: string, action: 'dry-run' | 'apply', actorUserId?: string) {
    const job = await this.assertJob(id);
    const active = await this.prisma.importJob.count({
      where: {
        status: { in: [ImportJobStatus.APPLYING, ImportJobStatus.MAPPED] },
        id: { not: id },
      },
    });
    if (active >= MAX_ACTIVE_IMPORTS) {
      throw new ConflictException('Ya hay 3 importaciones activas. Espera a que termine una antes de continuar.');
    }

    if (action === 'apply') {
      const blocker = await this.prisma.importIssue.findFirst({
        where: { importJobId: id, severity: IssueSeverity.CRITICAL, resolvedAt: null },
      });
      if (blocker) {
        throw new ConflictException('Resuelve los conflictos críticos antes de aplicar la importación.');
      }
    }

    const status = action === 'dry-run' ? ImportJobStatus.MAPPED : ImportJobStatus.APPLYING;
    await this.prisma.importJob.update({ where: { id }, data: { status } });
    await this.audit(action === 'dry-run' ? 'DRY_RUN_REQUESTED' : 'APPLY_REQUESTED', 'ImportJob', id, actorUserId, {
      fileType: job.fileType,
    });
    const payload: ImportQueuePayload = {
      jobId: id,
      action,
      ...(actorUserId ? { actorUserId } : {}),
    };
    await this.getQueue().add('import', payload, {
      jobId: `${id}:${action}:${Date.now()}`,
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 1,
    });
    return this.get(id);
  }

  async progress(id: string) {
    const job = await this.prisma.importJob.findUnique({
      where: { id },
      include: {
        issues: { where: { resolvedAt: null } },
        _count: { select: { rows: true, issues: true } },
      },
    });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    const dryRun = this.normalizeDryRun(job.dryRun);
    const openCritical = job.issues.filter((issue) => issue.severity === IssueSeverity.CRITICAL).length;
    return {
      id: job.id,
      status: job.status,
      phase: this.statusToPhase(job.status),
      progress: this.statusToProgress(job.status),
      fileType: job.fileType,
      originalName: job.originalName,
      created: dryRun.created,
      updated: dryRun.updated,
      skipped: dryRun.skipped,
      errors: dryRun.errors,
      openCritical,
      issues: job._count.issues,
      rows: job._count.rows,
      terminal: this.isTerminalStatus(job.status),
      updatedAt: job.updatedAt,
    };
  }

  isTerminalProgress(data: unknown) {
    if (!data || typeof data !== 'object' || !('status' in data)) {
      return false;
    }
    return this.isTerminalStatus((data as { status: ImportJobStatus }).status);
  }

  async markDryRun(id: string, actorUserId?: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    const rawDryRun = await this.enrichDryRun(
      job.fileType,
      job.storageKey ?? job.originalName,
      await this.runImporter<DryRunPayload>('dry-run', job.storageKey ?? job.originalName, job.fileType),
    );
    const issues = await this.excludeResolvedIssues(rawDryRun.issues);
    const dryRun = {
      ...rawDryRun,
      issues,
      errors: issues.filter((issue) => issue.severity === IssueSeverity.CRITICAL).length,
    };
    const hasCritical = dryRun.issues.some((issue) => issue.severity === IssueSeverity.CRITICAL);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.importIssue.deleteMany({ where: { importJobId: id, resolvedAt: null } });
      if (dryRun.issues.length) {
        await tx.importIssue.createMany({
          data: dryRun.issues.map((issue) => ({
            importJobId: id,
            severity: issue.severity,
            code: issue.code,
            message: issue.message,
            rowNumber: issue.row_number ?? issue.rowNumber ?? null,
            resolution: issue.suggested_action
              ? ({ suggestedAction: issue.suggested_action } satisfies Prisma.InputJsonObject)
              : Prisma.JsonNull,
          })),
        });
      }
      return tx.importJob.update({
        where: { id },
        data: {
          status: hasCritical ? ImportJobStatus.BLOCKED : ImportJobStatus.DRY_RUN_READY,
          dryRun: this.asJson(dryRun),
        },
        include: { issues: true },
      });
    });
    await this.audit('DRY_RUN_COMPLETED', 'ImportJob', id, actorUserId, {
      status: result.status,
      created: dryRun.created,
      updated: dryRun.updated,
      skipped: dryRun.skipped,
      errors: dryRun.errors,
    });
    return result;
  }

  private async enrichDryRun(fileType: ImportFileType, file: string, dryRun: DryRunPayload): Promise<DryRunPayload> {
    if (fileType !== ImportFileType.PLANES_MANTENCION) {
      return dryRun;
    }

    const exported = await this.runImporter<PlanesExportPayload>('export', file, fileType);
    const resolution = await this.resolvePlansRows(exported.workOrders);
    const issues: ImporterIssue[] = [...dryRun.issues];

    if (resolution.assetMissing > 0) {
      issues.push({
        severity: IssueSeverity.WARNING,
        code: 'PLANES_ASSET_NOT_FOUND',
        message: `${resolution.assetMissing} ordenes no encontraron activo por Equipo.`,
        suggested_action: 'Revisar el numero de equipo en Planes Mantencion o el maestro KKS.',
      });
    }
    if (resolution.plantMissing > 0) {
      issues.push({
        severity: IssueSeverity.WARNING,
        code: 'PLANES_PLANT_NOT_RESOLVED',
        message: `${resolution.plantMissing} ordenes no pudieron resolver planta desde el activo.`,
        suggested_action: 'Aplicar KKS antes de importar Planes o corregir el activo origen.',
      });
    }

    return {
      ...dryRun,
      issues,
      errors: issues.filter((issue) => issue.severity === IssueSeverity.CRITICAL).length,
      metadata: {
        ...dryRun.metadata,
        asset_resolved: resolution.assetResolved,
        plant_resolved: resolution.plantResolved,
        asset_missing: resolution.assetMissing,
        plant_missing: resolution.plantMissing,
      },
    };
  }

  async resolveIssue(id: string, issueId: string, resolution: unknown, actorUserId?: string) {
    const issue = await this.prisma.importIssue.findFirst({ where: { id: issueId, importJobId: id } });
    if (!issue) {
      throw new NotFoundException('Import issue not found');
    }
    const parsed = this.parseResolution(resolution);

    const result = await this.prisma.$transaction(async (tx) => {
      let targetPlantId = parsed.targetPlantId;
      if (!targetPlantId && parsed.targetPlantCode) {
        const plant = await tx.plant.findUnique({ where: { code: parsed.targetPlantCode } });
        targetPlantId = plant?.id;
      }
      if (!targetPlantId) {
        throw new BadRequestException('Issue resolution requires targetPlantId or targetPlantCode');
      }

      const sourceValue = parsed.sourceValue ?? parsed.aliasCode ?? 'ESZS-A1';
      await tx.importMapping.upsert({
        where: { sourceType_sourceValue: { sourceType: parsed.sourceType ?? 'PLANT_ALIAS', sourceValue } },
        update: { targetPlantId, notes: parsed.notes ?? issue.code },
        create: {
          importJobId: id,
          sourceType: parsed.sourceType ?? 'PLANT_ALIAS',
          sourceValue,
          targetPlantId,
          notes: parsed.notes ?? issue.code,
        },
      });
      await tx.plantAlias.upsert({
        where: { aliasCode_source: { aliasCode: sourceValue, source: parsed.source ?? 'import' } },
        update: { plantId: targetPlantId, reason: parsed.reason ?? issue.message },
        create: {
          plantId: targetPlantId,
          aliasCode: sourceValue,
          source: parsed.source ?? 'import',
          reason: parsed.reason ?? issue.message,
        },
      });
      const updated = await tx.importIssue.update({
        where: { id: issueId },
        data: { resolvedAt: new Date(), resolution: this.asJson(parsed) },
      });
      const openCritical = await tx.importIssue.count({
        where: { importJobId: id, severity: IssueSeverity.CRITICAL, resolvedAt: null },
      });
      if (openCritical === 0) {
        await tx.importJob.update({ where: { id }, data: { status: ImportJobStatus.DRY_RUN_READY } });
      }
      return updated;
    });
    await this.audit('ISSUE_RESOLVED', 'ImportJob', id, actorUserId, { issueId, resolution: parsed });
    return result;
  }

  async markFailed(id: string, error: unknown) {
    const message = this.sanitizeError(error);
    await this.prisma.importJob.update({
      where: { id },
      data: {
        status: ImportJobStatus.FAILED,
        dryRun: this.asJson({
          ...this.normalizeDryRun((await this.prisma.importJob.findUnique({ where: { id } }))?.dryRun),
          lastError: message,
        }),
      },
    });
  }

  async apply(id: string, actorUserId?: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id }, include: { issues: true } });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    const blocker = job.issues.find((issue) => issue.severity === IssueSeverity.CRITICAL && !issue.resolvedAt);
    if (blocker) {
      throw new ConflictException('Resuelve los conflictos críticos antes de aplicar la importación.');
    }

    await this.prisma.importJob.update({ where: { id }, data: { status: ImportJobStatus.APPLYING } });
    const exported = await this.runImporter<ExportPayload>('export', job.storageKey ?? job.originalName, job.fileType);

    if (exported.fileType === 'KKS_FIORI') {
      await this.applyKks(id, exported.rows);
    }
    if (exported.fileType === 'POSICIONES_ESSC_SUR') {
      await this.applyPosiciones(id, exported.templates);
    }
    if (exported.fileType === 'PLANES_MANTENCION') {
      await this.applyPlanes(id, exported.workOrders);
    }

    const result = await this.prisma.importJob.update({
      where: { id },
      data: { status: ImportJobStatus.APPLIED },
      include: { issues: true, rows: { take: 20, orderBy: { rowNumber: 'asc' } } },
    });
    await this.audit('APPLIED', 'ImportJob', id, actorUserId, { fileType: job.fileType });
    return result;
  }

  private async assertJob(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    return job;
  }

  private getQueue() {
    if (!this.queue) {
      this.queue = new Queue(IMPORT_QUEUE_NAME, {
        connection: createRedisConnection(),
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 1,
        },
      });
    }
    return this.queue;
  }

  private detectFileType(name: string): ImportFileType {
    const normalized = name.toLowerCase();
    if (normalized.includes('posiciones')) {
      return ImportFileType.POSICIONES_ESSC_SUR;
    }
    if (normalized.includes('plan')) {
      return ImportFileType.PLANES_MANTENCION;
    }
    if (normalized.includes('kks') || normalized.includes('fiori') || normalized.includes('arbol')) {
      return ImportFileType.KKS_FIORI;
    }
    throw new BadRequestException('No se pudo detectar el tipo de Excel por el nombre del archivo');
  }

  private async persistUploadedFile(jobId: string, file: UploadedImportFile) {
    const extension = extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xlsm'].includes(extension)) {
      throw new BadRequestException('Solo se aceptan archivos Excel .xlsx o .xlsm');
    }
    const repoRoot = this.repoRoot();
    const safeName = this.safeFileName(file.originalname);
    const relativePath = `storage/imports/${jobId}/${safeName}`;
    const localPath = resolve(repoRoot, relativePath);
    await mkdir(resolve(localPath, '..'), { recursive: true });
    await writeFile(localPath, file.buffer);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const objectKey = `imports/${jobId}/${safeName}`;
    await this.uploadToObjectStorage(objectKey, file);
    return { localPath: relativePath, objectKey, checksum };
  }

  private async uploadToObjectStorage(key: string, file: UploadedImportFile) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket || !process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
      this.logger.warn('S3/MinIO no configurado; archivo disponible solo en staging local.');
      return;
    }
    this.s3 ??= new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      },
    });
    const put = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    try {
      await this.s3.send(put);
    } catch (error) {
      if (this.sanitizeError(error).toLowerCase().includes('bucket')) {
        await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
        await this.s3.send(put);
        return;
      }
      this.logger.warn(`No se pudo guardar en MinIO; se mantiene staging local. ${this.sanitizeError(error)}`);
    }
  }

  private repoRoot() {
    return process.env.DATOS_REPO_ROOT ?? resolve(process.cwd(), '../..');
  }

  private safeFileName(name: string) {
    const extension = extname(name).toLowerCase();
    const base = name
      .slice(0, name.length - extension.length)
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 120);
    return `${base || 'import'}${extension}`;
  }

  private async runImporter<T>(
    command: 'dry-run' | 'export' | 'preview',
    file: string,
    fileType: ImportFileType,
  ): Promise<T> {
    const repoRoot = this.repoRoot();
    const importer = resolve(repoRoot, 'apps/importer/main.py');
    const input = isAbsolute(file) ? file : resolve(repoRoot, file);
    if (!existsSync(input)) {
      throw new BadRequestException('No se encontró el archivo de importación en almacenamiento privado');
    }
    try {
      const args = command === 'preview'
        ? [importer, command, '--file', input, '--limit', '10']
        : [importer, command, '--file', input, '--type', fileType];
      const { stdout, stderr } = await execFileAsync('python3', args, {
        cwd: repoRoot,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
          TZ: process.env.TZ ?? 'America/Santiago',
        },
        maxBuffer: 64 * 1024 * 1024,
        timeout: IMPORT_TIMEOUT_MS,
      });
      if (stderr.trim()) {
        // openpyxl can emit harmless warnings; keep them out of the API payload.
      }
      return JSON.parse(stdout) as T;
    } catch (error) {
      throw new BadRequestException(this.sanitizeError(error));
    }
  }

  private async applyKks(importJobId: string, rows: KksExportRow[]) {
    const importedByEquipmentCode = new Map<string, string>();
    const plantCache = new Map<string, ResolvedPlant | null>();
    for (const row of rows) {
      const plant = await this.resolveKksPlant(row, plantCache);
      const workCenter = row.workCenter ? await this.resolveWorkCenter(row.workCenter) : null;
      const costCenter = row.costCenter ? await this.resolveCostCenter(row.costCenter) : null;
      const asset = await this.prisma.assetKksNode.upsert({
        where: { technicalObject: row.technicalObject },
        update: {
          plantId: plant?.id ?? null,
          nodeType: row.nodeType,
          superiorObject: row.superiorObject ?? null,
          kks: row.kks ?? null,
          kksDescription: row.kksDescription ?? null,
          equipmentCode: row.equipmentCode ?? null,
          equipmentDescription: row.equipmentDescription ?? null,
          planningGroup: row.planningGroup ?? null,
          site: row.site ?? null,
          systemStatus: row.systemStatus ?? null,
          center: row.center ?? null,
          workCenterId: workCenter?.id ?? null,
          costCenterId: costCenter?.id ?? null,
          raw: this.asJson(row.raw),
          sourceHash: row.sourceHash,
        },
        create: {
          plantId: plant?.id ?? null,
          nodeType: row.nodeType,
          technicalObject: row.technicalObject,
          superiorObject: row.superiorObject ?? null,
          kks: row.kks ?? null,
          kksDescription: row.kksDescription ?? null,
          equipmentCode: row.equipmentCode ?? null,
          equipmentDescription: row.equipmentDescription ?? null,
          planningGroup: row.planningGroup ?? null,
          site: row.site ?? null,
          systemStatus: row.systemStatus ?? null,
          center: row.center ?? null,
          workCenterId: workCenter?.id ?? null,
          costCenterId: costCenter?.id ?? null,
          raw: this.asJson(row.raw),
          sourceHash: row.sourceHash,
        },
      });
      if (row.equipmentCode) {
        importedByEquipmentCode.set(row.equipmentCode, asset.id);
      }
    }

    for (const row of rows) {
      const parentId = row.parentEquipmentCode
        ? importedByEquipmentCode.get(row.parentEquipmentCode)
        : undefined;
      await this.prisma.assetKksNode.update({
        where: { technicalObject: row.technicalObject },
        data: { parentId: parentId ?? null },
      });
    }

    await this.recordImportRows(
      importJobId,
      'KKS ESSC General',
      rows.map((row) => ({
        rowNumber: row.rowNumber,
        rowHash: row.sourceHash,
        raw: row.raw,
        createdEntity: 'AssetKksNode',
      })),
    );
  }

  private async applyPosiciones(importJobId: string, templates: PosicionesTemplateRow[]) {
    for (const row of templates) {
      if (!row.plantCode) {
        throw new BadRequestException(`Missing plant code in Posiciones row ${row.rowNumber}`);
      }
      const plant = await this.resolvePlant(row.plantCode);
      const frequency = await this.resolveFrequency(row.frequency, row.frequencyLabel, row.monthsInterval);
      const asset = await this.findAsset(
        row.equipmentCode ?? row.equipment,
        row.technicalObject ?? row.technicalLocation,
        row.plantCode,
        plant.code,
      );
      const template = await this.prisma.maintenanceTemplate.upsert({
        where: { idempotencyHash: row.idempotencyHash },
        update: {
          plantId: plant.id,
          assetNodeId: asset?.id ?? null,
          frequencyId: frequency.id,
          sourcePosition: row.sourcePosition ?? null,
          planName: row.planName ?? row.activityName ?? `MP ${row.rowNumber}`,
          routeSheet: row.routeSheet ?? null,
          activityName: row.activityName ?? row.planName ?? `Mantencion ${row.rowNumber}`,
          wbsElement: row.wbsElement ?? null,
          startMonth: row.startMonth ?? null,
          estimatedHours: row.estimatedHours ?? null,
          sourceHash: row.sourceHash,
        },
        create: {
          plantId: plant.id,
          assetNodeId: asset?.id ?? null,
          frequencyId: frequency.id,
          sourcePosition: row.sourcePosition ?? null,
          planName: row.planName ?? row.activityName ?? `MP ${row.rowNumber}`,
          routeSheet: row.routeSheet ?? null,
          activityName: row.activityName ?? row.planName ?? `Mantencion ${row.rowNumber}`,
          wbsElement: row.wbsElement ?? null,
          startMonth: row.startMonth ?? null,
          estimatedHours: row.estimatedHours ?? null,
          idempotencyHash: row.idempotencyHash,
          sourceHash: row.sourceHash,
        },
      });
      for (const occurrence of row.occurrences) {
        await this.prisma.maintenanceOccurrence.upsert({
          where: { sourceHash: occurrence.sourceHash },
          update: {
            templateId: template.id,
            plantId: plant.id,
            assetNodeId: asset?.id ?? null,
            scheduledFor: new Date(occurrence.scheduledFor),
            dueDate: new Date(occurrence.dueDate),
            isHistorical: occurrence.isHistorical,
            sourceMonthKey: occurrence.sourceMonthKey,
          },
          create: {
            templateId: template.id,
            plantId: plant.id,
            assetNodeId: asset?.id ?? null,
            scheduledFor: new Date(occurrence.scheduledFor),
            dueDate: new Date(occurrence.dueDate),
            isHistorical: occurrence.isHistorical,
            sourceMonthKey: occurrence.sourceMonthKey,
            sourceHash: occurrence.sourceHash,
          },
        });
      }
    }

    await this.recordImportRows(
      importJobId,
      'Actividades MP ESSC Sur',
      templates.map((row) => ({
        rowNumber: row.rowNumber,
        rowHash: row.sourceHash,
        raw: row.raw,
        createdEntity: 'MaintenanceTemplate',
      })),
    );
  }

  private async applyPlanes(importJobId: string, rows: PlanesWorkOrderRow[]) {
    for (const row of rows) {
      const workOrderNumber = row.workOrderNumber ?? `PLAN-${row.planId}`;
      const equipmentNumber = row.equipmentNumber ?? row.equipment;
      const asset = await this.resolvePlanAsset(equipmentNumber);
      if (!asset) {
        throw new BadRequestException(`Missing asset for Planes row ${row.rowNumber}: ${equipmentNumber ?? 'sin equipo'}`);
      }
      if (!asset.plantId) {
        throw new BadRequestException(`Missing plant for Planes row ${row.rowNumber}: ${equipmentNumber}`);
      }
      const metadata = row.metadata ?? {
        sourcePlanId: row.planId,
        kks: row.kks,
        especialidad: row.specialty,
        personalAsignado: row.assignedTo,
      };
      await this.prisma.workOrder.upsert({
        where: { code: workOrderNumber },
        update: {
          plantId: asset.plantId,
          assetNodeId: asset.id,
          title: row.title,
          status: this.mapStatus(row.status),
          plannedStart: this.parseOptionalDate(row.scheduledStartDate ?? row.plannedStart),
          plannedEnd: this.parseOptionalDate(row.scheduledEndDate ?? row.plannedEnd),
          plannedHours: row.plannedHours ?? null,
          actualHours: row.actualHours ?? null,
          importedProgress: row.importedProgress ?? null,
          criticality: this.mapCriticality(row.criticality),
          requiredSpecialty: row.requiredSpecialty ?? null,
          metadata: this.asJson(metadata),
        },
        create: {
          code: workOrderNumber,
          plantId: asset.plantId,
          assetNodeId: asset.id,
          title: row.title,
          status: this.mapStatus(row.status),
          plannedStart: this.parseOptionalDate(row.scheduledStartDate ?? row.plannedStart),
          plannedEnd: this.parseOptionalDate(row.scheduledEndDate ?? row.plannedEnd),
          plannedHours: row.plannedHours ?? null,
          actualHours: row.actualHours ?? null,
          importedProgress: row.importedProgress ?? null,
          criticality: this.mapCriticality(row.criticality),
          requiredSpecialty: row.requiredSpecialty ?? null,
          metadata: this.asJson(metadata),
        },
      });
    }

    await this.recordImportRows(
      importJobId,
      'Planes',
      rows.map((row) => ({
        rowNumber: row.rowNumber,
        rowHash: row.sourceHash,
        raw: row.raw,
        createdEntity: 'WorkOrder',
      })),
    );
  }

  private async recordImportRows(
    importJobId: string,
    sheetName: string,
    rows: { rowNumber: number; rowHash: string; raw: Record<string, unknown>; createdEntity: string }[],
  ) {
    if (!rows.length) {
      return;
    }
    await this.prisma.importRow.createMany({
      data: rows.map((row) => ({
        importJobId,
        sheetName,
        rowNumber: row.rowNumber,
        rowHash: row.rowHash,
        raw: this.asJson(row.raw),
        createdEntity: row.createdEntity,
      })),
      skipDuplicates: true,
    });
  }

  private async resolvePlansRows(rows: PlanesWorkOrderRow[]) {
    let assetResolved = 0;
    let plantResolved = 0;

    for (const row of rows) {
      const asset = await this.resolvePlanAsset(row.equipmentNumber ?? row.equipment);
      if (asset) {
        assetResolved += 1;
      }
      if (asset?.plantId) {
        plantResolved += 1;
      }
    }

    return {
      assetResolved,
      plantResolved,
      assetMissing: rows.length - assetResolved,
      plantMissing: rows.length - plantResolved,
    };
  }

  private async resolvePlanAsset(equipmentNumber?: string | null) {
    if (!equipmentNumber) {
      return null;
    }
    return this.prisma.assetKksNode.findFirst({
      where: { equipmentCode: equipmentNumber },
      select: { id: true, plantId: true },
    });
  }

  private async resolveKksPlant(
    row: KksExportRow,
    cache: Map<string, ResolvedPlant | null> = new Map(),
  ): Promise<ResolvedPlant | null> {
    const candidates = this.extractKksPlantCandidates(row);
    for (const candidate of candidates) {
      if (cache.has(candidate)) {
        const cached = cache.get(candidate) ?? null;
        if (cached) {
          return cached;
        }
        continue;
      }

      const direct = await this.prisma.plant.findUnique({
        where: { code: candidate },
        select: { id: true, code: true },
      });
      if (direct) {
        cache.set(candidate, direct);
        return direct;
      }

      const alias = await this.prisma.plantAlias.findFirst({
        where: { aliasCode: candidate },
        include: { plant: { select: { id: true, code: true } } },
        orderBy: { createdAt: 'desc' },
      });
      const resolved = alias?.plant ?? null;
      cache.set(candidate, resolved);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  private extractKksPlantCandidates(row: KksExportRow) {
    const values = [
      row.plantCode,
      row.kks,
      row.technicalObject,
      row.equipmentCode,
      row.superiorObject,
      row.parentEquipmentCode,
    ];
    const candidates = new Set<string>();
    for (const value of values) {
      if (!value) {
        continue;
      }
      for (const match of value.matchAll(/ESZS-[A-Z0-9]+/g)) {
        candidates.add(match[0]);
      }
    }
    return [...candidates];
  }

  private async resolvePlant(sourceCode: string) {
    const mapping = await this.prisma.importMapping.findUnique({
      where: { sourceType_sourceValue: { sourceType: 'PLANT_ALIAS', sourceValue: sourceCode } },
      include: { targetPlant: { include: { client: true } } },
    });
    if (mapping?.targetPlant) {
      return mapping.targetPlant;
    }
    const alias = await this.prisma.plantAlias.findFirst({
      where: { aliasCode: sourceCode },
      include: { plant: { include: { client: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (alias?.plant) {
      return alias.plant;
    }
    const client = await this.prisma.client.upsert({
      where: { name: 'ESSC Sur' },
      update: {},
      create: { name: 'ESSC Sur' },
    });
    return this.prisma.plant.upsert({
      where: { code: sourceCode },
      update: {},
      create: {
        code: sourceCode,
        name: sourceCode,
        clientId: client.id,
        healthScore: 80,
      },
      include: { client: true },
    });
  }

  private async resolveWorkCenter(name: string) {
    const code = name.trim().slice(0, 120);
    return this.prisma.workCenter.upsert({ where: { code }, update: { name }, create: { code, name } });
  }

  private async resolveCostCenter(name: string) {
    const code = name.trim().slice(0, 120);
    return this.prisma.costCenter.upsert({ where: { code }, update: { name }, create: { code, name } });
  }

  private async resolveFrequency(source: string, label?: string | null, months?: number | null) {
    const code = this.mapFrequency(source);
    return this.prisma.maintenanceFrequency.upsert({
      where: { code },
      update: { label: label ?? source, monthsInterval: months ?? this.frequencyMonths(code) },
      create: { code, label: label ?? source, monthsInterval: months ?? this.frequencyMonths(code) },
    });
  }

  private async findAsset(
    equipmentCode?: string | null,
    technicalObject?: string | null,
    sourcePlantCode?: string | null,
    canonicalPlantCode?: string | null,
  ) {
    const normalizeCode = (value?: string | null) => {
      if (!value) return null;
      if (
        sourcePlantCode &&
        canonicalPlantCode &&
        sourcePlantCode !== canonicalPlantCode &&
        value.startsWith(sourcePlantCode)
      ) {
        return `${canonicalPlantCode}${value.slice(sourcePlantCode.length)}`;
      }
      return value;
    };
    const normalizedEquipment = normalizeCode(equipmentCode);
    const normalizedTechnicalObject = normalizeCode(technicalObject);

    if (normalizedEquipment) {
      const asset = await this.prisma.assetKksNode.findFirst({
        where: { equipmentCode: normalizedEquipment },
      });
      if (asset) {
        return asset;
      }
    }

    if (normalizedTechnicalObject) {
      return this.prisma.assetKksNode.findFirst({
        where: {
          OR: [
            { equipmentCode: normalizedTechnicalObject },
            { technicalObject: normalizedTechnicalObject },
          ],
        },
      });
    }
    return null;
  }

  private async ensureMilestones(workOrderId: string) {
    const existing = await this.prisma.workOrderMilestone.count({ where: { workOrderId } });
    if (existing) {
      return;
    }
    await this.prisma.workOrderMilestone.createMany({
      data: [
        ['Programada', 10],
        ['Asignada', 15],
        ['En ejecucion', 25],
        ['Evidencia', 20],
        ['Revision supervisor', 20],
        ['Firmada', 10],
      ].map(([label, weight]) => ({ workOrderId, label: String(label), weight: Number(weight) })),
    });
  }

  private mapFrequency(source: string): FrequencyCode {
    if (source === FrequencyCode.ONE_MONTH) return FrequencyCode.ONE_MONTH;
    if (source === FrequencyCode.SIX_MONTHS) return FrequencyCode.SIX_MONTHS;
    if (source === FrequencyCode.ONE_YEAR) return FrequencyCode.ONE_YEAR;
    if (source === FrequencyCode.FIVE_YEARS) return FrequencyCode.FIVE_YEARS;
    if (source === FrequencyCode.CUSTOM) return FrequencyCode.CUSTOM;
    if (source === '1M') return FrequencyCode.ONE_MONTH;
    if (source === '6M') return FrequencyCode.SIX_MONTHS;
    if (source === '1A') return FrequencyCode.ONE_YEAR;
    if (source === '5A') return FrequencyCode.FIVE_YEARS;
    return FrequencyCode.CUSTOM;
  }

  private async excludeResolvedIssues(issues: ImporterIssue[]) {
    const hasCeminIssue = issues.some((issue) => issue.code === 'CEMIN_ALIAS_REQUIRED');
    if (!hasCeminIssue) {
      return issues;
    }
    const [mapping, alias] = await Promise.all([
      this.prisma.importMapping.findUnique({
        where: {
          sourceType_sourceValue: {
            sourceType: 'PLANT_ALIAS',
            sourceValue: 'ESZS-A1',
          },
        },
      }),
      this.prisma.plantAlias.findFirst({
        where: { aliasCode: 'ESZS-A1' },
      }),
    ]);
    if (!mapping?.targetPlantId && !alias?.plantId) {
      return issues;
    }
    return issues.filter((issue) => issue.code !== 'CEMIN_ALIAS_REQUIRED');
  }

  private frequencyMonths(code: FrequencyCode) {
    if (code === FrequencyCode.ONE_MONTH) return 1;
    if (code === FrequencyCode.SIX_MONTHS) return 6;
    if (code === FrequencyCode.ONE_YEAR) return 12;
    if (code === FrequencyCode.FIVE_YEARS) return 60;
    return null;
  }

  private parseOptionalDate(value?: string | null) {
    return value ? new Date(value) : null;
  }

  private mapStatus(status?: string | null): WorkOrderStatus {
    const normalized = status?.toLowerCase() ?? '';
    if (status && status in WorkOrderStatus) return status as WorkOrderStatus;
    if (normalized.includes('complet') || normalized.includes('cerr')) return WorkOrderStatus.COMPLETED;
    if (normalized.includes('asign')) return WorkOrderStatus.ASSIGNED;
    if (normalized.includes('ejec')) return WorkOrderStatus.IN_PROGRESS;
    return WorkOrderStatus.SCHEDULED;
  }

  private mapCriticality(value?: string | null): IssueSeverity {
    const normalized = value?.toLowerCase() ?? '';
    if (value && value in IssueSeverity) return value as IssueSeverity;
    if (normalized.includes('alta') || normalized.includes('critic') || normalized.includes('crític')) return IssueSeverity.CRITICAL;
    if (normalized.includes('media') || normalized.includes('warning')) return IssueSeverity.WARNING;
    return IssueSeverity.INFO;
  }

  private parseResolution(resolution: unknown) {
    if (!resolution || typeof resolution !== 'object') {
      throw new BadRequestException('Resolution body must be an object');
    }
    return resolution as {
      sourceValue?: string;
      aliasCode?: string;
      targetPlantId?: string;
      targetPlantCode?: string;
      sourceType?: string;
      source?: string;
      notes?: string;
      reason?: string;
    };
  }

  private normalizeDryRun(value: unknown) {
    if (!value || typeof value !== 'object') {
      return { created: 0, updated: 0, skipped: 0, errors: 0, metadata: {}, issues: [] };
    }
    const source = value as Partial<DryRunPayload> & { lastError?: string };
    return {
      created: Number(source.created ?? 0),
      updated: Number(source.updated ?? 0),
      skipped: Number(source.skipped ?? 0),
      errors: Number(source.errors ?? 0),
      metadata: source.metadata ?? {},
      issues: source.issues ?? [],
      ...(source.lastError ? { lastError: source.lastError } : {}),
    };
  }

  private statusToProgress(status: ImportJobStatus) {
    if (status === ImportJobStatus.UPLOADED) return 12;
    if (status === ImportJobStatus.MAPPED) return 42;
    if (status === ImportJobStatus.APPLYING) return 68;
    return 100;
  }

  private statusToPhase(status: ImportJobStatus) {
    if (status === ImportJobStatus.UPLOADED) return 'Archivo recibido';
    if (status === ImportJobStatus.MAPPED) return 'Analizando archivo';
    if (status === ImportJobStatus.DRY_RUN_READY) return 'Analisis listo';
    if (status === ImportJobStatus.BLOCKED) return 'Conflictos por resolver';
    if (status === ImportJobStatus.APPLYING) return 'Aplicando cambios';
    if (status === ImportJobStatus.APPLIED) return 'Importacion aplicada';
    if (status === ImportJobStatus.FAILED) return 'Importacion fallida';
    return 'Importacion';
  }

  private isTerminalStatus(status: ImportJobStatus) {
    const terminalStatuses: ImportJobStatus[] = [
      ImportJobStatus.DRY_RUN_READY,
      ImportJobStatus.BLOCKED,
      ImportJobStatus.APPLIED,
      ImportJobStatus.FAILED,
    ];
    return terminalStatuses.includes(status);
  }

  private sanitizeError(error: unknown) {
    if (error instanceof Error) {
      return error.message.replace(/[a-f0-9]{24,}/gi, '[hash]').slice(0, 400);
    }
    return 'No se pudo completar la importacion';
  }

  private async audit(
    action: string,
    resource: string,
    resourceId: string,
    actorUserId: string | undefined,
    after: Record<string, unknown>,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        resource,
        resourceId,
        action,
        after: this.asJson(after),
        ...(actorUserId ? { actorUser: { connect: { id: actorUserId } } } : {}),
      },
    });
  }

  private asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
