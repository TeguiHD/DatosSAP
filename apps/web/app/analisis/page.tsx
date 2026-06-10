import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiGet, type ExecutiveReport, type KpiSummary } from '@/lib/api';
import { formatNumber } from '@/lib/utils';

export default async function AnalysisPage() {
  const [kpi, report] = await Promise.all([apiGet<KpiSummary>('/dashboard/kpi-summary'), apiGet<ExecutiveReport>('/reports/executive')]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gerencia"
        title="Analisis operacional"
        description="KPIs accionables desde datos operacionales. Cada bloque lleva a una vista filtrable o reporte."
      />

      {kpi.data || report.data ? (
        <Tabs defaultValue="cumplimiento">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto">
            <TabsTrigger value="cumplimiento">Cumplimiento</TabsTrigger>
            <TabsTrigger value="hh">HH</TabsTrigger>
            <TabsTrigger value="riesgo">Riesgo</TabsTrigger>
          </TabsList>
          <TabsContent value="cumplimiento">
            <section className="grid gap-4 md:grid-cols-3">
              <Metric title="Cumplimiento" value={report.data?.compliance !== null && report.data?.compliance !== undefined ? `${report.data.compliance}%` : 'Sin datos'} href="/reportes" />
              <Metric title="OT cerradas" value={report.data ? formatNumber(report.data.closedWorkOrders) : 'Sin datos'} href="/ordenes?status=CLOSED" />
              <Metric title="Firmadas" value={report.data ? formatNumber(report.data.signedWorkOrders) : 'Sin datos'} href="/reportes" />
            </section>
          </TabsContent>
          <TabsContent value="hh">
            <Card>
              <CardHeader>
                <CardTitle>HH plan vs real</CardTitle>
                <CardDescription>Indicador gerencial para desviación de capacidad.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Progress value={kpi.data?.plannedHours ? Math.min(100, ((kpi.data.actualHours ?? 0) / kpi.data.plannedHours) * 100) : 0} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric title="Planificadas" value={kpi.data ? formatNumber(kpi.data.plannedHours) : 'Sin datos'} href="/reportes" />
                  <Metric title="Ejecutadas" value={kpi.data ? formatNumber(kpi.data.actualHours) : 'Sin datos'} href="/reportes" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="riesgo">
            <section className="grid gap-4 md:grid-cols-3">
              <Metric title="Plantas en riesgo" value={kpi.data ? formatNumber(kpi.data.plantsInRisk) : 'Sin datos'} href="/plantas?risk=1" tone="danger" />
              <Metric title="OT vencidas" value={report.data ? formatNumber(report.data.overdueWorkOrders) : 'Sin datos'} href="/ordenes?status=vencida" tone="danger" />
              <Metric title="Próx. 30 dias" value={kpi.data ? formatNumber(kpi.data.upcomingOccurrences30d) : 'Sin datos'} href="/planificacion" tone="warning" />
            </section>
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState title="Sin datos gerenciales" description={kpi.error ?? report.error ?? 'Importa datos operacionales para habilitar BI.'} />
      )}
    </div>
  );
}

function Metric({ title, value, href, tone = 'info' }: { title: string; value: string; href: string; tone?: 'info' | 'warning' | 'danger' }) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:border-primary">
        <CardHeader>
          <Badge variant={tone}>{title}</Badge>
          <CardTitle className="mt-3 font-mono text-3xl">{value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}
