import { Badge, type BadgeProps } from '@/components/ui/badge';

const criticalityLabels: Record<string, string> = {
  INFO: 'Informativa',
  WARNING: 'Advertencia',
  CRITICAL: 'Critica',
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

export function CriticalityBadge({ criticality }: { criticality: string }) {
  return <Badge variant={criticalityVariant(criticality)}>{criticalityLabels[criticality] ?? criticality}</Badge>;
}

function criticalityVariant(criticality: string): BadgeProps['variant'] {
  if (['CRITICAL', 'HIGH'].includes(criticality)) return 'danger';
  if (['WARNING', 'MEDIUM'].includes(criticality)) return 'warning';
  if (criticality === 'LOW') return 'success';
  return 'info';
}
