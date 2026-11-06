import { runMigrations } from '../client.js';
import { loadDbConfig } from '../config.js';

const { DATABASE_URL } = loadDbConfig();
await runMigrations(DATABASE_URL);
console.log('Migrations applied.');
