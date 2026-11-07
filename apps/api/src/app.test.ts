import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { fakeDeps, fakeIcon, fakeSet, testAppOptions } from './fakes.js';
import { clientKey } from './http/middleware.js';

const setup = (opts: Partial<typeof testAppOptions> = {}, deps = fakeDeps()) => ({
  deps,
  app: createApp(deps, { ...testAppOptions, ...opts }),
});

async function problem(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type')).toBe('application/problem+json');
  const body = (await res.json()) as { type: string; status: number; title: string };
  expect(body.status).toBe(status);
  expect(body.type).toMatch(/^https:\/\/iconnook\.com\/problems\//);
  return body;
}

describe('health', () => {
  it('liveness never touches dependencies', async () => {
    const { app, deps } = setup();
    deps.search.down = true;
    expect((await app.request('/healthz')).status).toBe(200);
  });

  it('readiness reports each dependency and fails when one is down', async () => {
    const { app, deps } = setup();
    expect(await (await app.request('/readyz')).json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', search: 'ok', cache: 'ok' },
    });
    deps.search.down = true;
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ checks: { search: 'down' } });
  });

  it('stays ready (degraded) when only Valkey is down — the rate limiter fails open', async () => {
    const { app, deps } = setup();
    deps.rateLimiter.down = true;
    const res = await app.request('/readyz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'degraded',
      checks: { database: 'ok', search: 'ok', cache: 'down' },
    });
  });
});

