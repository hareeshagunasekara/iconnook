import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** WCAG 2.2 AA automated checks on every page template (docs/standards/ui-ux.md). */

const PAGES = [
  '/',
  '/search?q=circle',
  '/search?q=zzqxqzzq',
  '/sets',
  '/sets/iconnook-fixtures',
  '/categories',
  '/icons/iconnook-fixtures/circle',
  '/licenses',
  '/about',
  '/privacy',
  '/terms',
  '/collection',
  '/does-not-exist',
];

for (const path of PAGES) {
  test(`no axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    const summary = results.violations.map((v) => `${v.id}: ${String(v.nodes.length)} × ${v.help}`);
    expect(summary).toEqual([]);
  });
}

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
    .then((r) => r.violations.map((v) => `${v.id}: ${String(v.nodes.length)} × ${v.help}`));

test('no axe violations with the icon dialog open', async ({ page }) => {
  await page.goto('/sets/iconnook-fixtures');
  await page.waitForFunction(() => document.documentElement.dataset.iconModalReady === 'true');
  await page.locator('a[href="/icons/iconnook-fixtures/circle"]').click();
  await page.getByRole('dialog', { name: 'circle' }).getByText('Copy code').waitFor();
  expect(await axe(page)).toEqual([]);
});

test('no axe violations with search suggestions open', async ({ page }) => {
  await page.goto('/');
  await page.locator('#home-search').fill('circ');
  await page.getByRole('option', { name: 'Search for “circ”' }).waitFor();
  expect(await axe(page)).toEqual([]);
});
