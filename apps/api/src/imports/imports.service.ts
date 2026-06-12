import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaService } from '../prisma/prisma.service';

const execFileAsync = promisify(execFile);

interface CreateImportJobInput {
  originalName: string;
  fileType: ImportFileType;
  storageKey?: string;
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
  plantCode?: string | null;
  equipment?: string | null;
  kks?: string | null;
  title: string;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedHours?: number | null;
  actualHours?: number | null;
  importedProgress?: number | null;
  status?: string | null;
  criticality?: string | null;
  workCenter?: string | null;
  specialty?: string | null;
  assignedTo?: string | null;
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
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateImportJobInput) {
    return this.prisma.importJob.create({
      data: {
        originalName: input.originalName,
        fileType: input.fileType,
        ...(input.storageKey ? { storageKey: input.storageKey } : {}),
      },
    });
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

  async markDryRun(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    const rawDryRun = await this.runImporter<DryRunPayload>('dry-run', job.storageKey ?? job.originalName, job.fileType);
    const issues = await this.excludeResolvedIssues(rawDryRun.issues);
    const dryRun = {
      ...rawDryRun,
      issues,
      errors: issues.filter((issue) => issue.severity === IssueSeverity.CRITICAL).length,
    };
    const hasCritical = dryRun.issues.some((issue) => issue.severity === IssueSeverity.CRITICAL);

    return this.prisma.$transaction(async (tx) => {
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
  }

  async resolveIssue(id: string, issueId: string, resolution: unknown) {
    const issue = await this.prisma.importIssue.findFirst({ where: { id: issueId, importJobId: id } });
    if (!issue) {
      throw new NotFoundException('Import issue not found');
    }
    const parsed = this.parseResolution(resolution);

    return this.prisma.$transaction(async (tx) => {
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
      return tx.importIssue.update({
        where: { id: issueId },
        data: { resolvedAt: new Date(), resolution: this.asJson(parsed) },
      });
    });
  }

  async apply(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id }, include: { issues: true } });
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    const blocker = job.issues.find((issue) => issue.severity === IssueSeverity.CRITICAL && !issue.resolvedAt);
    if (blocker) {
      throw new BadRequestException(`Critical import issue must be resolved first: ${blocker.code}`);
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

    return this.prisma.importJob.update({
      where: { id },
      data: { status: ImportJobStatus.APPLIED },
      include: { issues: true, rows: { take: 20, orderBy: { rowNumber: 'asc' } } },
    });
  }

  private async runImporter<T>(command: 'dry-run' | 'export', file: string, fileType: ImportFileType): Promise<T> {
    const repoRoot = process.env.DATOS_REPO_ROOT ?? resolve(process.cwd(), '../..');
    const importer = resolve(repoRoot, 'apps/importer/main.py');
    const input = isAbsolute(file) ? file : resolve(repoRoot, file);
    if (!existsSync(input)) {
      throw new BadRequestException(`Import file not found: ${input}`);
    }
    const { stdout, stderr } = await execFileAsync('python3', [importer, command, '--file', input, '--type', fileType], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (stderr.trim()) {
      // openpyxl can emit harmless warnings; keep them out of the API payload.
    }
    return JSON.parse(stdout) as T;
  }

  private async applyKks(importJobId: string, rows: KksExportRow[]) {
    const importedByEquipmentCode = new Map<string, string>();
    for (const row of rows) {
      const plant = row.plantCode ? await this.resolvePlant(row.plantCode) : null;
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
      if (!row.plantCode) {
        throw new BadRequestException(`Missing plant code in Planes row ${row.rowNumber}`);
      }
      const plant = await this.resolvePlant(row.plantCode);
      const asset = await this.findAsset(row.equipment);
      const workOrder = await this.prisma.workOrder.upsert({
        where: { code: `OT-${row.planId}` },
        update: {
          plantId: plant.id,
          assetNodeId: asset?.id ?? null,
          title: row.title,
          plannedStart: row.plannedStart ? new Date(row.plannedStart) : null,
          plannedEnd: row.plannedEnd ? new Date(row.plannedEnd) : null,
          plannedHours: row.plannedHours ?? null,
          importedProgress: row.importedProgress ?? null,
          criticality: this.mapCriticality(row.criticality),
        },
        create: {
          code: `OT-${row.planId}`,
          plantId: plant.id,
          assetNodeId: asset?.id ?? null,
          title: row.title,
          status: this.mapStatus(row.status),
          plannedStart: row.plannedStart ? new Date(row.plannedStart) : null,
          plannedEnd: row.plannedEnd ? new Date(row.plannedEnd) : null,
          plannedHours: row.plannedHours ?? null,
          importedProgress: row.importedProgress ?? null,
          criticality: this.mapCriticality(row.criticality),
        },
      });
      await this.ensureMilestones(workOrder.id);
      if ((row.actualHours ?? 0) > 0) {
        const existing = await this.prisma.hhEntry.count({ where: { workOrderId: workOrder.id } });
        if (!existing) {
          await this.prisma.hhEntry.create({
            data: { workOrderId: workOrder.id, hours: row.actualHours ?? 0, entryDate: new Date(), notes: 'HH importadas desde Excel Planes Mantencion' },
          });
        }
      }
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

  private async resolvePlant(sourceCode: string) {
    const mapping = await this.prisma.importMapping.findUnique({
      where: { sourceType_sourceValue: { sourceType: 'PLANT_ALIAS', sourceValue: sourceCode } },
      include: { targetPlant: { include: { client: true } } },
    });
    if (mapping?.targetPlant) {
      return mapping.targetPlant;
    }
    const alias = await this.prisma.plantAlias.findUnique({
      where: { aliasCode_source: { aliasCode: sourceCode, source: 'import' } },
      include: { plant: { include: { client: true } } },
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
      this.prisma.plantAlias.findUnique({
        where: {
          aliasCode_source: {
            aliasCode: 'ESZS-A1',
            source: 'import',
          },
        },
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

  private mapStatus(status?: string | null): WorkOrderStatus {
    const normalized = status?.toLowerCase() ?? '';
    if (normalized.includes('complet') || normalized.includes('cerr')) return WorkOrderStatus.COMPLETED;
    if (normalized.includes('asign')) return WorkOrderStatus.ASSIGNED;
    if (normalized.includes('ejec')) return WorkOrderStatus.IN_PROGRESS;
    return WorkOrderStatus.SCHEDULED;
  }

  private mapCriticality(value?: string | null): IssueSeverity {
    const normalized = value?.toLowerCase() ?? '';
    if (normalized.includes('alta') || normalized.includes('critical')) return IssueSeverity.CRITICAL;
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

  private asJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
