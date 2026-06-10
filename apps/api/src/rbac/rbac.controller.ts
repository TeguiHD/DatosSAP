import { Controller, Get, Headers, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ROLES } from '@datos/shared';

const matrix: Record<Role, Record<string, string[]>> = {
  SUPERADMIN: {
    '*': ['*'],
  },
  ADMIN: {
    plants: ['read', 'create', 'update'],
    kks: ['read', 'import', 'update'],
    workOrders: ['read', 'create', 'assign', 'start', 'hh', 'evidence', 'complete', 'approve', 'reject', 'reopen', 'sign'],
    assignments: ['read', 'create', 'update', 'release'],
    imports: ['read', 'dry-run', 'resolve-issue', 'apply'],
    reports: ['read', 'export'],
    users: ['read', 'create', 'update'],
    audit: ['read'],
  },
  SUPERVISOR: {
    plants: ['read'],
    kks: ['read'],
    workOrders: ['read', 'assign', 'start', 'hh', 'evidence', 'complete', 'approve', 'reject', 'reopen'],
    assignments: ['read', 'create', 'update', 'release'],
    reports: ['read', 'export'],
    audit: ['read-scoped'],
  },
  TECNICO: {
    plants: ['read-scoped'],
    kks: ['read-scoped'],
    workOrders: ['read-scoped', 'start', 'hh', 'evidence', 'complete-draft'],
    assignments: ['read-own'],
  },
  CLIENTE_VIEWER: {
    plants: ['read-scoped'],
    kks: ['read-scoped'],
    workOrders: ['read-scoped'],
    evidence: ['read-scoped'],
    reports: ['read-scoped'],
  },
};

@Controller('rbac')
export class RbacController {
  @Get('effective-permissions')
  permissions(@Headers('x-user-role') roleHeader?: string, @Query('role') roleQuery?: Role) {
    const role = this.resolveRole(roleQuery ?? roleHeader);
    return {
      roles: ROLES,
      requestedRole: role,
      requiresPlantScope: role === 'CLIENTE_VIEWER' || role === 'TECNICO',
      resources: matrix[role],
      compatibility: {
        EDITOR: ['SUPERVISOR', 'TECNICO'],
        VIEWER: ['CLIENTE_VIEWER'],
      },
    };
  }

  private resolveRole(value?: string): Role {
    if (value && (ROLES as readonly string[]).includes(value)) {
      return value as Role;
    }
    return Role.ADMIN;
  }
}
