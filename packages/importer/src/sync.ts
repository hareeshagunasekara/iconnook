import { isImportable } from '@iconnook/core';
import { schema, type Database } from '@iconnook/db';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { PreparedIcon } from './prepare.js';
import type { LoadedSet } from './types.js';

const { categories, iconCategories, icons, iconSets, iconTags, tags } = schema;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface SyncStats {
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
  links: { added: number; removed: number };
}

const CHUNK = 1_000;

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function upsertSet(tx: Tx, loaded: LoadedSet): Promise<number> {
  const { set } = loaded;
  if (!isImportable(set.licenseTier)) {
    throw new Error(`Refusing to import "${set.prefix}": license ${set.licenseSpdx} is tier X`);
  }
  const values = {
    prefix: set.prefix,
    name: set.name,
    authorName: set.authorName,
    authorUrl: set.authorUrl,
    licenseSpdx: set.licenseSpdx,
    licenseTier: set.licenseTier,
    licenseUrl: set.licenseUrl,
    type: set.type,
    isColor: set.isColor,
    gridSize: set.gridSize,
    version: set.version,
    sampleIcons: set.samples,
  };

  const [existing] = await tx.select().from(iconSets).where(eq(iconSets.prefix, set.prefix));
  if (!existing) {
    const [row] = await tx.insert(iconSets).values(values).returning({ id: iconSets.id });
    if (!row) throw new Error(`Insert of set "${set.prefix}" returned no row`);
    return row.id;
  }
  // Compare by value (arrays like sampleIcons are new objects every run) so re-runs stay change-free.
  const changed = (Object.keys(values) as (keyof typeof values)[]).some(
    (k) => JSON.stringify(existing[k]) !== JSON.stringify(values[k]),
  );
  if (changed) await tx.update(iconSets).set(values).where(eq(iconSets.id, existing.id));
  return existing.id;
}

async function syncIcons(
  tx: Tx,
  setId: number,
  prepared: readonly PreparedIcon[],
): Promise<{ ids: Map<string, number>; stats: Omit<SyncStats, 'links'> }> {
  const existing = await tx
    .select({
      id: icons.id,
      name: icons.name,
      body: icons.body,
      width: icons.width,
      height: icons.height,
    })
    .from(icons)
    .where(eq(icons.setId, setId));
  const byName = new Map(existing.map((row) => [row.name, row]));
  const ids = new Map<string, number>();
  const toInsert: (PreparedIcon & { setId: number })[] = [];
  let updated = 0;
  let unchanged = 0;

  for (const icon of prepared) {
    const current = byName.get(icon.name);
    if (!current) {
      toInsert.push({ ...icon, setId });
      continue;
    }
    ids.set(icon.name, current.id);
    byName.delete(icon.name);
    if (
      current.body === icon.body &&
      current.width === icon.width &&
      current.height === icon.height
    ) {
      unchanged++;
    } else {
      await tx
        .update(icons)
        .set({ body: icon.body, width: icon.width, height: icon.height })
        .where(eq(icons.id, current.id));
      updated++;
    }
  }

  for (const batch of chunks(toInsert)) {
    const rows = await tx.insert(icons).values(batch).returning({ id: icons.id, name: icons.name });
    for (const row of rows) ids.set(row.name, row.id);
  }

  // Whatever is left in byName no longer exists upstream.
  const stale = [...byName.values()].map((row) => row.id);
  for (const batch of chunks(stale)) await tx.delete(icons).where(inArray(icons.id, batch));

  return { ids, stats: { inserted: toInsert.length, updated, deleted: stale.length, unchanged } };
}

/** Ensures label rows exist (by slug) and returns slug → id. Works for both tags and categories. */
async function ensureLabels(
  tx: Tx,
  table: typeof tags | typeof categories,
  labels: ReadonlyMap<string, string>,
): Promise<Map<string, number>> {
  const entries = [...labels].map(([slug, label]) => ({ slug, label }));
  for (const batch of chunks(entries)) await tx.insert(table).values(batch).onConflictDoNothing();
  const ids = new Map<string, number>();
  for (const batch of chunks([...labels.keys()])) {
    const rows = await tx
      .select({ id: table.id, slug: table.slug })
      .from(table)
      .where(inArray(table.slug, batch));
    for (const row of rows) ids.set(row.slug, row.id);
  }
  return ids;
}

