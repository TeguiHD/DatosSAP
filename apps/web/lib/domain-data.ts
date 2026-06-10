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

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const primaryNav: NavItem[] = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/plantas', label: 'Plantas', icon: Factory },
  { href: '/planificacion', label: 'Planificacion', icon: CalendarDays },
  { href: '/ordenes', label: 'Ordenes', icon: ClipboardCheck },
];

export const desktopPrimaryNav: NavItem[] = [
  ...primaryNav,
  { href: '/activos', label: 'Activos', icon: Network },
  { href: '/importacion', label: 'Importacion', icon: FileUp },
];

export const secondaryNav: { label: string; items: NavItem[] }[] = [
  {
    label: 'Gestion tecnica',
    items: [
      { href: '/activos', label: 'Activos/KKS', icon: Network },
      { href: '/asignaciones', label: 'Asignaciones', icon: UsersRound },
      { href: '/importacion', label: 'Importacion', icon: FileUp },
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
      { href: '/usuarios', label: 'Usuarios', icon: ShieldCheck },
      { href: '/auditoria', label: 'Auditoria', icon: DatabaseZap },
      { href: '/configuracion', label: 'Configuracion', icon: Bell },
    ],
  },
];
