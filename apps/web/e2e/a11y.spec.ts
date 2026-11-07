import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** WCAG 2.2 AA automated checks on every page template, in light and dark mode (docs/standards/ui-ux.md). */

const PAGES = [
  '/',
  '/search?q=circle',
  '/search?q=zzqxqzzq',
  '/sets',
  '/sets/iconnook-fixtures',
  '/categories',
  '/icons/iconnook-fixtures/circle',
  '/licenses',
  '/collection',
  '/does-not-exist',
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      test(`no axe violations on ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        const summary = results.violations.map(
          (v) => `${v.id}: ${String(v.nodes.length)} × ${v.help}`,
        );
        expect(summary).toEqual([]);
      });
    }
  });
}