async function syncSynonyms(tx: Tx, setId: number, ids: Map<string, number>, loaded: LoadedSet) {
  const labels = new Map<string, string>();
  const desired = new Map<string, { iconId: number; slug: string }>();
  for (const [iconName, aliases] of loaded.synonyms) {
    const iconId = ids.get(iconName);
    if (iconId === undefined) continue;
    for (const alias of aliases) {
      labels.set(alias, alias.replaceAll('-', ' '));
      desired.set(`${String(iconId)}:${alias}`, { iconId, slug: alias });
    }
  }
  const tagIds = await ensureLabels(tx, tags, labels);

  const current = await tx
    .select({ iconId: iconTags.iconId, tagId: iconTags.tagId, slug: tags.slug })
    .from(iconTags)
    .innerJoin(icons, eq(icons.id, iconTags.iconId))
    .innerJoin(tags, eq(tags.id, iconTags.tagId))
    .where(and(eq(icons.setId, setId), eq(iconTags.source, 'set')));

  const toRemove = current.filter((row) => !desired.delete(`${String(row.iconId)}:${row.slug}`));
  const toAdd = [...desired.values()].flatMap(({ iconId, slug }) => {
    const tagId = tagIds.get(slug);
    return tagId === undefined ? [] : [{ iconId, tagId, source: 'set' as const }];
  });

  for (const row of toRemove) {
    await tx
      .delete(iconTags)
      .where(and(eq(iconTags.iconId, row.iconId), eq(iconTags.tagId, row.tagId)));
  }
  for (const batch of chunks(toAdd)) await tx.insert(iconTags).values(batch).onConflictDoNothing();
  return { added: toAdd.length, removed: toRemove.length };
}

async function syncCategories(tx: Tx, setId: number, ids: Map<string, number>, loaded: LoadedSet) {
  const labels = new Map<string, string>();
  const desired = new Map<string, { iconId: number; slug: string }>();
  for (const [label, names] of loaded.categories) {
    const slug = slugify(label);
    if (!slug) continue;
    labels.set(slug, label);
    for (const name of names) {
      const iconId = ids.get(name);
      if (iconId !== undefined) desired.set(`${String(iconId)}:${slug}`, { iconId, slug });
    }
  }
  const categoryIds = await ensureLabels(tx, categories, labels);

  const current = await tx
    .select({
      iconId: iconCategories.iconId,
      categoryId: iconCategories.categoryId,
      slug: categories.slug,
    })
    .from(iconCategories)
    .innerJoin(icons, eq(icons.id, iconCategories.iconId))
    .innerJoin(categories, eq(categories.id, iconCategories.categoryId))
    .where(eq(icons.setId, setId));

  const toRemove = current.filter((row) => !desired.delete(`${String(row.iconId)}:${row.slug}`));
  const toAdd = [...desired.values()].flatMap(({ iconId, slug }) => {
    const categoryId = categoryIds.get(slug);
    return categoryId === undefined ? [] : [{ iconId, categoryId }];
  });

  for (const row of toRemove) {
    await tx
      .delete(iconCategories)
      .where(
        and(eq(iconCategories.iconId, row.iconId), eq(iconCategories.categoryId, row.categoryId)),
      );
  }
  for (const batch of chunks(toAdd))
    await tx.insert(iconCategories).values(batch).onConflictDoNothing();
  return { added: toAdd.length, removed: toRemove.length };
}

/** Makes the database match one source set exactly, in a single transaction. Idempotent. */
export async function syncSet(
  db: Database,
  loaded: LoadedSet,
  prepared: readonly PreparedIcon[],
): Promise<SyncStats> {
  return db.transaction(async (tx) => {
    const setId = await upsertSet(tx, loaded);
    const { ids, stats } = await syncIcons(tx, setId, prepared);
    await tx
      .update(iconSets)
      .set({ iconCount: sql`(SELECT count(*) FROM icons WHERE set_id = ${setId} AND NOT hidden)` })
      .where(
        and(
          eq(iconSets.id, setId),
          sql`${iconSets.iconCount} IS DISTINCT FROM (SELECT count(*) FROM icons WHERE set_id = ${setId} AND NOT hidden)`,
        ),
      );
    const synonyms = await syncSynonyms(tx, setId, ids, loaded);
    const cats = await syncCategories(tx, setId, ids, loaded);
    return {
      ...stats,
      links: { added: synonyms.added + cats.added, removed: synonyms.removed + cats.removed },
    };
  });
}
