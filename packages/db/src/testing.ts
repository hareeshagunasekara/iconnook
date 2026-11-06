import { randomBytes } from 'node:crypto';

import postgres from 'postgres';

import { createDb, runMigrations, type DbHandle } from '../src/client.js';
import { loadDbConfig } from '../src/config.js';

export interface TestDatabase extends DbHandle {
  url: string;
  /** Raw SQL client, for assertions that bypass Drizzle's types (e.g. inserting tier 'X'). */
  raw: postgres.Sql;
  drop: () => Promise<void>;
}

/**
 * Creates an isolated, freshly migrated database for one test file and drops it afterwards.
 * Needs DATABASE_URL pointing at a server where the user may CREATE DATABASE (local compose / CI).
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = loadDbConfig().DATABASE_URL;
  const name = `iconnook_test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`CREATE DATABASE "${name}"`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());

  const handle = createDb(url.toString(), { max: 2 });
  const raw = postgres(url.toString(), { max: 1, onnotice: () => undefined });

  return {
    ...handle,
    url: url.toString(),
    raw,
    drop: async () => {
      await raw.end();
      await handle.close();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}
