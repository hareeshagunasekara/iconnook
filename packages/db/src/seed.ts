import { eq, sql } from 'drizzle-orm';

import type { Database } from './client.js';
import { icons, iconSets } from './schema.js';

/**
 * A tiny, license-clean fixture for local development: three original shapes released by IconNook
 * under CC0. Real icon sets arrive with the importer (Phase 3).
 */
export const FIXTURE_SET = {
  prefix: 'iconnook-fixtures',
  name: 'IconNook Fixtures',
  authorName: 'IconNook',
  authorUrl: 'https://github.com/hareeshagunasekara/iconnook',
  licenseSpdx: 'CC0-1.0',
  licenseTier: 'A',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  type: 'ui',
  isColor: false,
  gridSize: 24,
  version: '1',
  sampleIcons: ['plus'] as string[],
} as const;

export const FIXTURE_ICONS = [
  { name: 'circle', body: '<circle cx="12" cy="12" r="9" fill="currentColor"/>' },
  { name: 'square', body: '<rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor"/>' },
  {
    name: 'plus',
    body: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  },
] as const;

/** Idempotent: re-running updates the fixture rows instead of duplicating them. */
export async function seedFixtures(db: Database): Promise<{ setId: number; icons: number }> {
  return db.transaction(async (tx) => {
    const [set] = await tx
      .insert(iconSets)
      .values(FIXTURE_SET)
      .onConflictDoUpdate({
        target: iconSets.prefix,
        set: { name: FIXTURE_SET.name, sampleIcons: FIXTURE_SET.sampleIcons },
      })
      .returning({ id: iconSets.id });
    if (!set) throw new Error('Fixture set upsert returned no row');

    const rows = FIXTURE_ICONS.map((icon) => ({ ...icon, setId: set.id, width: 24, height: 24 }));
    const inserted = await tx
      .insert(icons)
      .values(rows)
      .onConflictDoUpdate({
        target: [icons.setId, icons.name],
        set: { body: sql`excluded.body` },
      })
      .returning({ id: icons.id });
    await tx
      .update(iconSets)
      .set({ iconCount: sql`(SELECT count(*) FROM icons WHERE set_id = ${set.id} AND NOT hidden)` })
      .where(eq(iconSets.id, set.id));

    return { setId: set.id, icons: inserted.length };
  });
}
