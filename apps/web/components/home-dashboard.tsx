import Link from 'next/link';
import { AlertTriangle, ArrowRight, BarChart3, CalendarDays, ClipboardCheck, FileUp, MapPin } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/empty-state';
import { apiGet } from '@/lib/api-server';
import { type KpiSummary, type PlantRow, type WorkOrderRow } from '@/lib/api';
import { formatNumber } from '@/lib/utils';

const quickActions = [
  { label: 'Importar Excel', href: '/importacion', icon: FileUp },
  { label: 'Ver mes actual', href: '/planificacion?view=mes', icon: CalendarDays },
  { label: 'Ordenes vencidas', href: '/ordenes?status=vencida', icon: ClipboardCheck },
  { label: 'Analisis gerencial', href: '/analisis', icon: BarChart3 },
];

export async function HomeDashboard() {
  const [kpi, plants, workOrders] = await Promise.all([
    apiGet<KpiSummary>('/dashboard/kpi-summary'),
    apiGet<PlantRow[]>('/plants'),
    apiGet<WorkOrderRow[]>('/work-orders'),
  ]);
  const urgentOrders =
    workOrders.data?.filter((order) => ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_EVIDENCE'].includes(order.status)).slice(0, 6) ?? [];
  const hasData = Boolean(kpi.data && (kpi.data.plantsTotal > 0 || urgentOrders.length > 0));

  return (
    <div className="flex flex-col gap-6">
      {kpi.data?.overdueWorkOrders ? (
        <Alert className="border-red-200 bg-red-50 text-red-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" />
              <div>
                <AlertTitle>{kpi.data.overdueWorkOrders} ordenes vencidas requieren accion</AlertTitle>
                <AlertDescription className="text-red-900">
                  Prioriza asignacion, evidencia y cierre antes de agregar nuevos modulos.
                </AlertDescription>
              </div>
            </div>
            <Button asChild className="shrink-0">
              <Link href="/ordenes?status=vencida">
                Ver ordenes
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>Base operacional lista para datos reales</AlertTitle>
          <AlertDescription>
            La portada consume API. Si ves valores vacios, ejecuta la importacion inicial o levanta el backend.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <Badge variant="outline">Operacion viva</Badge>
            <h1 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">Que requiere atencion ahora</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              Datos reales desde API: riesgo, plantas, ordenes, HH, aprobaciones y reportes accionables.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button key={action.label} variant="outline" asChild className="h-auto justify-between py-3">
                  <Link href={action.href}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon aria-hidden="true" />
                      <span className="truncate">{action.label}</span>
                    </span>
                    <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Avance operacional</CardTitle>
            <CardDescription>Cumplimiento real desde ordenes cerradas y firmadas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Cumplimiento</span>
              <span className="font-mono text-muted-foreground">
                {kpi.data ? `${formatNumber(Math.max(0, 100 - kpi.data.overdueWorkOrders))}%` : 'Sin datos'}
              </span>
            </div>
            <Progress value={kpi.data ? Math.max(0, 100 - kpi.data.overdueWorkOrders) : 0} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MetricMini label="HH plan" value={kpi.data ? formatNumber(kpi.data.plannedHours) : 'Sin datos'} />
              <MetricMini label="HH real" value={kpi.data ? formatNumber(kpi.data.actualHours) : 'Sin datos'} />
            </div>
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="operacion" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="operacion" className="flex-1 sm:flex-none">
            Operacion
          </TabsTrigger>
          <TabsTrigger value="gerencia" className="flex-1 sm:flex-none">
            Gerencia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operacion">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Plantas" value={kpi.data ? formatNumber(kpi.data.plantsTotal) : 'Sin datos'} href="/plantas" />
            <KpiCard label="En riesgo" value={kpi.data ? formatNumber(kpi.data.plantsInRisk) : 'Sin datos'} href="/plantas?risk=1" />
            <KpiCard label="Vencidas" value={kpi.data ? formatNumber(kpi.data.overdueWorkOrders) : 'Sin datos'} href="/ordenes?status=vencida" tone="danger" />
            <KpiCard label="Próx. 30 dias" value={kpi.data ? formatNumber(kpi.data.upcomingOccurrences30d) : 'Sin datos'} href="/planificacion" tone="warning" />
            <KpiCard label="Aprobaciones" value={kpi.data ? formatNumber(kpi.data.pendingApprovals) : 'Sin datos'} href="/ordenes?status=PENDING_CLIENT_APPROVAL" />
            <KpiCard label="AHI prom." value={kpi.data?.averageHealthScore ? `${Math.round(kpi.data.averageHealthScore)}%` : 'Sin datos'} href="/analisis" />
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Trabajo activo</CardTitle>
                <CardDescription>Ordenes que requieren seguimiento operacional.</CardDescription>
              </CardHeader>
              <CardContent>
                {urgentOrders.length ? (
                  <>
                    <div className="grid gap-3 md:hidden">
                      {urgentOrders.map((order) => (
                        <Link key={order.id} href={`/ordenes?id=${order.id}`} className="rounded-lg border bg-card p-4 transition-colors hover:border-primary">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold">{order.code}</p>
                              <p className="mt-1 truncate text-sm text-muted-foreground">{order.title}</p>
                            </div>
                            <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground">{order.plant.name}</p>
                        </Link>
                      ))}
                    </div>
                    <div className="hidden overflow-hidden rounded-lg border md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>OT</TableHead>
                            <TableHead>Planta</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Avance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {urgentOrders.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell className="font-medium">{order.code}</TableCell>
                              <TableCell>{order.plant.name}</TableCell>
                              <TableCell>
                                <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
                              </TableCell>
                              <TableCell className="font-mono">{order.progress}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title={hasData ? 'Sin ordenes activas' : 'Aun no hay datos operacionales'}
                    description={hasData ? 'No existen ordenes pendientes en este momento.' : 'Importa Excel o conecta la API para poblar el tablero.'}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mapa operacional</CardTitle>
                <CardDescription>Lista geográfica inicial desde plantas reales.</CardDescription>
              </CardHeader>
              <CardContent>
                {plants.data?.length ? (
                  <div className="relative min-h-72 overflow-hidden rounded-lg border bg-[linear-gradient(135deg,#dbeafe,#f8fafc_46%,#dcfce7)] p-4">
                    <div className="grid gap-2">
                      {plants.data.slice(0, 8).map((plant) => (
                        <Link key={plant.id} href={`/plantas?id=${plant.id}`} className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <MapPin aria-hidden="true" />
                            <span className="truncate">{plant.name}</span>
                          </span>
                          <Badge variant={plant.healthScore && plant.healthScore < 70 ? 'danger' : 'secondary'}>{plant.healthScore ?? 'AHI'}</Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState title="Sin plantas cargadas" description={plants.error ?? 'Importa KKS Fiori para crear el maestro de plantas y activos.'} />
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="gerencia">
          <section className="grid gap-4 md:grid-cols-3">
            <KpiCard label="HH planificadas" value={kpi.data ? formatNumber(kpi.data.plannedHours) : 'Sin datos'} href="/analisis" />
            <KpiCard label="HH ejecutadas" value={kpi.data ? formatNumber(kpi.data.actualHours) : 'Sin datos'} href="/analisis" />
            <KpiCard label="Reportes" value={hasData ? 'Disponibles' : 'Sin datos'} href="/reportes" />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}

function KpiCard({ label, value, href, tone = 'info' }: { label: string; value: string; href: string; tone?: 'info' | 'warning' | 'danger' }) {
  return (
    <Link href={href} className="block min-w-0">
      <Card className="h-full transition-colors hover:border-primary">
        <CardHeader className="gap-2">
          <Badge variant={tone}>{label}</Badge>
          <CardTitle className="font-mono text-2xl">{value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

function statusVariant(status: string) {
  if (['OVERDUE', 'REJECTED', 'CANCELLED', 'PENDING_EVIDENCE'].includes(status)) return 'danger';
  if (['SCHEDULED', 'ASSIGNED', 'PENDING_CLIENT_APPROVAL', 'PENDING_SUPERVISOR_REVIEW'].includes(status)) return 'warning';
  return 'success';
}
