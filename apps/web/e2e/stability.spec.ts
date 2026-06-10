import { expect, test } from '@playwright/test';

const spanishRoutes = [
  '/plantas',
  '/planificacion',
  '/ordenes',
  '/activos',
  '/importacion',
  '/analisis',
  '/asignaciones',
  '/reportes',
  '/configuracion',
];

const legacyRedirects = [
  ['/plants', '/plantas'],
  ['/planning', '/planificacion'],
  ['/work-orders', '/ordenes'],
] as const;

test('home stays mounted and does not navigate by itself', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('/_next/webpack-hmr')) {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Que requiere atencion ahora' })).toBeVisible();

  const initialUrl = page.url();
  await page.waitForTimeout(5_000);

  await expect(page.getByRole('heading', { name: 'Que requiere atencion ahora' })).toBeVisible();
  expect(page.url()).toBe(initialUrl);
  expect(consoleErrors).toEqual([]);
});

for (const route of spanishRoutes) {
  test(`spanish route ${route} responds`, async ({ page }) => {
    const response = await page.goto(route);

    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('main')).toBeVisible();
  });
}

for (const [from, to] of legacyRedirects) {
  test(`redirects ${from} to ${to}`, async ({ page }) => {
    await page.goto(from);

    await expect(page).toHaveURL(new RegExp(`${to}$`));
  });
}

for (const width of [375, 768, 1024, 1440]) {
  test(`home has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    const hasOverflow = await page.evaluate(() => {
      const documentWidth = document.documentElement.scrollWidth;
      const viewportWidth = document.documentElement.clientWidth;
      return documentWidth > viewportWidth + 1;
    });

    expect(hasOverflow).toBe(false);
  });
}
