import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Page } from '@playwright/test';

/** Collections journey (docs/standards/testing.md #5): no account, browser storage, share, download. */

const SET = 'iconnook-fixtures';

/**
 * Clicks a pack button and returns the download. If no download arrives, fails with everything
 * needed to diagnose it: the POST response, the pack's current status and any error on the page.
 */
async function downloadPack(page: Page, button: string): Promise<Download> {
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/v1/packs') && r.request().method() === 'POST',
  );
  const download = page.waitForEvent('download', { timeout: 60_000 }).catch((e: unknown) => e);
  await page.getByRole('button', { name: button }).click();
  const response = await created;
  const body = (await response.json()) as { statusUrl?: string };
  const result = await download;
  if (result instanceof Error) {
    const status = body.statusUrl ? await (await page.request.get(body.statusUrl)).text() : 'n/a';
    const alerts = await page.getByRole('alert').allTextContents();
    throw new Error(
      `No download after "${button}". POST ${String(response.status())} ${JSON.stringify(body)}; ` +
        `status now ${status}; page alerts: ${JSON.stringify(alerts)}`,
    );
  }
  return result as Download;
}

async function add(page: Page, name: string) {
  await page.goto(`/icons/${SET}/${name}`);
  const button = page.getByRole('button', { name: '+ Add to collection' });
  await button.click();
  await expect(page.getByRole('button', { name: '✓ In collection' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

test('add icons, download a sprite and a ZIP, share, and save the shared collection elsewhere', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await add(page, 'circle');
  await add(page, 'plus');
  await expect(page.locator('[data-collection-count]')).toHaveText('2');

  await page.getByRole('link', { name: /Collection/ }).click();
  await expect(page).toHaveURL(/\/collection$/);
  const list = page.getByRole('list', { name: 'Icons in your collection' });
  await expect(list.getByRole('listitem')).toHaveCount(2);

  // SVG sprite, built by the worker.
  const sprite = await downloadPack(page, 'Download SVG sprite');
  expect(sprite.suggestedFilename()).toBe('iconnook-sprite.svg');
  const spriteText = await (await sprite.createReadStream()).toArray();
  expect(Buffer.concat(spriteText).toString()).toMatch(
    /<symbol id="iconnook-fixtures-circle"[\s\S]*<symbol id="iconnook-fixtures-plus"/,
  );

  // ZIP with PNGs.
  await page.getByLabel('PNG files in the ZIP').selectOption('64');
  const zip = await downloadPack(page, 'Download ZIP');
  expect(zip.suggestedFilename()).toBe('iconnook-icons.zip');
  const zipBytes = Buffer.concat(await (await zip.createReadStream()).toArray());
  expect(zipBytes.subarray(0, 2).toString()).toBe('PK');
  for (const entry of [
    'LICENSES.md',
    'svg/iconnook-fixtures/circle.svg',
    'png/iconnook-fixtures/plus.png',
  ]) {
    expect(zipBytes.includes(Buffer.from(entry))).toBe(true);
  }

  // Share, then open the link in a fresh browser profile (no shared storage).
  await page.getByRole('button', { name: 'Create share link' }).click();
  const shareUrl = await page.getByLabel('Share link').inputValue();
  expect(shareUrl).toMatch(/\/c\/[A-Za-z0-9_-]{16}$/);

  const other = await browser.newContext();
  const visitor = await other.newPage();
  await visitor.goto(new URL(shareUrl).pathname);
  await expect(visitor.getByRole('heading', { level: 1, name: 'Shared collection' })).toBeVisible();
  await expect(
    visitor.getByRole('list', { name: 'Shared collection icons' }).getByRole('link'),
  ).toHaveCount(2);
  const axe = await new AxeBuilder({ page: visitor })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await visitor.getByRole('button', { name: 'Save to my collection' }).click();
  await expect(visitor.getByRole('button', { name: 'Saved ✓' })).toBeVisible();
  await expect(visitor.locator('[data-collection-count]')).toHaveText('2');
  await other.close();

  // Removing works and the header count follows.
  await page.getByRole('button', { name: /Remove circle/ }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(page.locator('[data-collection-count]')).toHaveText('1');
});

test('downloads from an icon page are counted', async ({ page }) => {
  await page.goto(`/icons/${SET}/square`);
  const counted = page.waitForRequest(
    (r) => r.url().endsWith('/v1/downloads') && r.method() === 'POST',
  );
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download SVG' }).click();
  await download;
  const request = await counted;
  expect(request.postDataJSON()).toMatchObject({ iconId: expect.any(Number) });
  expect((await request.response())?.status()).toBe(202);
});

test('a shared collection page works without JavaScript', async ({ browser, request }) => {
  const res = await request.post('http://localhost:8787/v1/collections', {
    data: { name: 'Shapes', icons: [`${SET}:circle`, `${SET}:square`] },
  });
  const { url } = (await res.json()) as { url: string };
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(new URL(url).pathname);
  await expect(page.getByRole('heading', { level: 1, name: 'Shapes' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Shapes icons' }).getByRole('link')).toHaveCount(2);
  await context.close();
});

test('unknown or malformed share links are a 404', async ({ page }) => {
  expect((await page.goto('/c/doesnotexist12'))?.status()).toBe(404);
  expect((await page.goto('/c/bad!id'))?.status()).toBe(404);
});
