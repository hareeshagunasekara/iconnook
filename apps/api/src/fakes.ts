import type {
  Dependencies,
  IconDetail,
  IconRepository,
  IconSearch,
  PngRenderer,
  RateLimiter,
  SetSummary,
} from './domain.js';

/** In-memory fakes of the ports, for fast unit tests without infrastructure. */

export const fakeSet = (overrides: Partial<SetSummary> = {}): SetSummary => ({
  prefix: 'tabler',
  name: 'Tabler Icons',
  type: 'ui',
  total: 2,
  isColor: false,
  gridSize: 24,
  version: '1.0.0',
  author: { name: 'Paweł Kuna', url: 'https://github.com/tabler' },
  license: {
    spdx: 'MIT',
    tier: 'A',
    url: 'https://opensource.org/licenses/MIT',
    attributionRequired: false,
  },
  ...overrides,
});

export const fakeIcon = (overrides: Partial<IconDetail> = {}): IconDetail => ({
  id: 1,
  set: 'tabler',
  name: 'arrow-left',
  body: '<path fill="none" stroke="currentColor" stroke-width="2" d="M5 12h14"/>',
  width: 24,
  height: 24,
  setInfo: fakeSet(),
  synonyms: ['back'],
  categories: [{ slug: 'arrows', label: 'Arrows' }],
  ...overrides,
});

export interface FakeDeps extends Dependencies {
  icons: IconRepository & { data: IconDetail[] };
  rateLimiter: RateLimiter & { counts: Map<string, number>; down: boolean };
  search: IconSearch & { down: boolean };
}

export function fakeDeps(
  data: IconDetail[] = [fakeIcon(), fakeIcon({ id: 2, name: 'home' })],
): FakeDeps {
  const sets = () => [...new Map(data.map((i) => [i.set, i.setInfo])).values()];
  const icons: FakeDeps['icons'] = {
    data,
    getIcon: (set, name) =>
      Promise.resolve(data.find((i) => i.set === set && i.name === name) ?? null),
    getIconsByIds: (ids) =>
      Promise.resolve(
        ids.flatMap((id) => {
          const i = data.find((d) => d.id === id);
          return i
            ? [
                {
                  ...i,
                  setName: i.setInfo.name,
                  tier: i.setInfo.license.tier,
                  isColor: i.setInfo.isColor,
                },
              ]
            : [];
        }),
      ),
    listSets: (f) =>
      Promise.resolve(
        sets().filter(
          (s) => (!f.type || s.type === f.type) && (!f.tier || s.license.tier === f.tier),
        ),
      ),
    getSet: (prefix) => Promise.resolve(sets().find((s) => s.prefix === prefix) ?? null),
    listSetIcons: (prefix, page) => {
      const all = data.filter((i) => i.set === prefix && (!page.cursor || i.name > page.cursor));
      all.sort((a, b) => a.name.localeCompare(b.name));
      const items = all.slice(0, page.limit);
      return Promise.resolve({
        items,
        nextCursor: all.length > page.limit ? (items.at(-1)?.name ?? null) : null,
      });
    },
    listCategories: () => Promise.resolve([{ slug: 'arrows', label: 'Arrows', total: 1 }]),
    ping: () => Promise.resolve(),
  };
  const search: FakeDeps['search'] = {
    down: false,
    search(q) {
      const ids = data.filter((i) => i.name.includes(q.q.replaceAll(' ', '-'))).map((i) => i.id);
      return Promise.resolve({ ids, total: ids.length, processingTimeMs: 1 });
    },
    ping() {
      return this.down ? Promise.reject(new Error('down')) : Promise.resolve();
    },
  };
  const rateLimiter: FakeDeps['rateLimiter'] = {
    counts: new Map(),
    down: false,
    hit(key, limit, windowSeconds) {
      if (this.down) return Promise.reject(new Error('valkey down'));
      const used = (this.counts.get(key) ?? 0) + 1;
      this.counts.set(key, used);
      return Promise.resolve({
        allowed: used <= limit,
        limit,
        remaining: Math.max(0, limit - used),
        resetSeconds: windowSeconds,
      });
    },
    ping() {
      return this.down ? Promise.reject(new Error('down')) : Promise.resolve();
    },
  };
  const png: PngRenderer = {
    render: (svg, width) => Promise.resolve(Buffer.from(`PNG:${String(width)}:${svg}`)),
  };
  return { icons, search, rateLimiter, png };
}

export const testAppOptions = {
  apiUrl: 'https://api.test',
  siteUrl: 'https://site.test',
  hsts: true,
  rateLimit: { perMinute: 1_000, renderPerMinute: 1_000 },
};
