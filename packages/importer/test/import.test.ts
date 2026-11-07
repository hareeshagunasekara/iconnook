import { randomBytes } from 'node:crypto';

import { schema } from '@iconnook/db';
import { createTestDatabase, type TestDatabase } from '@iconnook/db/testing';
import { count, eq } from 'drizzle-orm';
import { Meilisearch } from 'meilisearch';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadImporterConfig } from '../src/config.js';
import { fixtureIconifySet, memorySource } from '../src/fixtures.js';
import { importSets } from '../src/run.js';
import { rebuildSearchIndex, type SearchDocument } from '@iconnook/search';
import { iconifySource } from '../src/sources/iconify.js';
import { syncSet } from '../src/sync.js';

const { iconSets, icons, iconTags, iconCategories } = schema;

let t: TestDatabase;
const gpl = fixtureIconifySet({ prefix: 'fixture-gpl' });
if (gpl.info) gpl.info = { ...gpl.info, license: { title: 'GPL', spdx: 'GPL-3.0-only' } };
const source = memorySource([fixtureIconifySet(), gpl]);

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

const iconCount = async () => (await t.db.select({ n: count() }).from(icons))[0]?.n;

describe('importSets', () => {
  it('imports a set with icons, synonyms and categories, and skips tier X', async () => {
    const [report, ...rest] = await importSets(t.db, source, { tiers: ['A', 'B', 'C'] });

    expect(rest).toHaveLength(0); // fixture-gpl (tier X) was never selected
    expect(report).toMatchObject({
      prefix: 'fixture-ui',
      icons: 5,
      inserted: 5,
      updated: 0,
      deleted: 0,
    });
    expect(await iconCount()).toBe(5);
    const [stored] = await t.db.select().from(iconSets).where(eq(iconSets.prefix, 'fixture-ui'));
    expect(stored?.iconCount).toBe(5);
    expect(
      await t.db.select().from(iconSets).where(eq(iconSets.prefix, 'fixture-gpl')),
    ).toHaveLength(0);
    expect((await t.db.select({ n: count() }).from(iconTags))[0]?.n).toBe(1); // house → home
    expect((await t.db.select({ n: count() }).from(iconCategories))[0]?.n).toBe(3);
  });

  it("stores the set's sample icons in order", async () => {
    const [set] = await t.db.select().from(iconSets).where(eq(iconSets.prefix, 'fixture-ui'));
    expect(set?.sampleIcons).toEqual(['home', 'arrow-up']);
  });

  it('changes nothing when run again', async () => {
    const [before] = await t.db.select().from(iconSets).where(eq(iconSets.prefix, 'fixture-ui'));
    const [report] = await importSets(t.db, source, { tiers: ['A'] });
    const [after] = await t.db.select().from(iconSets).where(eq(iconSets.prefix, 'fixture-ui'));
    expect(after?.updatedAt).toEqual(before?.updatedAt); // set row untouched, arrays included

    expect(report).toMatchObject({ inserted: 0, updated: 0, deleted: 0, unchanged: 5 });
    expect(report?.links).toEqual({ added: 0, removed: 0 });
  });

  it('follows upstream changes: updates, deletions, synonyms and categories', async () => {
    const changed = fixtureIconifySet();
    changed.icons['home'] = { body: '<path d="M4 12 12 4l8 8v8H4z"/>' };
    delete changed.icons['narrow'];
    changed.aliases = { 'arrow-down': { parent: 'arrow-up', vFlip: true } };
    changed.categories = { Arrows: ['arrow-up'] };
    source.replace(changed);

    const [report] = await importSets(t.db, source, { tiers: ['A'] });

    expect(report).toMatchObject({ inserted: 0, updated: 1, deleted: 1, unchanged: 3 });
    expect(report?.links).toEqual({ added: 0, removed: 3 }); // house synonym, Buildings, arrow-down in Arrows
    expect(await iconCount()).toBe(4);
    const [stored] = await t.db.select().from(iconSets).where(eq(iconSets.prefix, 'fixture-ui'));
    expect(stored?.iconCount).toBe(4);
  });

  it('refuses a tier X set even if called directly, and writes nothing', async () => {
    const loaded = await memorySource([gpl]).loadSet('fixture-gpl');

    await expect(syncSet(t.db, loaded, [])).rejects.toThrow(/tier X/);
    expect(
      await t.db.select().from(iconSets).where(eq(iconSets.prefix, 'fixture-gpl')),
    ).toHaveLength(0);
  });
});

describe('real Iconify data', () => {
  it('imports a real Tier A set end to end', async () => {
    const [report] = await importSets(t.db, iconifySource, {
      tiers: ['A'],
      prefixes: ['bytesize'],
    });

    expect(report?.icons).toBeGreaterThan(50);
    expect(report?.rejected).toEqual([]);
    expect(report?.modified).toEqual([]);
  });
});

describe('rebuildSearchIndex', () => {
  const config = loadImporterConfig();
  const meili = new Meilisearch({ host: config.MEILI_URL, apiKey: config.MEILI_MASTER_KEY });
  const index = `icons_test_${randomBytes(4).toString('hex')}`;

  afterAll(async () => {
    await meili.deleteIndexIfExists(index);
  });

  it('builds a searchable index and swaps it in atomically', async () => {
    const first = await rebuildSearchIndex(t.db, meili, { index });
    const second = await rebuildSearchIndex(t.db, meili, { index });

    expect(second.documents).toBe(first.documents);
    expect(first.documents).toBe(await iconCount());

    const result = await meili
      .index<SearchDocument>(index)
      .search('arow', { filter: 'set = "fixture-ui"' });
    expect(result.hits.map((h) => h.name)).toEqual(
      expect.arrayContaining(['arrow-up', 'arrow-down']),
    );

    const { results } = await meili.getIndexes({ limit: 1000 });
    expect(results.filter((i) => i.uid.startsWith(`${index}_`))).toEqual([]); // staging cleaned up
  });
});
