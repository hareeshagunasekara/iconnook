import { createDb } from '../client.js';
import { loadDbConfig } from '../config.js';
import { seedFixtures } from '../seed.js';

const handle = createDb(loadDbConfig().DATABASE_URL, { max: 1 });
try {
  const result = await seedFixtures(handle.db);
  console.log(`Seeded fixture set #${String(result.setId)} with ${String(result.icons)} icons.`);
} finally {
  await handle.close();
}
