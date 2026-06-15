import { expect, test } from '@playwright/test';

const protectedSpanishRoutes = [
  '/inicio',
  '/plantas',
  '/planificacion',
  '/ordenes',
  '/activos',
  '/importacion',
  '/analisis',
  '/asignaciones',
  '/reportes',
  '/recertificaciones',
  '/usuarios',
  '/auditoria',
  '/configuracion',
];

const redirects = [
  ['/', '/inicio'],
  ['/dashboard', '/inicio'],
  ['/plants', '/plantas'],
  ['/planning', '/planificacion'],
  ['/work-orders', '/ordenes'],
] as const;

test('login is rendered without the operational shell', async ({ page }) => {
  await page.goto('/login');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Plataforma operacional ESSC Sur' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegacion principal' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Navegacion movil' })).toHaveCount(0);
});

for (const [from, to] of redirects) {
  test(`redirects ${from} to ${to}`, async ({ request }) => {
    const response = await request.get(from, { maxRedirects: 0 });

    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    expect(response.headers().location).toBe(to);
  });
}

for (const route of protectedSpanishRoutes) {
  test(`protected route ${route} requires login`, async ({ page }) => {
    await page.goto(route);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Plataforma operacional ESSC Sur' })).toBeVisible();
  });
}

for (const width of [375, 768, 1024, 1440]) {
  test(`login has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');

    const hasOverflow = await page.evaluate(() => {
      const documentWidth = document.documentElement.scrollWidth;
      const viewportWidth = document.documentElement.clientWidth;
      return documentWidth > viewportWidth + 1;
    });

    expect(hasOverflow).toBe(false);
  });
}
