import * as React from 'react';
import { cn } from '@/lib/utils';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'danger';
}

export function Alert({ className, variant = 'default', ...props }: AlertProps) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-lg border bg-card p-4 text-sm text-card-foreground',
        variant === 'danger' && 'border-destructive/30 bg-destructive/5 text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('mb-1 font-semibold', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-muted-foreground', className)} {...props} />;
}
