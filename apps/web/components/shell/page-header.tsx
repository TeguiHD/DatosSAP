import { Badge } from '@/components/ui/badge';

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="flex flex-col gap-3">
      <Badge variant="outline" className="w-fit">
        {eyebrow}
      </Badge>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      </div>
    </header>
  );
}
