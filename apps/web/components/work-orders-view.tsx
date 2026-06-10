'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileUp, Play, RefreshCw, Search, ShieldCheck, Upload } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { WorkOrderRow } from '@/lib/api';
import { apiUrl } from '@/lib/api';

export function WorkOrdersView({ initialRows, initialError }: { initialRows: WorkOrderRow[]; initialError: string | null }) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(initialError);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
    setError(initialError);
  }, [initialRows, initialError]);

  const visibleRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter((row) => [row.code, row.title, row.plant.name, row.status].join(' ').toLowerCase().includes(search));
  }, [query, rows]);

  async function runAction(order: WorkOrderRow, action: 'start' | 'complete' | 'approve' | 'sign' | 'evidence') {
    setPendingId(order.id);
    setError(null);
    try {
      const endpoint = action === 'evidence' ? `${apiUrl(`/work-orders/${order.id}/evidence`)}` : `${apiUrl(`/work-orders/${order.id}/${action}`)}`;
      const body =
        action === 'evidence'
          ? JSON.stringify({
              fileName: `evidencia-${order.code}.txt`,
              storageKey: `local/${order.id}/evidencia.txt`,
              checksum: `pending-${order.id}`,
              mimeType: 'text/plain',
              sizeBytes: 0,
            })
          : undefined;
      const init: RequestInit = {
        method: 'POST',
      };
      if (body) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = body;
      }
      const response = await fetch(endpoint, init);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const refresh = await fetch(apiUrl('/work-orders'));
      if (refresh.ok) {
        setRows((await refresh.json()) as WorkOrderRow[]);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No se pudo ejecutar la accion');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operacion"
        title="Ordenes de Trabajo"
        description="Tabla desktop, cards mobile y sheet de ejecución conectado al lifecycle real de OT."
      />

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar OT, planta, estado o actividad" className="pl-10" />
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50 text-red-950">
          <CardHeader>
            <CardTitle>Error operacional</CardTitle>
            <CardDescription className="text-red-900">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {visibleRows.length ? (
        <>
          <section className="grid gap-3 md:hidden">
            {visibleRows.map((order) => (
              <OrderCard key={order.id} order={order} pending={pendingId === order.id} onAction={runAction} />
            ))}
          </section>

          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle>Listado ejecutable</CardTitle>
              <CardDescription>Las acciones críticas quedan auditadas por backend.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OT</TableHead>
                    <TableHead>Planta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Avance</TableHead>
                    <TableHead>Evidencia</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <p className="font-medium">{order.code}</p>
                        <p className="text-sm text-muted-foreground">{order.title}</p>
                      </TableCell>
                      <TableCell>{order.plant.name}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="min-w-32">
                        <Progress value={order.progress} />
                      </TableCell>
                      <TableCell className="font-mono">{order.evidenceFiles.length}</TableCell>
                      <TableCell className="text-right">
                        <OrderSheet order={order} pending={pendingId === order.id} onAction={runAction} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <EmptyState title="Sin ordenes de trabajo" description={error ?? 'Crea OT desde planificación o aplica el Excel de Planes Mantención.'} />
      )}
    </div>
  );
}

function OrderCard({
  order,
  pending,
  onAction,
}: {
  order: WorkOrderRow;
  pending: boolean;
  onAction: (order: WorkOrderRow, action: 'start' | 'complete' | 'approve' | 'sign' | 'evidence') => Promise<void>;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{order.code}</p>
          <p className="mt-1 text-sm text-muted-foreground">{order.title}</p>
        </div>
        <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{order.plant.name}</span>
        <span className="font-mono">{order.progress}%</span>
      </div>
      <Progress value={order.progress} className="mt-2" />
      <div className="mt-4">
        <OrderSheet order={order} pending={pending} onAction={onAction} />
      </div>
    </div>
  );
}

function OrderSheet({
  order,
  pending,
  onAction,
}: {
  order: WorkOrderRow;
  pending: boolean;
  onAction: (order: WorkOrderRow, action: 'start' | 'complete' | 'approve' | 'sign' | 'evidence') => Promise<void>;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Gestionar
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{order.code}</SheetTitle>
          <SheetDescription>{order.title}</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="resumen" className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="ejecucion">Ejec.</TabsTrigger>
            <TabsTrigger value="evidencia">Evid.</TabsTrigger>
            <TabsTrigger value="auditoria">Audit.</TabsTrigger>
          </TabsList>
          <TabsContent value="resumen" className="flex flex-col gap-4">
            <Badge variant={statusVariant(order.status)} className="w-fit">
              {order.status}
            </Badge>
            <p className="text-sm text-muted-foreground">
              Planta: {order.plant.name} · Cliente: {order.plant.client.name}
            </p>
            <Progress value={order.progress} />
          </TabsContent>
          <TabsContent value="ejecucion" className="grid gap-3">
            <ActionButton icon={Play} label="Iniciar" pending={pending} onClick={() => onAction(order, 'start')} />
            <ActionButton icon={CheckCircle2} label="Completar" pending={pending} onClick={() => onAction(order, 'complete')} />
            <ActionButton icon={ShieldCheck} label="Aprobar / cerrar" pending={pending} onClick={() => onAction(order, 'approve')} />
            <ActionButton icon={Clock3} label="Firmar" pending={pending} onClick={() => onAction(order, 'sign')} />
          </TabsContent>
          <TabsContent value="evidencia" className="grid gap-3">
            <p className="text-sm text-muted-foreground">Evidencias actuales: {order.evidenceFiles.length}</p>
            <ActionButton icon={Upload} label="Adjuntar metadata de evidencia" pending={pending} onClick={() => onAction(order, 'evidence')} />
          </TabsContent>
          <TabsContent value="auditoria" className="grid gap-3">
            {order.milestones?.length ? (
              order.milestones.map((milestone) => (
                <div key={milestone.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>{milestone.label}</span>
                    <Badge variant={milestone.status === 'COMPLETED' ? 'success' : 'secondary'}>{milestone.status}</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin hitos registrados todavía.</p>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ActionButton({
  icon: Icon,
  label,
  pending,
  onClick,
}: {
  icon: typeof FileUp;
  label: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" disabled={pending} onClick={onClick} className="justify-start">
      {pending ? <RefreshCw data-icon="inline-start" aria-hidden="true" /> : <Icon data-icon="inline-start" aria-hidden="true" />}
      {label}
    </Button>
  );
}

function statusVariant(status: string): BadgeProps['variant'] {
  if (['PENDING_EVIDENCE', 'REJECTED', 'CANCELLED'].includes(status)) return 'danger';
  if (['SCHEDULED', 'ASSIGNED', 'PENDING_CLIENT_APPROVAL', 'PENDING_SUPERVISOR_REVIEW'].includes(status)) return 'warning';
  if (['COMPLETED', 'CLOSED', 'SIGNED'].includes(status)) return 'success';
  return 'secondary';
}
