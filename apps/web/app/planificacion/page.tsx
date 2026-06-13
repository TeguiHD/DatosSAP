import Link from 'next/link';
import { CalendarDays, GanttChart, LayoutGrid, ListFilter } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiGet } from '@/lib/api-server';
import { type OccurrenceRow } from '@/lib/api';

export default async function PlanningPage() {
  const occurrences = await apiGet<OccurrenceRow[]>('/planning/list');
  const rows = occurrences.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operacion"
        title="Planificacion"
        description="Agenda y cronograma fusionados en una vista operacional con calendario, grilla, gantt y lista."
      />

      <Tabs defaultValue="lista">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto">
          <TabsTrigger value="calendario">
            <CalendarDays aria-hidden="true" />
            <span className="hidden sm:inline">Calendario</span>
          </TabsTrigger>
          <TabsTrigger value="grilla">
            <LayoutGrid aria-hidden="true" />
            <span className="hidden sm:inline">Grilla</span>
          </TabsTrigger>
          <TabsTrigger value="gantt">
            <GanttChart aria-hidden="true" />
            <span className="hidden sm:inline">Gantt</span>
          </TabsTrigger>
          <TabsTrigger value="lista">
            <ListFilter aria-hidden="true" />
            <span className="hidden sm:inline">Lista</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendario">
          <PlanningCards rows={rows} emptyError={occurrences.error} />
        </TabsContent>
        <TabsContent value="grilla">
          <PlanningTable rows={rows} emptyError={occurrences.error} />
        </TabsContent>
        <TabsContent value="gantt">
          <Card>
            <CardHeader>
              <CardTitle>Gantt simple</CardTitle>
              <CardDescription>Vista compacta por fecha programada.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {rows.length ? (
                rows.slice(0, 20).map((row) => (
                  <div key={row.id} className="rounded-md border bg-background p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{row.template.activityName}</span>
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div className="h-2 w-1/2 rounded-full bg-primary" />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="Sin ocurrencias" description={occurrences.error ?? 'Importa Posiciones ESSC Sur para generar ocurrencias.'} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="lista">
          <PlanningTable rows={rows} emptyError={occurrences.error} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlanningCards({ rows, emptyError }: { rows: OccurrenceRow[]; emptyError: string | null }) {
  if (!rows.length) {
    return <EmptyState title="Sin planificación" description={emptyError ?? 'Importa Posiciones ESSC Sur para crear plantillas y ocurrencias.'} />;
  }
  return (
    <section className="grid gap-3 md:hidden">
      {rows.slice(0, 25).map((row) => (
        <Link key={row.id} href={row.workOrder ? `/ordenes?id=${row.workOrder.id}` : '/ordenes'} className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{row.plant.name}</p>
              <p className="mt-1 truncate text-sm text-muted-foreground">{row.template.activityName}</p>
            </div>
            <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
          </div>
          <p className="mt-4 font-mono text-sm">{new Date(row.scheduledFor).toLocaleDateString('es-CL')}</p>
        </Link>
      ))}
    </section>
  );
}

function PlanningTable({ rows, emptyError }: { rows: OccurrenceRow[]; emptyError: string | null }) {
  if (!rows.length) {
    return <EmptyState title="Sin planificación" description={emptyError ?? 'Importa Posiciones ESSC Sur para crear plantillas y ocurrencias.'} />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lista operacional</CardTitle>
        <CardDescription>Ocurrencias ordenadas por fecha; desde aquí se convierten en OT.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="hidden overflow-hidden rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Planta</TableHead>
                <TableHead>Actividad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>OT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">{new Date(row.scheduledFor).toLocaleDateString('es-CL')}</TableCell>
                  <TableCell>{row.plant.name}</TableCell>
                  <TableCell>{row.template.activityName}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.workOrder ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/ordenes?id=${row.workOrder.id}`}>{row.workOrder.code}</Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/ordenes">Crear OT</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <PlanningCards rows={rows} emptyError={emptyError} />
      </CardContent>
    </Card>
  );
}

function statusVariant(status: string) {
  if (['OVERDUE', 'CANCELLED'].includes(status)) return 'danger';
  if (['DUE_SOON', 'SCHEDULED'].includes(status)) return 'warning';
  return 'secondary';
}
