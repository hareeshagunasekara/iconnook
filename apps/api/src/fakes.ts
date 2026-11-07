import type {
  Collection,
  Dependencies,
  DownloadCounter,
  FeatureFlags,
  FileStore,
  IconDetail,
  IconRepository,
  IconSearch,
  PackQueue,
  PackStatus,
  PngRenderer,
  RateLimiter,
  SetSummary,
} from './domain.js';

/** In-memory fakes of the ports, for fast unit tests without infrastructure. */

export const fakeSet = (overrides: Partial<SetSummary> = {}): SetSummary => ({
  prefix: 'tabler',
  name: 'Tabler Icons',
  type: 'solid',
  total: 2,
  isColor: false,
  gridSize: 24,
  version: '1.0.0',
  author: { name: 'Paweł Kuna', url: 'https://github.com/tabler' },
  preview: { name: 'arrow-left', body: '<path d="M5 12h14"/>', width: 24, height: 24 },
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
  icons: IconRepository & { data: IconDetail[]; collections: Map<string, Collection> };
  packs: PackQueue & { jobs: Map<string, PackStatus> };
  files: FileStore & { objects: Map<string, string> };
  flags: FeatureFlags & { disabled: Set<string> };
  downloads: DownloadCounter & { counts: Map<number, number> };
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
    collections: new Map(),
    getIconsByRefs: (refs) =>
      Promise.resolve(
        refs.flatMap((r) => {
          const i = data.find((d) => `${d.set}:${d.name}` === r);
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
    iconExists: (id) => Promise.resolve(data.some((d) => d.id === id)),
    createCollection(c) {
      this.collections.set(c.id, {
        id: c.id,
        name: c.name,
        createdAt: new Date(0).toISOString(),
        icons: c.iconIds.flatMap((id) => {
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
      });
      return Promise.resolve();
    },
    getCollection(id) {
      return Promise.resolve(this.collections.get(id) ?? null);
    },
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
  const packs: FakeDeps['packs'] = {
    jobs: new Map(),
    enqueue(id, request) {
      const existing = this.jobs.get(id);
      if (existing) return Promise.resolve(existing);
      const status: PackStatus = { id, state: 'queued', progress: 0, format: request.format };
      this.jobs.set(id, status);
      return Promise.resolve(status);
    },
    status(id) {
      return Promise.resolve(this.jobs.get(id) ?? null);
    },
    rebuild(id, request) {
      const status: PackStatus = { id, state: 'queued', progress: 0, format: request.format };
      this.jobs.set(id, status);
      return Promise.resolve(status);
    },
  };
  const files: FakeDeps['files'] = {
    objects: new Map(),
    exists(key) {
      return Promise.resolve(this.objects.has(key));
    },
    get(key) {
      const content = this.objects.get(key);
      return Promise.resolve(
        content === undefined
          ? null
          : new Response(content, { headers: { 'content-length': String(content.length) } }),
      );
    },
  };
  const flags: FakeDeps['flags'] = {
    disabled: new Set(),
    isEnabled(flag) {
      return Promise.resolve(!this.disabled.has(flag));
    },
  };
  const downloads: FakeDeps['downloads'] = {
    counts: new Map(),
    record(iconId) {
      this.counts.set(iconId, (this.counts.get(iconId) ?? 0) + 1);
      return Promise.resolve();
    },
  };
  return { icons, search, rateLimiter, png, packs, files, flags, downloads };
}

export const testAppOptions = {
  apiUrl: 'https://api.test',
  siteUrl: 'https://site.test',
  hsts: true,
  rateLimit: { perMinute: 1_000, renderPerMinute: 1_000 },
};
