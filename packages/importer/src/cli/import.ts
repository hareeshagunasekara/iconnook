import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { isImportable, type ImportableTier } from '@iconnook/core';
import { createDb } from '@iconnook/db';
import { Meilisearch } from 'meilisearch';

import { loadImporterConfig } from '../config.js';
import { importSets } from '../run.js';
import { rebuildSearchIndex } from '@iconnook/search';
import { iconifySource } from '../sources/iconify.js';

const { values } = parseArgs({
  options: {
    tiers: { type: 'string', default: 'A' },
    sets: { type: 'string' },
    'no-index': { type: 'boolean', default: false },
  },
});

const tiers = values.tiers.split(',').map((t) => t.trim().toUpperCase());
if (
  !tiers.every((t): t is ImportableTier => (t === 'A' || t === 'B' || t === 'C') && isImportable(t))
) {
  throw new Error(`--tiers must be a list of A, B, C (got "${values.tiers}")`);
}

const config = loadImporterConfig();
const handle = createDb(config.DATABASE_URL, { max: 2 });
const started = Date.now();

try {
  const reports = await importSets(handle.db, iconifySource, {
    tiers,
    ...(values.sets ? { prefixes: values.sets.split(',').map((s) => s.trim()) } : {}),
    log: (line) => {
      console.log(line);
    },
  });

  const sum = (key: 'icons' | 'inserted' | 'updated' | 'deleted' | 'unchanged') =>
    reports.reduce((n, r) => n + r[key], 0);
  const rejected = reports.reduce((n, r) => n + r.rejected.length, 0);
  const modified = reports.reduce((n, r) => n + r.modified.length, 0);
  console.log(
    `\nImported ${String(reports.length)} sets, ${String(sum('icons'))} icons in ${String(Math.round((Date.now() - started) / 1000))}s: ` +
      `+${String(sum('inserted'))} ~${String(sum('updated'))} -${String(sum('deleted'))} =${String(sum('unchanged'))}; ` +
      `${String(rejected)} rejected, ${String(modified)} changed by sanitizer.`,
  );

  // Full per-set details (rejections, sanitizer changes) for review; .data/ is gitignored.
  await mkdir('../../.data', { recursive: true });
  await writeFile('../../.data/import-report.json', JSON.stringify(reports, null, 2));
  console.log('Report: .data/import-report.json');

  if (!values['no-index']) {
    const meili = new Meilisearch({ host: config.MEILI_URL, apiKey: config.MEILI_MASTER_KEY });
    const { documents } = await rebuildSearchIndex(handle.db, meili);
    console.log(`Search index rebuilt: ${String(documents)} documents.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await handle.close();
}
