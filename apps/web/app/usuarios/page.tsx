import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api';

interface PermissionsResponse {
  roles: string[];
  requestedRole: string;
  requiresPlantScope: boolean;
  resources: Record<string, string[]>;
}

export default async function UsersPage() {
  const permissions = await apiGet<PermissionsResponse>('/rbac/effective-permissions');
  const resources = permissions.data?.resources ? Object.entries(permissions.data.resources) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administracion"
        title="Usuarios y permisos"
        description="Matriz efectiva por rol/recurso/planta. La gestión de usuarios queda bloqueada hasta tener auth productiva."
      />

      {permissions.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Permisos efectivos</CardTitle>
            <CardDescription>Rol auditado: {permissions.data.requestedRole}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resources.map(([resource, actions]) => (
                    <TableRow key={resource}>
                      <TableCell className="font-medium">{resource}</TableCell>
                      <TableCell>{actions.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="RBAC no disponible" description={permissions.error ?? 'Levanta la API para auditar permisos efectivos.'} />
      )}
    </div>
  );
}
