export const ROLES = [
  'SUPERADMIN',
  'ADMIN',
  'SUPERVISOR',
  'TECNICO',
  'CLIENTE_VIEWER',
] as const;

export type Role = (typeof ROLES)[number];

export const WORK_ORDER_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING_EVIDENCE',
  'PENDING_SUPERVISOR_REVIEW',
  'PENDING_CLIENT_APPROVAL',
  'COMPLETED',
  'CLOSED',
  'SIGNED',
  'REJECTED',
  'REOPENED',
  'POSTPONED',
  'SKIPPED',
  'CANCELLED',
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const IMPORT_FILE_TYPES = ['KKS_FIORI', 'POSICIONES_ESSC_SUR', 'PLANES_MANTENCION'] as const;
export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number];

export const IMPORT_STATUSES = [
  'UPLOADED',
  'MAPPED',
  'DRY_RUN_READY',
  'BLOCKED',
  'APPLYING',
  'APPLIED',
  'FAILED',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const FREQUENCY_CODES = ['ONE_MONTH', 'SIX_MONTHS', 'ONE_YEAR', 'FIVE_YEARS', 'CUSTOM'] as const;
export type FrequencyCode = (typeof FREQUENCY_CODES)[number];

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AssetNodeType = 'TECHNICAL_LOCATION' | 'EQUIPMENT';

export interface PlantSummary {
  id: string;
  code: string;
  name: string;
  clientName: string;
  status: 'ACTIVE' | 'STANDBY' | 'INACTIVE';
  healthScore: number | null;
  overdueCount: number;
  upcomingCount: number;
  nextDueDate: string | null;
}

export interface KpiSummary {
  generatedAt: string;
  plantsTotal: number;
  plantsInRisk: number;
  overdueWorkOrders: number;
  upcomingOccurrences30d: number;
  plannedHours: number;
  actualHours: number;
  averageHealthScore: number | null;
  pendingApprovals: number;
}

export interface ImportDryRunIssue {
  severity: Severity;
  code: string;
  message: string;
  rowNumber?: number;
  suggestedAction?: string;
}

export interface ImportDryRunResult {
  fileType: ImportFileType;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  issues: ImportDryRunIssue[];
  metadata: Record<string, string | number | boolean>;
}
