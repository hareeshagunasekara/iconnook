import { serve } from '@hono/node-server';
import { createDb } from '@iconnook/db';
import { Redis } from 'ioredis';
import { Meilisearch } from 'meilisearch';
import { pino } from 'pino';

import { DrizzleIconRepository } from './adapters/drizzle-repository.js';
import { MeiliIconSearch } from './adapters/meili-search.js';
import { ResvgRenderer } from './adapters/resvg-renderer.js';
import { ValkeyRateLimiter } from './adapters/valkey-rate-limiter.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

// Composition root: read config, build adapters, inject them, start the server.
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });

const db = createDb(config.DATABASE_URL, { max: 10, statementTimeoutMs: 5_000 });
const redis = new Redis(config.VALKEY_URL, {
  // Fail fast so the rate limiter can fail open instead of stalling requests.
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  commandTimeout: 500,
});
redis.on('error', (err) => {
  logger.warn({ err }, 'valkey connection error');
});
const meili = new Meilisearch({
  host: config.MEILI_URL,
  apiKey: config.MEILI_API_KEY,
  timeout: 5_000,
});

const app = createApp(
  {
    icons: new DrizzleIconRepository(db.db),
    search: new MeiliIconSearch(meili),
    rateLimiter: new ValkeyRateLimiter(redis),
    png: new ResvgRenderer({ concurrency: config.PNG_CONCURRENCY }),
  },
  {
    apiUrl: config.PUBLIC_API_URL,
    siteUrl: config.PUBLIC_SITE_URL,
    hsts: config.NODE_ENV === 'production',
    trustProxyHeader: config.TRUST_PROXY_HEADER,
    rateLimit: {
      perMinute: config.RATE_LIMIT_PER_MINUTE,
      renderPerMinute: config.RATE_LIMIT_RENDER_PER_MINUTE,
    },
    logger,
  },
);

const server = serve({ fetch: app.fetch, port: config.API_PORT }, (info) => {
  logger.info({ port: info.port }, 'IconNook API listening');
});

// Graceful shutdown: stop accepting connections, let in-flight requests finish, close pools.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void Promise.allSettled([db.close(), redis.quit()]).then(() => process.exit(0));
    });
  });
}
