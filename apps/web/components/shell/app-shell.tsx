'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BellRing, MoreHorizontal, Search } from 'lucide-react';
import { desktopPrimaryNav, primaryNav, secondaryNav, type NavItem } from '@/lib/domain-data';
import { cn } from '@/lib/utils';
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

const moreItems = secondaryNav.flatMap((section) => section.items);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const moreActive = moreItems.some((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 border-b bg-background/92 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="min-w-0 shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-ring">
            <p className="truncate font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              datos.nicoholas
            </p>
            <p className="truncate text-sm font-semibold">Operacion ESSC Sur</p>
          </Link>

          <nav aria-label="Navegacion principal" className="hidden min-w-0 flex-1 justify-center lg:flex">
            <div className="flex min-w-0 items-center gap-1 rounded-md border bg-card p-1 shadow-sm">
              {desktopPrimaryNav.map((item) => (
                <TopNavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="hidden max-w-44 justify-start text-muted-foreground sm:flex">
              <Search aria-hidden="true" />
              <span className="truncate">Buscar</span>
            </Button>
            <Button variant="outline" size="icon" aria-label="Ver alertas criticas">
              <BellRing aria-hidden="true" />
            </Button>
            <MoreMenu pathname={pathname} triggerLabel="Mas" />
          </div>
        </div>
      </header>

      <main id="main">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>

      <nav
        aria-label="Navegacion diaria"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t bg-card/96 px-2 py-2 backdrop-blur lg:hidden"
      >
        {primaryNav.map((item) => (
          <BottomNavLink key={item.href} item={item} pathname={pathname} />
        ))}
        <MoreMenu pathname={pathname} compact active={moreActive} triggerLabel="Mas" />
      </nav>
    </div>
  );
}

function TopNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
        active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
      )}
    >
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
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
}: {
  pathname: string;
  compact?: boolean;
  active?: boolean;
  triggerLabel: string;
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
          {secondaryNav.map((section) => (
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

function isActive(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
