import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet, type PlantRow } from '@/lib/api';

export default async function RecertificationsPage() {
  const plants = await apiGet<PlantRow[]>('/plants');
  const rows = plants.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gerencia"
        title="Recertificaciones"
        description="Vista preparada para hitos reales por planta; no recalcula fechas irregulares sin fuente importada."
      />

      {rows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Plantas pendientes de calendario de recertificación</CardTitle>
            <CardDescription>Cuando se importe la fuente de recertificaciones, esta tabla mostrará próximos hitos y documentos.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Planta</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>AHI</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((plant) => (
                    <TableRow key={plant.id}>
                      <TableCell className="font-medium">{plant.name}</TableCell>
                      <TableCell>{plant.client.name}</TableCell>
                      <TableCell className="font-mono">{plant.healthScore ?? 'N/D'}</TableCell>
                      <TableCell>{plant.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="Sin recertificaciones cargadas" description={plants.error ?? 'Importa plantas y luego carga hitos de recertificación reales.'} />
      )}
    </div>
  );
}
