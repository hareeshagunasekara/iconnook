import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../src/client.js';
import { iconSets, icons } from '../src/schema.js';
import { FIXTURE_ICONS, FIXTURE_SET, seedFixtures } from '../src/seed.js';
import { createTestDatabase, type TestDatabase } from '../src/testing.js';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

interface PgError {
  code?: string;
  constraint_name?: string;
}

/** Awaits a query that must fail and returns the underlying Postgres error (Drizzle wraps it in `cause`). */
async function pgError(query: PromiseLike<unknown>): Promise<PgError> {
  try {
    await query;
  } catch (error) {
    const cause = error instanceof Error && error.cause ? error.cause : error;
    return cause as PgError;
  }
  throw new Error('Expected the query to fail, but it succeeded');
}

async function insertSet(prefix: string): Promise<number> {
  const [row] = await t.db
    .insert(iconSets)
    .values({ ...FIXTURE_SET, prefix })
    .returning({ id: iconSets.id });
  if (!row) throw new Error('insert returned no row');
  return row.id;
}

describe('migrations', () => {
  it('create every table from an empty database', async () => {
    const rows = await t.raw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`;

    expect(rows.map((r) => r.table_name)).toEqual([
      'categories',
      'collection_icons',
      'collections',
      'download_flushes',
      'downloads',
      'icon_categories',
      'icon_sets',
      'icon_tags',
      'icons',
      'tags',
    ]);
  });

  it('are safe to re-run', async () => {
    await expect(runMigrations(t.url)).resolves.toBeUndefined();
  });
});

describe('license rules', () => {
  it('reject tier X at the database level', async () => {
    const error = await pgError(
      t.raw`INSERT INTO icon_sets (prefix, name, license_spdx, license_tier, type)
            VALUES ('gpl-set', 'GPL Set', 'GPL-3.0-only', 'X', 'ui')`,
    );

    expect(error).toMatchObject({ code: '22P02' }); // invalid_text_representation (bad enum value)
  });

  it('require a license on every set', async () => {
    const error = await pgError(
      t.raw`INSERT INTO icon_sets (prefix, name, license_tier, type)
            VALUES ('no-license', 'No License', 'A', 'ui')`,
    );

    expect(error).toMatchObject({ code: '23502' }); // not_null_violation
  });
});

describe('icon constraints', () => {
  it('reject an icon whose set does not exist', async () => {
    const error = await pgError(
      t.db
        .insert(icons)
        .values({ setId: 999_999, name: 'orphan', body: '<g/>', width: 24, height: 24 }),
    );

    expect(error).toMatchObject({ code: '23503', constraint_name: 'icons_set_id_icon_sets_id_fk' });
  });

  it('reject duplicate names within a set but allow them across sets', async () => {
    const a = await insertSet('set-a');
    const b = await insertSet('set-b');
    const icon = { name: 'home', body: '<g/>', width: 24, height: 24 };

    await t.db.insert(icons).values({ ...icon, setId: a });
    expect(await pgError(t.db.insert(icons).values({ ...icon, setId: a }))).toMatchObject({
      code: '23505',
      constraint_name: 'icons_set_id_name_key',
    });
    await expect(t.db.insert(icons).values({ ...icon, setId: b })).resolves.toBeDefined();
  });

  it('reject names and prefixes that are not lowercase kebab-case', async () => {
    const setId = await insertSet('set-names');

    const badName = await pgError(
      t.db.insert(icons).values({ setId, name: 'Bad Name', body: '<g/>', width: 24, height: 24 }),
    );
    const badPrefix = await pgError(insertSet('Bad_Prefix'));

    expect(badName).toMatchObject({ code: '23514', constraint_name: 'icons_name_format' });
    expect(badPrefix).toMatchObject({ code: '23514', constraint_name: 'icon_sets_prefix_format' });
  });

  it('store fractional dimensions exactly', async () => {
    const setId = await insertSet('set-fractional');
    const [row] = await t.db
      .insert(icons)
      .values({ setId, name: 'narrow', body: '<g/>', width: 25.9, height: 24 })
      .returning({ width: icons.width });

    expect(row?.width).toBe(25.9);
  });

  it('delete a set’s icons when the set is deleted', async () => {
    const setId = await insertSet('set-cascade');
    await t.db.insert(icons).values({ setId, name: 'gone', body: '<g/>', width: 24, height: 24 });

    await t.db.delete(iconSets).where(eq(iconSets.id, setId));

    expect(await t.db.select().from(icons).where(eq(icons.setId, setId))).toHaveLength(0);
  });
});

describe('seedFixtures', () => {
  it('is idempotent', async () => {
    const first = await seedFixtures(t.db);
    const second = await seedFixtures(t.db);

    expect(second.setId).toBe(first.setId);
    const rows = await t.db.select().from(icons).where(eq(icons.setId, first.setId));
    expect(rows.map((r) => r.name).sort()).toEqual(FIXTURE_ICONS.map((i) => i.name).sort());
  });
});
