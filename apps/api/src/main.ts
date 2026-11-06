import { serve } from '@hono/node-server';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const server = serve({ fetch: createApp().fetch, port: config.API_PORT }, (info) => {
  console.log(`IconNook API listening on http://localhost:${String(info.port)}`);
});

// Graceful shutdown: stop accepting connections, let in-flight requests finish.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
