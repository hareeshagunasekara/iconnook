import type { Database } from '@iconnook/db';
import { sql } from 'drizzle-orm';
import type { Meilisearch } from 'meilisearch';

export const SEARCH_INDEX = 'icons';
const PAGE = 10_000;
const TASK_TIMEOUT = { timeout: 15 * 60_000, interval: 250 };

export interface SearchDocument {
  id: number;
  name: string;
  /** Name with spaces, so "arrow-left" matches "arrow left". */
  label: string;
  set: string;
  setName: string;
  tier: string;
  type: string;
  color: boolean;
  tags: string[];
  categories: string[];
}

export const SEARCH_SETTINGS = {
  searchableAttributes: ['label', 'tags', 'categories', 'setName'],
  filterableAttributes: ['set', 'tier', 'type', 'color', 'categories'],
  displayedAttributes: ['id', 'name', 'set', 'setName', 'tier', 'type', 'color'],
  pagination: { maxTotalHits: 5_000 },
  // Icon names are short: allow one typo from 4 letters ("trsh" → trash), two from 8.
  typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
};

interface Row extends Record<string, unknown> {
  id: string | number;
  name: string;
  set: string;
  set_name: string;
  tier: string;
  type: string;
  color: boolean;
  tags: string[];
  categories: string[];
}

async function* readDocuments(db: Database): AsyncGenerator<SearchDocument[]> {
  let lastId = 0;
  for (;;) {
    const rows = await db.execute<Row>(sql`
      SELECT i.id, i.name, s.prefix AS set, s.name AS set_name, s.license_tier AS tier, s.type, s.is_color AS color,
        COALESCE((SELECT array_agg(t.label ORDER BY t.label) FROM icon_tags it
                  JOIN tags t ON t.id = it.tag_id WHERE it.icon_id = i.id), '{}') AS tags,
        COALESCE((SELECT array_agg(c.label ORDER BY c.label) FROM icon_categories ic
                  JOIN categories c ON c.id = ic.category_id WHERE ic.icon_id = i.id), '{}') AS categories
      FROM icons i JOIN icon_sets s ON s.id = i.set_id
      WHERE NOT i.hidden AND i.id > ${lastId}
      ORDER BY i.id LIMIT ${PAGE}`);
    if (rows.length === 0) return;
    yield rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      label: r.name.replaceAll('-', ' '),
      set: r.set,
      setName: r.set_name,
      tier: r.tier,
      type: r.type,
      color: r.color,
      tags: r.tags,
      categories: r.categories,
    }));
    lastId = Number(rows[rows.length - 1]?.id);
  }
}

/**
 * Rebuilds the search index from Postgres (the source of truth) into a fresh index, then swaps it in
 * atomically — live search never sees a half-built index.
 */
export async function rebuildSearchIndex(
  db: Database,
  meili: Meilisearch,
  { index: target = SEARCH_INDEX }: { index?: string } = {},
): Promise<{ documents: number }> {
  const staging = `${target}_${String(Date.now())}`;
  await meili.createIndex(staging, { primaryKey: 'id' }).waitTask(TASK_TIMEOUT);
  try {
    const index = meili.index<SearchDocument>(staging);
    await index.updateSettings(SEARCH_SETTINGS).waitTask(TASK_TIMEOUT);

    let documents = 0;
    for await (const batch of readDocuments(db)) {
      const task = await index.addDocuments(batch).waitTask(TASK_TIMEOUT);
      if (task.status !== 'succeeded')
        throw new Error(`Indexing failed: ${JSON.stringify(task.error)}`);
      documents += batch.length;
    }

    const exists = await meili.getRawIndex(target).then(
      () => true,
      () => false,
    );
    if (!exists) await meili.createIndex(target, { primaryKey: 'id' }).waitTask(TASK_TIMEOUT);
    const swap = await meili
      .swapIndexes([{ indexes: [target, staging], rename: false }])
      .waitTask(TASK_TIMEOUT);
    if (swap.status !== 'succeeded')
      throw new Error(`Index swap failed: ${JSON.stringify(swap.error)}`);
    return { documents };
  } finally {
    // After a successful swap the staging uid holds the previous index; either way it's garbage now.
    await meili.deleteIndexIfExists(staging);
  }
}
