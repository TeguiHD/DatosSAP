'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Role } from '@datos/shared';
import { BellRing, MoreHorizontal, Search } from 'lucide-react';
import { navSections, primaryNav, secondaryNav, type NavItem, type NavSection } from '@/lib/domain-data';
import { cn } from '@/lib/utils';
import { PageTransition } from '@/components/page-transition';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function AppShell({ children, role }: { children: ReactNode; role: Role | null }) {
  const pathname = usePathname();
  if (pathname.startsWith('/login')) {
    return <>{children}</>;
  }

  const visibleSections = filterSections(navSections, role);
  const visiblePrimaryNav = primaryNav.filter((item) => canSeeItem(item, role));
  const visibleSecondaryNav = filterSections(secondaryNav, role);
  const moreItems = visibleSecondaryNav.flatMap((section) => section.items);
  const moreActive = moreItems.some((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pl-20 lg:pl-72">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow"
      >
        Saltar al contenido
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden border-r bg-card md:flex md:w-20 md:flex-col lg:w-72">
        <SidebarBrand />
        <nav aria-label="Navegacion principal" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
          {visibleSections.map((section) => (
            <SidebarSection key={section.label} section={section} pathname={pathname} />
          ))}
        </nav>
      </aside>

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/inicio" className="min-w-0 shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-ring md:hidden">
            <p className="truncate font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              datos.nicoholas
            </p>
            <p className="truncate text-sm font-semibold">Operacion ESSC Sur</p>
          </Link>
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-medium text-muted-foreground">Operacion ESSC Sur</p>
            <p className="truncate text-base font-semibold">Centro Sur 3039</p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="hidden max-w-52 justify-start text-muted-foreground sm:flex">
              <Search aria-hidden="true" />
              <span className="truncate">Buscar</span>
            </Button>
            <Button variant="outline" size="icon" aria-label="Ver alertas criticas">
              <BellRing aria-hidden="true" />
            </Button>
            <div className="md:hidden">
              <MoreMenu pathname={pathname} triggerLabel="Mas" sections={visibleSecondaryNav} />
            </div>
          </div>
        </div>
      </header>

      <main id="main">
        <PageTransition className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </PageTransition>
      </main>

      <nav
        aria-label="Navegacion diaria"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card/96 px-2 py-2 backdrop-blur md:hidden"
      >
        {visiblePrimaryNav.map((item) => (
          <BottomNavLink key={item.href} item={item} pathname={pathname} />
        ))}
        <MoreMenu pathname={pathname} compact active={moreActive} triggerLabel="Mas" sections={visibleSecondaryNav} />
      </nav>
    </div>
  );
}

function SidebarBrand() {
  return (
    <Link href="/inicio" className="flex h-16 items-center gap-3 border-b px-4 focus:outline-none focus:ring-2 focus:ring-ring">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground">
        DN
      </div>
      <div className="hidden min-w-0 lg:block">
        <p className="truncate font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">datos.nicoholas</p>
        <p className="truncate text-sm font-semibold">Operacion industrial</p>
      </div>
    </Link>
  );
}

function SidebarSection({ section, pathname }: { section: NavSection; pathname: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="hidden px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:block">
        {section.label}
      </h2>
      <div className="flex flex-col gap-1">
        {section.items.map((item) => (
          <SidebarNavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </section>
  );
}

function SidebarNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      className={cn(
        'flex h-11 items-center justify-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring lg:justify-start',
        active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
      )}
      aria-label={item.label}
    >
      <Icon aria-hidden="true" className="shrink-0" />
      <span className="hidden truncate lg:inline">{item.label}</span>
    </Link>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="lg:hidden">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

function BottomNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
        active && 'bg-primary text-primary-foreground',
      )}
    >
      <Icon aria-hidden="true" />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

function MoreMenu({
  pathname,
  compact = false,
  active = false,
  triggerLabel,
  sections,
}: {
  pathname: string;
  compact?: boolean;
  active?: boolean;
  triggerLabel: string;
  sections: NavSection[];
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        {compact ? (
          <button
            type="button"
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
              active && 'bg-primary text-primary-foreground',
            )}
          >
            <MoreHorizontal aria-hidden="true" />
            <span>{triggerLabel}</span>
          </button>
        ) : (
          <Button variant="outline" size="sm">
            <MoreHorizontal aria-hidden="true" />
            <span className="hidden sm:inline">{triggerLabel}</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Mas modulos</SheetTitle>
          <SheetDescription>Accesos secundarios agrupados para no saturar la operacion diaria.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-6">
          {sections.map((section) => (
            <section key={section.label} className="flex flex-col gap-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {section.label}
              </h2>
              <div className="grid gap-2">
                {section.items.map((item) => {
                  const sectionActive = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <SheetClose key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-3 text-sm font-medium transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring',
                          sectionActive && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Icon aria-hidden="true" className="shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </span>
                      </Link>
                    </SheetClose>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function filterSections(sections: NavSection[], role: Role | null) {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canSeeItem(item, role)),
    }))
    .filter((section) => section.items.length > 0);
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function canSeeItem(item: NavItem, role: Role | null) {
  if (!item.roles?.length) {
    return true;
  }

  return Boolean(role && item.roles.includes(role));
}
