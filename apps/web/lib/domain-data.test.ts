import { describe, expect, it } from 'vitest';
import { desktopPrimaryNav, primaryNav, secondaryNav } from './domain-data';

describe('new product contract', () => {
  it('keeps mobile daily navigation reduced', () => {
    expect(primaryNav.map((item) => item.label)).toEqual([
      'Inicio',
      'Plantas',
      'Planificacion',
      'Ordenes',
    ]);
  });

  it('keeps user-facing routes in Spanish', () => {
    const routes = [
      ...desktopPrimaryNav.map((item) => item.href),
      ...secondaryNav.flatMap((section) => section.items.map((item) => item.href)),
    ];

    expect(routes).toContain('/plantas');
    expect(routes).toContain('/planificacion');
    expect(routes).toContain('/ordenes');
    expect(routes).toContain('/activos');
    expect(routes).toContain('/importacion');
    expect(routes).not.toContain('/plants');
    expect(routes).not.toContain('/planning');
    expect(routes).not.toContain('/work-orders');
  });
});
