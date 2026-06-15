import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function OperationalCard({
  href,
  children,
  className,
}: {
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const card = (
    <Card className={cn('h-full transition-all duration-200 hover:-translate-y-px hover:shadow-md', className)}>
      {children}
    </Card>
  );

  if (!href) {
    return card;
  }

  return (
    <Link href={href} className="block min-w-0 rounded-md focus:outline-none focus:ring-2 focus:ring-ring">
      {card}
    </Link>
  );
}