describe('security & protocol headers', () => {
  it('sets security headers on JSON and a sandboxing CSP on raw SVG', async () => {
    const { app } = setup();
    const json = await app.request('/v1/sets');
    expect(json.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(json.headers.get('x-content-type-options')).toBe('nosniff');
    expect(json.headers.get('strict-transport-security')).toMatch(/max-age=63072000/);
    expect(json.headers.get('access-control-allow-origin')).toBe('*');

    const svg = await app.request('/v1/icons/tabler/arrow-left.svg');
    expect(svg.headers.get('content-security-policy')).toContain('sandbox');
    expect(svg.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('omits HSTS outside production', async () => {
    const { app } = setup({ hsts: false });
    expect((await app.request('/v1/sets')).headers.has('strict-transport-security')).toBe(false);
  });

  it('supports ETag revalidation (304)', async () => {
    const { app } = setup();
    const first = await app.request('/v1/sets/tabler');
    const etag = first.headers.get('etag') ?? '';
    expect(etag).not.toBe('');
    expect(
      (await app.request('/v1/sets/tabler', { headers: { 'If-None-Match': etag } })).status,
    ).toBe(304);
  });

  it('skips ETags for PNGs (large, CDN-cached) but keeps them for SVG', async () => {
    const { app } = setup();
    expect((await app.request('/v1/icons/tabler/arrow-left.png')).headers.has('etag')).toBe(false);
    expect((await app.request('/v1/icons/tabler/arrow-left.svg')).headers.has('etag')).toBe(true);
  });

  it('returns RFC 9457 problems for unknown endpoints', async () => {
    const { app } = setup();
    await problem(await app.request('/v1/nope'), 404);
  });
});

describe('rate limiting', () => {
  it('returns 429 with Retry-After once the limit is reached', async () => {
    const { app } = setup({ rateLimit: { perMinute: 2, renderPerMinute: 1_000 } });
    expect((await app.request('/v1/sets')).headers.get('ratelimit-remaining')).toBe('1');
    await app.request('/v1/sets');
    const limited = await app.request('/v1/sets');
    await problem(limited, 429);
    expect(limited.headers.get('retry-after')).toBe('60');
  });

  it('applies a stricter limit to PNG rendering', async () => {
    const { app } = setup({ rateLimit: { perMinute: 1_000, renderPerMinute: 1 } });
    expect((await app.request('/v1/icons/tabler/arrow-left.png')).status).toBe(200);
    await problem(await app.request('/v1/icons/tabler/arrow-left.png'), 429);
    expect((await app.request('/v1/icons/tabler/arrow-left.svg')).status).toBe(200);
  });

  it('does not charge the render limit for canonical-URL redirects', async () => {
    const { app } = setup({ rateLimit: { perMinute: 1_000, renderPerMinute: 1 } });
    const redirect = await app.request('/v1/icons/tabler/arrow-left.png?size=64&color=%23FF0000');
    expect(redirect.status).toBe(301);
    const location = redirect.headers.get('location') ?? '';
    expect((await app.request(location)).status).toBe(200);
  });

  it('fails open when the limiter is unavailable', async () => {
    const { app, deps } = setup();
    deps.rateLimiter.down = true;
    expect((await app.request('/v1/sets')).status).toBe(200);
  });

  it('keys clients by a hash of the trusted proxy header, never the raw IP', async () => {
    const deps = fakeDeps();
    const { app } = setup({ trustProxyHeader: 'cf-connecting-ip' } as never, deps);
    await app.request('/v1/sets', { headers: { 'cf-connecting-ip': '203.0.113.7' } });
    const keys = [...deps.rateLimiter.counts.keys()].join(' ');
    expect(keys).not.toContain('203.0.113.7');
    expect(keys).toMatch(/^api:[A-Za-z0-9_-]{16}$/);
  });
});

describe('SVG and PNG assets', () => {
  it('serves a customized SVG', async () => {
    const { app } = setup();
    const res = await app.request(
      '/v1/icons/tabler/arrow-left.svg?color=%23ff0000&size=48&stroke=1.5',
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=31536000/);
    const svg = await res.text();
    expect(svg).toContain('color="#ff0000"');
    expect(svg).toContain('width="48"');
    expect(svg).toContain('stroke-width="1.5"');
  });

  it('redirects non-canonical parameters to the canonical URL', async () => {
    const { app } = setup();
    const res = await app.request('/v1/icons/tabler/arrow-left.svg?size=48&color=%23FF0000&junk=1');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(
      '/v1/icons/tabler/arrow-left.svg?color=%23ff0000&size=48',
    );
  });

  it('offers downloads as attachments', async () => {
    const { app } = setup();
    const res = await app.request('/v1/icons/tabler/arrow-left.svg?download=1');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="tabler-arrow-left.svg"',
    );
  });

  it('renders PNG at the requested size (default 256)', async () => {
    const { app } = setup();
    const res = await app.request('/v1/icons/tabler/arrow-left.png?size=64');
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(await res.text()).toMatch(/^PNG:64:<svg/);
    expect(await (await app.request('/v1/icons/tabler/arrow-left.png')).text()).toMatch(
      /^PNG:256:/,
    );
  });

  it('sizes PNGs by the longer side for tall icons', async () => {
    const deps = fakeDeps([fakeIcon({ width: 12, height: 24 })]);
    const { app } = setup({}, deps);
    expect(await (await app.request('/v1/icons/tabler/arrow-left.png?size=64')).text()).toMatch(
      /^PNG:32:/,
    );
  });

  it.each([
    ['/v1/icons/tabler/arrow-left.svg?size=99999', 400],
    ['/v1/icons/tabler/arrow-left.svg?size=4', 400],
    ['/v1/icons/tabler/arrow-left.svg?color=red', 400],
    ['/v1/icons/tabler/arrow-left.svg?stroke=9', 400],
    ['/v1/icons/tabler/arrow-left.png?size=4096', 400],
    ['/v1/icons/tabler/nope.svg', 404],
    ['/v1/icons/nope/arrow-left.png', 404],
    ['/v1/icons/tabler/a--b.svg', 404],
  ])('%s → %i', async (path, status) => {
    const { app } = setup();
    await problem(await app.request(path), status);
  });
});

describe('JSON endpoints', () => {
  it('searches and returns bodies plus URLs', async () => {
    const { app } = setup();
    const res = await app.request('/v1/search?q=arrow%20left&limit=10');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=300/);
    expect(await res.json()).toMatchObject({
      query: 'arrow left',
      total: 1,
      page: 1,
      limit: 10,
      items: [
        {
          set: 'tabler',
          name: 'arrow-left',
          tier: 'A',
          urls: {
            svg: 'https://api.test/v1/icons/tabler/arrow-left.svg',
            page: 'https://site.test/icons/tabler/arrow-left',
          },
        },
      ],
    });
  });

  it('browses by filter without a search term (placeholder search)', async () => {
    const { app } = setup();
    expect((await app.request('/v1/search?category=arrows')).status).toBe(200);
    expect((await app.request('/v1/search?set=tabler')).status).toBe(200);
  });

  it.each([
    '/v1/search',
    '/v1/search?q=',
    '/v1/search?q=%20%20&tier=A',
    `/v1/search?q=${'a'.repeat(101)}`,
    '/v1/search?q=x&limit=1000',
    '/v1/search?q=x&tier=X',
    '/v1/search?q=x&set=Bad_Set',
    '/v1/search?q=x&type=nope',
    '/v1/sets?tier=X',
    '/v1/sets/tabler/icons?limit=0',
    '/v1/sets/tabler/icons?cursor=Bad%20Cursor',
    '/v1/icons/tabler/arrow-left/code?format=php',
    '/v1/icons/Tabler/arrow-left',
  ])('rejects invalid input: %s', async (path) => {
    const { app } = setup();
    const body = await problem(await app.request(path), 400);
    expect(body).toHaveProperty('errors');
  });

  it.each([
    '/v1/sets/nope',
    '/v1/sets/nope/icons',
    '/v1/icons/tabler/nope',
    '/v1/icons/tabler/nope/code',
    '/v1/icons/tabler/nope/attribution',
  ])('returns 404 for missing resources: %s', async (path) => {
    const { app } = setup();
    await problem(await app.request(path), 404);
  });

  it('paginates set icons by cursor', async () => {
    const { app } = setup();
    const first = (await (await app.request('/v1/sets/tabler/icons?limit=1')).json()) as {
      items: { name: string }[];
      nextCursor: string | null;
    };
    expect(first.items.map((i) => i.name)).toEqual(['arrow-left']);
    expect(first.nextCursor).toBe('arrow-left');
    const second = (await (
      await app.request(`/v1/sets/tabler/icons?limit=1&cursor=${first.nextCursor ?? ''}`)
    ).json()) as {
      items: { name: string }[];
      nextCursor: string | null;
    };
    expect(second).toMatchObject({ items: [{ name: 'home' }], nextCursor: null });
  });

  it('returns icon details and code in every format', async () => {
    const { app } = setup();
    expect(await (await app.request('/v1/icons/tabler/arrow-left')).json()).toMatchObject({
      name: 'arrow-left',
      synonyms: ['back'],
      setInfo: { license: { spdx: 'MIT', tier: 'A' } },
    });
    for (const format of ['svg', 'jsx', 'vue', 'svelte', 'datauri', 'css']) {
      const res = await app.request(`/v1/icons/tabler/arrow-left/code?format=${format}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ format });
    }
  });

  it('builds attribution for tier B/C sets and escapes upstream text', async () => {
    const set = fakeSet({
      name: 'Evil <Set>',
      author: { name: '<script>alert(1)</script>', url: 'javascript:alert(1)' },
      license: {
        spdx: 'CC-BY-SA-4.0',
        tier: 'C',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
        attributionRequired: true,
      },
    });
    const { app } = setup({}, fakeDeps([fakeIcon({ setInfo: set })]));
    const body = (await (
      await app.request('/v1/icons/tabler/arrow-left/attribution')
    ).json()) as Record<string, unknown>;

    expect(body).toMatchObject({ required: true, shareAlike: true });
    expect(body['html']).not.toContain('<script>');
    expect(body['html']).not.toContain('javascript:');
    expect(body['html']).toContain('&lt;script&gt;');
    // CC-BY-SA: the share-alike notice must be in every pasteable form.
    for (const format of ['plain', 'html', 'markdown']) {
      expect(body[format]).toContain('same license');
    }
  });

  it('keeps Markdown links intact for URLs containing parentheses', async () => {
    const set = fakeSet({ author: { name: 'A', url: 'https://example.com/foo_(bar)' } });
    const { app } = setup({}, fakeDeps([fakeIcon({ setInfo: set })]));
    const body = (await (
      await app.request('/v1/icons/tabler/arrow-left/attribution')
    ).json()) as Record<string, string>;
    expect(body['markdown']).toContain('[A](<https://example.com/foo_(bar)>)');
  });

  it('turns invalid search filters into 400, not 500', async () => {
    const deps = fakeDeps();
    deps.search.search = () => Promise.reject(new RangeError('Invalid set filter "x"'));
    const { app } = setup({}, deps);
    await problem(await app.request('/v1/search?q=home'), 400);
  });

  it('publishes an OpenAPI 3.1 document covering every endpoint', async () => {
    const { app } = setup();
    const doc = (await (await app.request('/v1/openapi.json')).json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/v1/categories',
      '/v1/collections',
      '/v1/collections/{id}',
      '/v1/downloads',
      '/v1/icons',
      '/v1/icons/{set}/{name}',
      '/v1/icons/{set}/{name}.png',
      '/v1/icons/{set}/{name}.svg',
      '/v1/icons/{set}/{name}/attribution',
      '/v1/icons/{set}/{name}/code',
      '/v1/packs',
      '/v1/packs/{id}',
      '/v1/packs/{id}/download',
      '/v1/search',
      '/v1/sets',
      '/v1/sets/{set}',
      '/v1/sets/{set}/icons',
    ]);
  });
});

describe('errors', () => {
  it('hides internal error details', async () => {
    const deps = fakeDeps();
    deps.icons.listCategories = () =>
      Promise.reject(new Error('connection string postgres://secret@db'));
    const { app } = setup({}, deps);
    const body = await problem(await app.request('/v1/categories'), 500);
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('returns 503 with Retry-After when search is down (not a 500)', async () => {
    const deps = fakeDeps();
    deps.search.search = () => Promise.reject(new Error('Request to meili timed out after 5000ms'));
    const { app } = setup({}, deps);
    const res = await app.request('/v1/search?q=home');
    const body = await problem(res, 503);
    expect(res.headers.get('retry-after')).toBe('5');
    expect(JSON.stringify(body)).not.toContain('meili');
  });

  it('times out slow requests with 504', async () => {
    const deps = fakeDeps();
    deps.icons.listCategories = () => new Promise(() => undefined);
    const app = createApp(deps, { ...testAppOptions, requestTimeoutMs: 50 });
    await problem(await app.request('/v1/categories'), 504);
  });
});

describe('config', () => {
  const env = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    MEILI_URL: 'http://localhost:7700',
    MEILI_API_KEY: 'a-search-key-of-16+',
    VALKEY_URL: 'redis://localhost:6379',
  };

  it('applies defaults', () => {
    expect(loadConfig(env)).toMatchObject({
      API_PORT: 8787,
      RATE_LIMIT_PER_MINUTE: 300,
      PNG_CONCURRENCY: 4,
    });
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ ...env, API_PORT: '99999' })).toThrow(
      /Invalid environment configuration/,
    );
    expect(() => loadConfig({ ...env, TRUST_PROXY_HEADER: 'X Forwarded' })).toThrow();
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});

describe('clientKey', () => {
  it('ignores proxy headers unless configured to trust them', async () => {
    const deps = fakeDeps();
    const app = createApp(deps, testAppOptions);
    await app.request('/v1/sets', { headers: { 'cf-connecting-ip': '1.1.1.1' } });
    await app.request('/v1/sets', { headers: { 'cf-connecting-ip': '2.2.2.2' } });
    expect(deps.rateLimiter.counts.size).toBe(1); // spoofed headers don't create fresh buckets
  });

  it('accepts only one valid IP from a trusted header, so junk values cannot mint new buckets', async () => {
    const deps = fakeDeps();
    const app = createApp(deps, { ...testAppOptions, trustProxyHeader: 'x-forwarded-for' });
    for (const value of ['junk-1', 'junk-2', '<script>', '']) {
      await app.request('/v1/sets', { headers: { 'x-forwarded-for': value } });
    }
    expect(deps.rateLimiter.counts.size).toBe(1); // all fell back to the same (socket) identity

    await app.request('/v1/sets', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } });
    await app.request('/v1/sets', { headers: { 'x-forwarded-for': '203.0.113.9, 10.9.9.9' } });
    expect(deps.rateLimiter.counts.size).toBe(2); // first entry of the list is the client
    expect(typeof clientKey).toBe('function');
  });
});

describe('collections, packs and downloads', () => {
  const post = (app: ReturnType<typeof setup>['app'], path: string, body: unknown) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('looks up several icons by "set:name", skipping unknown ones', async () => {
    const { app } = setup();
    const res = await app.request('/v1/icons?names=tabler:home,tabler:nope,tabler:arrow-left');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { name: string }[] };
    expect(body.items.map((i) => i.name)).toEqual(['home', 'arrow-left']);
    await problem(await app.request('/v1/icons?names=Not%20A%20Ref'), 400);
  });

  it('shares a collection and reads it back', async () => {
    const { app } = setup();
    const created = await post(app, '/v1/collections', {
      name: 'My set',
      icons: ['tabler:home', 'tabler:arrow-left'],
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; url: string; items: unknown[] };
    expect(body.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(body.url).toBe(`https://site.test/c/${body.id}`);
    expect(created.headers.get('location')).toBe(`https://api.test/v1/collections/${body.id}`);

    const read = await app.request(`/v1/collections/${body.id}`);
    expect(await read.json()).toMatchObject({
      name: 'My set',
      items: [{ name: 'home' }, { name: 'arrow-left' }],
    });
  });

  it.each([
    [{ icons: [] }],
    [{ icons: ['bad ref'] }],
    [{ icons: ['tabler:home'], name: 'x'.repeat(81) }],
    [{ icons: Array.from({ length: 501 }, (_, i) => `s:i${String(i)}`) }],
  ])('rejects invalid collections %#', async (payload) => {
    const { app } = setup();
    await problem(await post(app, '/v1/collections', payload), 400);
  });

  it('rejects a collection whose icons all do not exist, and unknown collection ids', async () => {
    const { app } = setup();
    await problem(await post(app, '/v1/collections', { icons: ['tabler:nope'] }), 400);
    await problem(await app.request('/v1/collections/doesnotexist1'), 404);
    await problem(await app.request('/v1/collections/bad!'), 400);
  });

  it('queues a pack (202), dedupes identical requests, and reports status', async () => {
    const { app, deps } = setup();
    const request = { icons: ['tabler:home', 'tabler:arrow-left'], format: 'zip', png: 64 };
    const first = await post(app, '/v1/packs', request);
    expect(first.status).toBe(202);
    const status = (await first.json()) as {
      id: string;
      state: string;
      downloadUrl: string | null;
      statusUrl: string;
    };
    expect(status).toMatchObject({ state: 'queued', downloadUrl: null });
    expect(status.statusUrl).toBe(`https://api.test/v1/packs/${status.id}`);

    const again = (await (
      await post(app, '/v1/packs', { ...request, icons: [...request.icons].reverse() })
    ).json()) as { id: string };
    expect(again.id).toBe(status.id);
    expect(deps.packs.jobs.size).toBe(1);

    expect(await (await app.request(`/v1/packs/${status.id}`)).json()).toMatchObject({
      id: status.id,
      state: 'queued',
    });
  });

  it('downloads a finished pack and refuses unfinished ones', async () => {
    const { app, deps } = setup();
    const { id } = (await (
      await post(app, '/v1/packs', { icons: ['tabler:home'], format: 'sprite' })
    ).json()) as { id: string };
    await problem(await app.request(`/v1/packs/${id}/download`), 409);

    deps.packs.jobs.set(id, { id, state: 'completed', progress: 100, format: 'sprite' });
    await problem(await app.request(`/v1/packs/${id}/download`), 404); // finished but file expired

    deps.files.objects.set(`packs/${id}.svg`, '<svg/>');
    const res = await app.request(`/v1/packs/${id}/download`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="iconnook-sprite.svg"',
    );
    expect(await res.text()).toBe('<svg/>');
  });

  it('rebuilds a "completed" pack whose file has expired instead of promising a 404', async () => {
    const { app, deps } = setup();
    const request = { icons: ['tabler:home'], format: 'zip' };
    const { id } = (await (await post(app, '/v1/packs', request)).json()) as { id: string };
    deps.packs.jobs.set(id, { id, state: 'completed', progress: 100, format: 'zip' }); // file never stored

    const again = (await (await post(app, '/v1/packs', request)).json()) as {
      state: string;
      downloadUrl: string | null;
    };
    expect(again).toMatchObject({ state: 'queued', downloadUrl: null });

    deps.packs.jobs.set(id, { id, state: 'completed', progress: 100, format: 'zip' });
    deps.files.objects.set(`packs/${id}.zip`, 'PK');
    const ready = (await (await post(app, '/v1/packs', request)).json()) as { state: string };
    expect(ready.state).toBe('completed'); // file present: no rebuild
  });

  it.each([
    [{ icons: ['tabler:home'], format: 'tar' }],
    [{ icons: ['tabler:home'], format: 'sprite', png: 64 }],
    [{ icons: ['tabler:home', 'tabler:home'], format: 'zip' }],
    [{ icons: ['tabler:home'], format: 'zip', color: 'red' }],
  ])('rejects invalid pack requests %#', async (payload) => {
    const { app } = setup();
    await problem(await post(app, '/v1/packs', payload), 400);
  });

  it('returns 404 for unknown packs and 400 for malformed ids', async () => {
    const { app } = setup();
    await problem(await app.request(`/v1/packs/${'a'.repeat(32)}`), 404);
    await problem(await app.request('/v1/packs/not-hex'), 400);
  });

  it('feature flags switch packs and PNG off instantly (503 + Retry-After)', async () => {
    const { app, deps } = setup();
    deps.flags.disabled.add('packs');
    const res = await post(app, '/v1/packs', { icons: ['tabler:home'], format: 'zip' });
    await problem(res, 503);
    expect(res.headers.get('retry-after')).toBe('5');

    deps.flags.disabled.add('png');
    await problem(await app.request('/v1/icons/tabler/home.png'), 503);
    expect((await app.request('/v1/icons/tabler/home.svg')).status).toBe(200); // SVG unaffected
  });

  it('applies the stricter write limit to collections and packs', async () => {
    const { app } = setup({
      rateLimit: { perMinute: 1_000, renderPerMinute: 1_000, writePerMinute: 1 },
    } as never);
    expect((await post(app, '/v1/collections', { icons: ['tabler:home'] })).status).toBe(201);
    await problem(await post(app, '/v1/collections', { icons: ['tabler:home'] }), 429);
  });

  it('counts downloads of existing icons only', async () => {
    const { app, deps } = setup();
    expect((await post(app, '/v1/downloads', { iconId: 1 })).status).toBe(202);
    expect((await post(app, '/v1/downloads', { iconId: 1 })).status).toBe(202);
    expect(deps.downloads.counts.get(1)).toBe(2);
    await problem(await post(app, '/v1/downloads', { iconId: 999 }), 404);
    await problem(await post(app, '/v1/downloads', { iconId: 'x' }), 400);
  });

  it('allows cross-origin POST from the website and caps body size', async () => {
    const { app } = setup();
    const preflight = await app.request('/v1/packs', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://iconnook.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
    const huge = await app.request('/v1/collections', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(70 * 1024) },
      body: 'x'.repeat(70 * 1024),
    });
    await problem(huge, 413);
  });
});
