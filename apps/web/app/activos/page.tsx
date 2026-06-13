import Link from 'next/link';
import { History, Network, Search } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api-server';
import { type KksNodeRow } from '@/lib/api';

export default async function AssetsPage() {
  const nodes = await apiGet<KksNodeRow[]>('/kks/tree');
  const rows = nodes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestion tecnica"
        title="Activos / KKS"
        description="Árbol técnico navegable desde API. Busca por KKS, equipo, descripción o planta."
      />

      <form className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
          <Input name="q" placeholder="Buscar KKS, equipo o descripcion" className="pl-10" />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {rows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Árbol raíz</CardTitle>
            <CardDescription>Los hijos se muestran acotados para mantener rendimiento y lectura móvil.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:hidden">
              {rows.map((node) => (
                <AssetCard key={node.id} node={node} />
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KKS / objeto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Planta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Hijos</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((node) => (
                    <TableRow key={node.id}>
                      <TableCell>
                        <p className="font-mono text-xs font-semibold">{node.technicalObject}</p>
                        <p className="text-sm text-muted-foreground">{node.kksDescription ?? node.equipmentDescription ?? 'Sin descripcion'}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{node.nodeType}</Badge>
                      </TableCell>
                      <TableCell>{node.plant?.name ?? 'Sin planta'}</TableCell>
                      <TableCell>{node.systemStatus ?? 'N/D'}</TableCell>
                      <TableCell className="font-mono">{node.children?.length ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <AssetSheet node={node} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="Sin árbol KKS" description={nodes.error ?? 'Ejecuta importación KKS Fiori para poblar activos.'} />
      )}
    </div>
  );
}

function AssetCard({ node }: { node: KksNodeRow }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold">{node.technicalObject}</p>
          <p className="mt-1 text-sm text-muted-foreground">{node.kksDescription ?? node.equipmentDescription ?? 'Sin descripcion'}</p>
        </div>
        <Badge variant="secondary">{node.nodeType}</Badge>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Network aria-hidden="true" />
          {node.children?.length ?? 0} hijos
        </span>
        <AssetSheet node={node} />
      </div>
    </div>
  );
}

function AssetSheet({ node }: { node: KksNodeRow }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <History data-icon="inline-start" aria-hidden="true" />
          Historial
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{node.technicalObject}</SheetTitle>
          <SheetDescription>{node.kksDescription ?? node.equipmentDescription ?? 'Activo sin descripción'}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-4">
          <Badge variant="secondary">{node.nodeType}</Badge>
          <p className="text-sm text-muted-foreground">
            Planta: {node.plant?.name ?? 'Sin planta'} · Estado: {node.systemStatus ?? 'N/D'} · Centro: {node.center ?? 'N/D'}
          </p>
          <Button asChild>
            <Link href={`/ordenes?assetId=${node.id}`}>Ver OT del activo</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
