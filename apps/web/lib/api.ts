import type { KpiSummary } from '@datos/shared';

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

export interface PlantRow {
  id: string;
  code: string;
  name: string;
  status: string;
  healthScore: number | null;
  client: { name: string };
  _count?: { assetNodes?: number; occurrences?: number; workOrders?: number };
}

export interface WorkOrderRow {
  id: string;
  code: string;
  title: string;
  status: string;
  progress: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedHours: number | null;
  importedProgress: number | null;
  plant: { id: string; name: string; client: { name: string } };
  assetNode?: { technicalObject: string; kksDescription: string | null } | null;
  evidenceFiles: { id: string; fileName: string }[];
  hhEntries?: { id: string; hours: number; entryDate: string }[];
  milestones?: { id: string; label: string; weight: number; status: string }[];
}

export interface KksNodeRow {
  id: string;
  technicalObject: string;
  nodeType: string;
  kks: string | null;
  kksDescription: string | null;
  equipmentCode: string | null;
  equipmentDescription: string | null;
  systemStatus: string | null;
  center: string | null;
  plant?: { name: string; client: { name: string } } | null;
  children?: { id: string; technicalObject: string; kksDescription: string | null }[];
}

export interface OccurrenceRow {
  id: string;
  scheduledFor: string;
  status: string;
  sourceMonthKey: string;
  plant: { id: string; name: string; client: { name: string } };
  template: { activityName: string; planName: string };
  workOrder?: { id: string; code: string; status: string } | null;
}

export interface AssignmentWeek {
  from: string;
  to: string;
  rows: {
    personnel: { id: string; name: string; weeklyCapacityHours: number; primarySpecialty?: { name: string } | null };
    plannedHours: number;
    capacityHours: number;
    load: number;
    overloaded: boolean;
    assignments: { id: string; workOrder: WorkOrderRow }[];
  }[];
}

export interface ExecutiveReport {
  generatedAt: string;
  totalWorkOrders: number;
  closedWorkOrders: number;
  signedWorkOrders: number;
  overdueWorkOrders: number;
  plannedHours: number;
  actualHours: number;
  compliance: number | null;
  plants: PlantRow[];
}

export type { KpiSummary };

export function apiUrl(path: string) {
  return `/api/backend${normalizePath(path)}`;
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}
