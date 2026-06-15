import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function ErrorState({
  title = 'No se pudo cargar la informacion',
  description = 'Intenta nuevamente. Si el problema persiste, revisa la conexion con la API.',
  retryHref,
}: {
  title?: string;
  description?: string;
  retryHref?: string;
}) {
  return (
    <Alert className="border-red-200 bg-red-50 text-red-950">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-red-900">{description}</AlertDescription>
      {retryHref ? (
        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <a href={retryHref}>
              <RefreshCcw data-icon="inline-start" aria-hidden="true" />
              Reintentar
            </a>
          </Button>
        </div>
      ) : null}
    </Alert>
  );
}
