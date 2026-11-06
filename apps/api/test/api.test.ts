import { randomBytes } from 'node:crypto';

import { seedFixtures } from '@iconnook/db';
import { createTestDatabase, type TestDatabase } from '@iconnook/db/testing';
import { rebuildSearchIndex } from '@iconnook/search';
import { customizeSvg } from '@iconnook/svg';
import { Resvg } from '@resvg/resvg-js';
import { Redis } from 'ioredis';
import { Meilisearch } from 'meilisearch';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DrizzleIconRepository } from '../src/adapters/drizzle-repository.js';
import { MeiliIconSearch } from '../src/adapters/meili-search.js';
import { ResvgRenderer } from '../src/adapters/resvg-renderer.js';
import { ValkeyRateLimiter } from '../src/adapters/valkey-rate-limiter.js';
import { createApp } from '../src/app.js';
import {
  Category,
  IconDetail,
  IconSet,
  SearchResult,
  SetIconsPage,
} from '../src/routes/schemas.js';

const env = z
  .object({ MEILI_URL: z.string(), MEILI_MASTER_KEY: z.string(), VALKEY_URL: z.string() })
  .parse(process.env);

const index = `icons_test_${randomBytes(4).toString('hex')}`;
const meili = new Meilisearch({ host: env.MEILI_URL, apiKey: env.MEILI_MASTER_KEY });
const redis = new Redis(env.VALKEY_URL, { maxRetriesPerRequest: 1 });
const limiterPrefix = `rl_test_${randomBytes(4).toString('hex')}`;

let t: TestDatabase;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedFixtures(t.db);
  await rebuildSearchIndex(t.db, meili, { index });
  app = createApp(
    {
      icons: new DrizzleIconRepository(t.db),
      search: new MeiliIconSearch(meili, index),
      rateLimiter: new ValkeyRateLimiter(redis, limiterPrefix),
      png: new ResvgRenderer(2),
    },
    {
      apiUrl: 'https://api.test',
      siteUrl: 'https://site.test',
      hsts: false,
      rateLimit: { perMinute: 1_000, renderPerMinute: 1_000 },
    },
  );
});

afterAll(async () => {
  await meili.deleteIndexIfExists(index);
  const keys = await redis.keys(`${limiterPrefix}:*`);
  if (keys.length) await redis.del(...keys);
  await redis.quit();
  await t.drop();
});

/** Contract test: every JSON response must match the schema published in the OpenAPI document. */
async function contract<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const res = await app.request(path);
  expect(res.status, path).toBe(200);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`${path} violates its contract: ${parsed.error.message}`);
  return parsed.data;
}

describe('against real Postgres, Meilisearch and Valkey', () => {
  it('is ready', async () => {
    expect(await (await app.request('/readyz')).json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', search: 'ok', cache: 'ok' },
    });
  });

  it('searches with typos and filters', async () => {
    const result = await contract('/v1/search?q=circl&set=iconnook-fixtures', SearchResult);
    expect(result.items.map((i) => i.name)).toContain('circle');
    expect(result.items[0]?.body).toContain('<circle');

    const none = await contract('/v1/search?q=circle&set=does-not-exist', SearchResult);
    expect(none.total).toBe(0);
  });

  it('serves sets, set icons, icon details and categories that match their contracts', async () => {
    const sets = await contract('/v1/sets', IconSet.array());
    expect(sets.map((s) => s.prefix)).toEqual(['iconnook-fixtures']);
    expect(sets[0]).toMatchObject({
      total: 3,
      license: { spdx: 'CC0-1.0', tier: 'A', attributionRequired: false },
    });

    await contract('/v1/sets/iconnook-fixtures', IconSet);
    const page = await contract('/v1/sets/iconnook-fixtures/icons?limit=2', SetIconsPage);
    expect(page.items.map((i) => i.name)).toEqual(['circle', 'plus']);
    expect(page.nextCursor).toBe('plus');

    const icon = await contract('/v1/icons/iconnook-fixtures/plus', IconDetail);
    expect(icon.setInfo.prefix).toBe('iconnook-fixtures');
    await contract('/v1/categories', Category.array());
  });

  it('returns 404 problems for missing icons', async () => {
    const res = await app.request('/v1/icons/iconnook-fixtures/missing.svg');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
  });

  it('renders a real PNG at the requested size', async () => {
    const res = await app.request('/v1/icons/iconnook-fixtures/circle.png?size=64');
    expect(res.status).toBe(200);
    const png = Buffer.from(await res.arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 64]); // IHDR width × height
  });

  it('actually recolors currentColor icons when rendered', () => {
    const svg = customizeSvg(
      { body: '<circle cx="12" cy="12" r="9" fill="currentColor"/>', width: 24, height: 24 },
      { color: '#ff0000' },
    );
    const image = new Resvg(svg, { fitTo: { mode: 'width', value: 24 } }).render();
    const center = (12 * 24 + 12) * 4;
    expect([...image.pixels.subarray(center, center + 4)]).toEqual([255, 0, 0, 255]);
  });
});

describe('ValkeyRateLimiter', () => {
  it('counts per key within a window and expires the window', async () => {
    const limiter = new ValkeyRateLimiter(redis, limiterPrefix);
    const key = `k-${randomBytes(3).toString('hex')}`;
    const results = [
      await limiter.hit(key, 2, 60),
      await limiter.hit(key, 2, 60),
      await limiter.hit(key, 2, 60),
    ];

    expect(results.map((r) => [r.allowed, r.remaining])).toEqual([
      [true, 1],
      [true, 0],
      [false, 0],
    ]);
    const [redisKey] = await redis.keys(`${limiterPrefix}:${key}:*`);
    expect(await redis.ttl(redisKey ?? '')).toBeGreaterThan(0);
  });
});
