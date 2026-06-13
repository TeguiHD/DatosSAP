import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api-server';
import { type PlantRow } from '@/lib/api';

export default async function PlantsPage() {
  const plants = await apiGet<PlantRow[]>('/plants');
  const rows = plants.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operacion"
        title="Plantas por riesgo"
        description="Listado real desde API, ordenado para resolver primero vencidas, AHI bajo y alta carga operacional."
      />

      <form className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
          <Input name="q" placeholder="Buscar planta, cliente o codigo" className="pl-10" />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {rows.length ? (
        <>
          <section className="grid gap-3 md:hidden">
            {rows.map((plant) => (
              <Link key={plant.id} href={`/plantas?id=${plant.id}`} className="rounded-lg border bg-card p-4 transition-colors hover:border-primary">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{plant.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{plant.client.name}</p>
                  </div>
                  <Badge variant={plant.healthScore && plant.healthScore < 70 ? 'danger' : 'secondary'}>{plant.status}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <Mini label="AHI" value={plant.healthScore?.toString() ?? 'N/D'} />
                  <Mini label="Activos" value={String(plant._count?.assetNodes ?? 0)} />
                  <Mini label="OT" value={String(plant._count?.workOrders ?? 0)} />
                </div>
              </Link>
            ))}
          </section>

          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle>Maestro de plantas</CardTitle>
              <CardDescription>Click en una planta para profundizar hacia activos, planificación y OT.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Planta</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>AHI</TableHead>
                    <TableHead>Activos</TableHead>
                    <TableHead>OT</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((plant) => (
                    <TableRow key={plant.id}>
                      <TableCell className="font-medium">{plant.name}</TableCell>
                      <TableCell>{plant.client.name}</TableCell>
                      <TableCell>
                        <Badge variant={plant.status === 'ACTIVE' ? 'success' : 'warning'}>{plant.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{plant.healthScore ?? 'N/D'}</TableCell>
                      <TableCell className="font-mono">{plant._count?.assetNodes ?? 0}</TableCell>
                      <TableCell className="font-mono">{plant._count?.workOrders ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/activos?plantId=${plant.id}`}>
                            Activos
                            <ArrowRight data-icon="inline-end" aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyState title="Sin plantas operacionales" description={plants.error ?? 'Carga el árbol KKS Fiori para crear plantas y activos.'} />
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold">{value}</p>
    </div>
  );
}
