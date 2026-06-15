import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const frequencyLabels: Record<string, string> = {
  ONE_MONTH: '1M',
  SIX_MONTHS: '6M',
  ONE_YEAR: '1A',
  FIVE_YEARS: '5A',
  CUSTOM: 'Manual',
};

const frequencyClasses: Record<string, string> = {
  ONE_MONTH: 'border-transparent bg-violet-100 text-violet-800',
  SIX_MONTHS: 'border-transparent bg-blue-100 text-blue-800',
  ONE_YEAR: 'border-transparent bg-cyan-100 text-cyan-800',
  FIVE_YEARS: 'border-transparent bg-emerald-100 text-emerald-800',
  CUSTOM: 'border-transparent bg-muted text-foreground',
};

export function FrequencyBadge({ frequency }: { frequency: string }) {
  return (
    <Badge variant="outline" className={cn(frequencyClasses[frequency])}>
      {frequencyLabels[frequency] ?? frequency}
    </Badge>
  );
}
