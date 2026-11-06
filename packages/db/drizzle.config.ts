import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` diffs src/schema.ts against migrations/ — it needs no database connection.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  strict: true,
  verbose: true,
});
