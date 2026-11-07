import { expect, test } from '@playwright/test';

/** Reflow at 320 CSS px (WCAG 1.4.10) and core features without JavaScript. */

const PAGES = [
  '/',
  '/search?q=circle',
  '/sets',
  '/sets/iconnook-fixtures',
  '/icons/iconnook-fixtures/circle',
  '/licenses',
  '/about',
];

test.describe('at 320px wide', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  for (const path of PAGES) {
    test(`no horizontal scrolling on ${path}`, async ({ page }) => {
      await page.goto(path);
      // Name the offenders so CI failures (different fonts on Linux) are easy to fix.
      const wide = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        return [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > limit + 1)
          .slice(0, 5)
          .map(
            (el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 60)}`,
          );
      });
      expect(wide).toEqual([]);
    });
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the menu button opens and closes the main navigation', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Menu' });
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await nav.getByRole('link', { name: 'About' }).focus();
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(button).toBeFocused();
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the main navigation is shown on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Icon sets' }),
    ).toBeVisible();
  });

  test('search works with a plain form submit', async ({ page }) => {
    await page.goto('/');
    await page.locator('#home-search').fill('circle');
    await page.locator('#home-search').press('Enter');
    await expect(page).toHaveURL(/\/search\?q=circle/);
    await expect(page.getByRole('list', { name: 'Search results for circle' })).toBeVisible();
  });

  test('icon page still offers preview, downloads and SVG code', async ({ page }) => {
    await page.goto('/icons/iconnook-fixtures/circle');
    await expect(page.getByRole('img', { name: /preview on light background/ })).toBeVisible();
    await expect(page.locator('[role="img"] > svg')).toHaveCount(2); // both icon previews (light and dark background) inline, no requests
    await expect(page.getByRole('link', { name: 'Download SVG' })).toHaveAttribute(
      'href',
      /circle\.svg\?download=1&size=48$/,
    );
    await expect(page.getByRole('link', { name: /Download PNG/ })).toBeVisible();
    const code = page.locator('#code-panel code');
    await expect(code).toContainText('<svg ');
    await expect(code).toContainText('xmlns="http://www.w3.org/2000/svg"');
  });

  test('filters work with the Apply button', async ({ page }) => {
    await page.goto('/search?q=circle');
    await page.getByLabel('Kind').selectOption('ui');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/type=ui/);
  });
});
