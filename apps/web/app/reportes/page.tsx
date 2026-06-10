import Link from 'next/link';
import { Download } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiGet, apiUrl, type ExecutiveReport } from '@/lib/api';
import { formatNumber } from '@/lib/utils';

export default async function ReportsPage() {
  const report = await apiGet<ExecutiveReport>('/reports/executive');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gerencia"
        title="Reportes"
        description="Reportes ejecutivos conectados a OT, plantas, HH, evidencia y estado operacional."
      />

      {report.data ? (
        <Tabs defaultValue="control">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="grid w-full grid-cols-3 sm:w-auto">
              <TabsTrigger value="control">Control</TabsTrigger>
              <TabsTrigger value="mantencion">Mantencion</TabsTrigger>
              <TabsTrigger value="firmados">Firmados</TabsTrigger>
            </TabsList>
            <Button variant="outline" asChild>
              <Link href={apiUrl('/reports/export.csv')}>
                <Download data-icon="inline-start" aria-hidden="true" />
                Exportar CSV
              </Link>
            </Button>
          </div>

          <TabsContent value="control">
            <section className="grid gap-4 md:grid-cols-4">
              <Metric label="Cumplimiento" value={report.data.compliance !== null ? `${report.data.compliance}%` : 'Sin datos'} />
              <Metric label="OT totales" value={formatNumber(report.data.totalWorkOrders)} />
              <Metric label="OT vencidas" value={formatNumber(report.data.overdueWorkOrders)} tone="danger" />
              <Metric label="HH real" value={formatNumber(report.data.actualHours)} />
            </section>
          </TabsContent>
          <TabsContent value="mantencion">
            <Card>
              <CardHeader>
                <CardTitle>Plantas con actividad</CardTitle>
                <CardDescription>Resumen de cobertura por planta.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Planta</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Activos</TableHead>
                        <TableHead>Ocurrencias</TableHead>
                        <TableHead>OT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.data.plants.map((plant) => (
                        <TableRow key={plant.id}>
                          <TableCell className="font-medium">{plant.name}</TableCell>
                          <TableCell>{plant.client.name}</TableCell>
                          <TableCell className="font-mono">{plant._count?.assetNodes ?? 0}</TableCell>
                          <TableCell className="font-mono">{plant._count?.occurrences ?? 0}</TableCell>
                          <TableCell className="font-mono">{plant._count?.workOrders ?? 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="firmados">
            <section className="grid gap-4 md:grid-cols-3">
              <Metric label="Cerradas" value={formatNumber(report.data.closedWorkOrders)} />
              <Metric label="Firmadas" value={formatNumber(report.data.signedWorkOrders)} />
              <Metric label="Exportacion" value="CSV" />
            </section>
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState title="Sin reportes disponibles" description={report.error ?? 'Importa y cierra OT para generar reportes.'} />
      )}
    </div>
  );
}

function Metric({ label, value, tone = 'info' }: { label: string; value: string; tone?: 'info' | 'danger' }) {
  return (
    <Card>
      <CardHeader>
        <Badge variant={tone}>{label}</Badge>
        <CardTitle className="mt-3 font-mono text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
