import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api';

interface AuditEvent {
  id: string;
  resource: string;
  resourceId: string;
  action: string;
  createdAt: string;
}

export default async function AuditPage() {
  const events = await apiGet<AuditEvent[]>('/audit/events');
  const rows = events.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administracion"
        title="Auditoria"
        description="Trazabilidad real de importación, órdenes, evidencia, permisos y reportes."
      />

      {rows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Eventos recientes</CardTitle>
            <CardDescription>Últimas acciones auditadas por backend.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono">{new Date(event.createdAt).toLocaleString('es-CL')}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{event.resource}</Badge>
                      </TableCell>
                      <TableCell>{event.action}</TableCell>
                      <TableCell className="font-mono text-xs">{event.resourceId}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="Sin eventos auditados" description={events.error ?? 'Las acciones críticas crearán eventos cuando se ejecuten.'} />
      )}
    </div>
  );
}
