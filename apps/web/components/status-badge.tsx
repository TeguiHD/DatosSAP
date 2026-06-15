import { Badge, type BadgeProps } from '@/components/ui/badge';

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  SCHEDULED: 'Programada',
  CLIENT_NOTIFIED: 'Cliente notificado',
  PENDING_ACCESS: 'Acceso pendiente',
  PENDING_EXECUTION_APPROVAL: 'Autorizacion pendiente',
  ASSIGNED: 'Asignada',
  IN_PROGRESS: 'En curso',
  PENDING_EVIDENCE: 'Falta evidencia',
  PENDING_SUPERVISOR_REVIEW: 'Revision supervisor',
  PENDING_CLIENT_APPROVAL: 'Aprobacion cliente',
  PENDING_CONFORMITY: 'Conformidad pendiente',
  COMPLETED: 'Completada',
  CLOSED: 'Cerrada',
  SIGNED: 'Firmada',
  REJECTED: 'Rechazada',
  REOPENED: 'Reabierta',
  POSTPONED: 'Postergada',
  SKIPPED: 'Omitida',
  CANCELLED: 'Cancelada',
  ACTIVE: 'Activa',
  STANDBY: 'En espera',
  INACTIVE: 'Inactiva',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)}>{statusLabels[status] ?? status}</Badge>;
}

function statusVariant(status: string): BadgeProps['variant'] {
  if (['CANCELLED', 'REJECTED', 'PENDING_EVIDENCE', 'PENDING_ACCESS'].includes(status)) return 'danger';
  if (
    [
      'SCHEDULED',
      'ASSIGNED',
      'POSTPONED',
      'PENDING_CLIENT_APPROVAL',
      'PENDING_EXECUTION_APPROVAL',
      'PENDING_CONFORMITY',
      'PENDING_SUPERVISOR_REVIEW',
      'STANDBY',
    ].includes(status)
  ) {
    return 'warning';
  }
  if (['COMPLETED', 'CLOSED', 'SIGNED', 'ACTIVE'].includes(status)) return 'success';
  return 'secondary';
}
