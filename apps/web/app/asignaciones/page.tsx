import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api-server';
import { type AssignmentWeek } from '@/lib/api';

export default async function AssignmentsPage() {
  const week = await apiGet<AssignmentWeek>('/assignments/week');
  const rows = week.data?.rows ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestion tecnica"
        title="Asignaciones y capacidad"
        description="Carga semanal por responsable, especialidad y sobrecarga accionable."
      />

      {rows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Semana operacional</CardTitle>
            <CardDescription>
              {week.data ? `${new Date(week.data.from).toLocaleDateString('es-CL')} - ${new Date(week.data.to).toLocaleDateString('es-CL')}` : 'Sin rango'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:hidden">
              {rows.map((row) => (
                <div key={row.personnel.id} className="rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{row.personnel.name}</p>
                      <p className="text-sm text-muted-foreground">{row.personnel.primarySpecialty?.name ?? 'Sin especialidad'}</p>
                    </div>
                    <Badge variant={row.overloaded ? 'danger' : 'secondary'}>{row.load}%</Badge>
                  </div>
                  <Progress value={row.load} className="mt-4" />
                </div>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Especialidad</TableHead>
                    <TableHead>Carga</TableHead>
                    <TableHead>HH</TableHead>
                    <TableHead>OT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.personnel.id}>
                      <TableCell className="font-medium">{row.personnel.name}</TableCell>
                      <TableCell>{row.personnel.primarySpecialty?.name ?? 'Sin especialidad'}</TableCell>
                      <TableCell>
                        <div className="flex min-w-40 items-center gap-3">
                          <Progress value={row.load} />
                          <Badge variant={row.overloaded ? 'danger' : 'secondary'}>{row.load}%</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {row.plannedHours}/{row.capacityHours}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <Link href="/ordenes">{row.assignments.length} OT</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="Sin personal o asignaciones" description={week.error ?? 'Crea personal y asigna OT para ver capacidad semanal.'} />
      )}
    </div>
  );
}
