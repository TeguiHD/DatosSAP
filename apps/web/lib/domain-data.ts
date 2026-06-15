import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardCheck,
  DatabaseZap,
  Factory,
  FileUp,
  GitBranch,
  Home,
  Network,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@datos/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const primaryNav: NavItem[] = [
  { href: '/inicio', label: 'Inicio', icon: Home },
  { href: '/plantas', label: 'Plantas', icon: Factory },
  { href: '/planificacion', label: 'Planificacion', icon: CalendarDays },
  { href: '/ordenes', label: 'Ordenes', icon: ClipboardCheck },
];

export const navSections: NavSection[] = [
  {
    label: 'Operacion',
    items: primaryNav,
  },
  {
    label: 'Gestion tecnica',
    items: [
      { href: '/activos', label: 'Activos/KKS', icon: Network },
      { href: '/asignaciones', label: 'Asignaciones', icon: UsersRound, roles: ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'] },
      { href: '/importacion', label: 'Importacion', icon: FileUp, roles: ['SUPERADMIN', 'ADMIN'] },
    ],
  },
  {
    label: 'Gerencia',
    items: [
      { href: '/analisis', label: 'Analisis', icon: BarChart3 },
      { href: '/reportes', label: 'Reportes', icon: Activity },
      { href: '/recertificaciones', label: 'Recertificaciones', icon: GitBranch },
    ],
  },
  {
    label: 'Administracion',
    items: [
      { href: '/usuarios', label: 'Usuarios', icon: ShieldCheck, roles: ['SUPERADMIN', 'ADMIN'] },
      { href: '/auditoria', label: 'Auditoria', icon: DatabaseZap, roles: ['SUPERADMIN', 'ADMIN'] },
      { href: '/configuracion', label: 'Configuracion', icon: Bell, roles: ['SUPERADMIN', 'ADMIN'] },
    ],
  },
];

export const secondaryNav = navSections.slice(1);
