import { expect, test } from '@playwright/test';

/** Critical user journeys (docs/standards/testing.md). Data: the CC0 fixture set "iconnook-fixtures". */

const SET = 'iconnook-fixtures';

test('search → open icon → customize → copy SVG', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`/sets/${SET}`);
  const setSearch = page.getByRole('searchbox', { name: 'Search in IconNook Fixtures' });
  await setSearch.fill('circle');
  await setSearch.press('Enter');
  await expect(page).toHaveURL(/\/search\?set=iconnook-fixtures&q=circle/);

  await page.locator(`a[href="/icons/${SET}/circle"]`).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'circle' })).toBeVisible();

  // Island hydrates when visible; then customize.
  await page.getByLabel('Color as hex code').fill('#ff0000');
  await page.getByLabel('Size').selectOption('64');
  await expect(page.getByRole('tabpanel')).toContainText('color="#ff0000"');
  await expect(page.getByRole('tabpanel')).toContainText('width="64"');
  await page.getByRole('button', { name: 'Copy SVG' }).click();
  await expect(page.getByRole('button', { name: 'Copied ✓' })).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(/^<svg /);
  expect(clipboard).toContain('color="#ff0000"');
  await expect(page.locator('#announcer')).toHaveText(/Copied SVG code/);
});

test('copy as JSX, Vue and the other formats via keyboard-operable tabs', async ({ page }) => {
  await page.goto(`/icons/${SET}/plus`);
  const svgTab = page.getByRole('tab', { name: 'SVG' });
  await svgTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'JSX' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'JSX' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText(
    'export function IconnookFixturesPlus(props)',
  );
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tabpanel')).toContainText('<template>');
});

test('downloads SVG and PNG at the chosen size', async ({ page, request }) => {
  await page.goto(`/icons/${SET}/square`);
  await page.getByLabel('Size').selectOption('128');
  const svgHref = await page.getByRole('link', { name: 'Download SVG' }).getAttribute('href');
  const pngHref = await page
    .getByRole('link', { name: /Download PNG \(128 px\)/ })
    .getAttribute('href');

  const svg = await request.get(svgHref ?? '', { maxRedirects: 0 });
  expect(svg.status()).toBe(200);
  expect(svg.headers()['content-type']).toContain('image/svg+xml');
  expect(svg.headers()['content-disposition']).toContain('attachment');

  const png = await request.get(pngHref ?? '', { maxRedirects: 0 });
  expect(png.status()).toBe(200);
  const body = await png.body();
  expect(body.subarray(1, 4).toString()).toBe('PNG');
  expect(body.readUInt32BE(16)).toBe(128);
});

test('filters live in the URL and survive reload and Back', async ({ page }) => {
  await page.goto('/search?q=circle');
  await page.getByLabel('Kind').selectOption('ui');
  await expect(page).toHaveURL(/type=ui/);
  await page.getByLabel('License').selectOption('A');
  await expect(page).toHaveURL(/type=ui.*tier=A|tier=A.*type=ui/);

  await page.reload();
  await expect(page.getByLabel('Kind')).toHaveValue('ui');
  await expect(page.getByLabel('License')).toHaveValue('A');

  await page.goBack();
  await expect(page).not.toHaveURL(/tier=A/);
  await expect(page.getByLabel('Kind')).toHaveValue('ui');
});

test('keyboard only: "/" focuses search, arrows move through the grid, Enter opens', async ({
  page,
}) => {
  await page.goto(`/sets/${SET}`);
  await page.keyboard.press('/');
  await expect(page.locator('#site-search')).toBeFocused();

  const grid = page.getByRole('list', { name: 'IconNook Fixtures icons' });
  const links = grid.getByRole('link');
  await expect(links).toHaveCount(3);
  // The grid is a single tab stop.
  await expect(links.nth(0)).toHaveAttribute('tabindex', '0');
  await expect(links.nth(1)).toHaveAttribute('tabindex', '-1');

  await links.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(links.nth(2)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(links.nth(0)).toBeFocused();

  const outline = await links.nth(0).evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none'); // focus is visible

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/icons/${SET}/circle$`));
});

test('set cards preview a real icon from each set and link to it', async ({ page }) => {
  await page.goto('/sets');
  const card = page.locator(`a[href="/sets/${SET}"]`);
  await expect(card).toContainText('No attribution needed');
  // The set's sample icon, as a lazy image of its cacheable SVG URL.
  await expect(card.locator('img')).toHaveAttribute(
    'src',
    /\/v1\/icons\/iconnook-fixtures\/plus\.svg$/,
  );
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/sets/${SET}$`));
});

test('no results suggests next steps instead of a dead end', async ({ page }) => {
  await page.goto('/search?q=zzqxqzzq&type=flags');
  await expect(page.getByRole('status')).toHaveText('No icons found.');
  await expect(page.getByRole('link', { name: 'Search again without filters' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'browse all icon sets' })).toBeVisible();
});

test('unknown pages and icons return a helpful 404', async ({ page }) => {
  const res = await page.goto(`/icons/${SET}/does-not-exist`);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible();
  // Header search + the 404 page's own search, each a distinctly named landmark.
  await expect(page.getByRole('search', { name: 'Site search' })).toBeVisible();
  await expect(page.getByRole('search', { name: 'Search icons' })).toBeVisible();
});

test('pages load without CSP violations or console errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(msg.text());
  });
  page.on('pageerror', (err) => problems.push(err.message));
  for (const path of ['/', `/sets/${SET}`, `/icons/${SET}/circle`, '/search?q=circle']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  // The editor island hydrated (CSP allowed Astro's hashed scripts).
  await page.goto(`/icons/${SET}/circle`);
  await page.getByLabel('Color as hex code').fill('#00aa55');
  await expect(page.getByRole('tabpanel')).toContainText('#00aa55');
  expect(problems).toEqual([]);
});

test('sends security headers and a CSP', async ({ request, page }) => {
  const res = await request.get('/');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-frame-options']).toBe('DENY');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toMatch(/script-src 'self'( 'sha256-[^']+')+/); // Astro's scripts are hash-allowed
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(res.headers()['cache-control']).toContain('s-maxage');
  await page.goto('/');
});
