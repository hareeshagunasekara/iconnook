import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Max pooled connections (keep small: PgBouncer sits in front in production). */
  max?: number;
  /** Server-side statement timeout in ms (the API sets one so slow queries can't pile up). */
  statementTimeoutMs?: number;
}

export function createDb(url: string, options: CreateDbOptions = {}): DbHandle {
  const sql = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => undefined,
    ...(options.statementTimeoutMs
      ? { connection: { statement_timeout: options.statementTimeoutMs } }
      : {}),
  });
  return {
    db: drizzle(sql, { schema }),
    close: () => sql.end({ timeout: 5 }),
  };
}

/** Migrations ship with the package (`migrations/`), resolved relative to src/ or dist/. */
export const MIGRATIONS_DIR = new URL('../migrations', import.meta.url).pathname;

/** Applies pending migrations. Safe to run repeatedly; used by the CLI and the k8s migrate Job. */
export async function runMigrations(url: string): Promise<void> {
  const handle = createDb(url, { max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await handle.close();
  }
}
