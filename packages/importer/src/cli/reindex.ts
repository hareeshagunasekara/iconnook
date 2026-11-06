import { createDb } from '@iconnook/db';
import { Meilisearch } from 'meilisearch';

import { loadImporterConfig } from '../config.js';
import { rebuildSearchIndex } from '../search.js';

const config = loadImporterConfig();
const handle = createDb(config.DATABASE_URL, { max: 2 });
try {
  const meili = new Meilisearch({ host: config.MEILI_URL, apiKey: config.MEILI_MASTER_KEY });
  const { documents } = await rebuildSearchIndex(handle.db, meili);
  console.log(`Search index rebuilt: ${String(documents)} documents.`);
} finally {
  await handle.close();
}
