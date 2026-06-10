import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api';

interface NotificationEvent {
  id: string;
  severity: string;
  type: string;
  title: string;
  createdAt: string;
  dispatchedAt: string | null;
}

export default async function SettingsPage() {
  const events = await apiGet<NotificationEvent[]>('/notifications/events');
  const rows = events.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administracion"
        title="Configuracion"
        description="Preferencias push y eventos críticos. El envío Web Push real queda condicionado a VAPID y suscripciones."
      />

      <Card>
        <CardHeader>
          <CardTitle>Preferencias push</CardTitle>
          <CardDescription>Estado visual preparado; se activa al conectar usuario autenticado y dispositivo suscrito.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3 rounded-md border bg-background p-4">
          <div>
            <p className="font-medium">Push operacional</p>
            <p className="text-sm text-muted-foreground">Solo eventos críticos: asignación, vencimiento, aprobación, recertificación y reapertura.</p>
          </div>
          <Switch disabled aria-label="Push operacional pendiente de usuario autenticado" />
        </CardContent>
      </Card>

      {rows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Eventos de notificación</CardTitle>
            <CardDescription>Eventos reales listos para dispatch backend.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severidad</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Dispatch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <Badge variant={event.severity === 'CRITICAL' ? 'danger' : 'warning'}>{event.severity}</Badge>
                      </TableCell>
                      <TableCell>{event.type}</TableCell>
                      <TableCell>{event.title}</TableCell>
                      <TableCell>{event.dispatchedAt ? 'Enviado' : 'Pendiente'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="Sin eventos de notificación" description={events.error ?? 'Las OT críticas y aprobaciones crearán eventos cuando existan datos.'} />
      )}
    </div>
  );
}
