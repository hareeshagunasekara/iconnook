import { createServer } from 'node:http';

import { createDb } from '@iconnook/db';
import { QUEUE_MAINTENANCE, QUEUE_PACKS } from '@iconnook/jobs';
import { loadStorageConfig, S3Storage } from '@iconnook/storage';
import { renderAsync } from '@resvg/resvg-js';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';

import { loadConfig } from './config.js';
import { cleanup, flushDownloads, processPack } from './jobs.js';

// Composition root for the background worker.
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const db = createDb(config.DATABASE_URL, { max: 4 });
const storage = new S3Storage(loadStorageConfig());
// BullMQ workers need blocking commands that wait indefinitely: maxRetriesPerRequest must be null.
const connection = new Redis(config.VALKEY_URL, { maxRetriesPerRequest: null });

const renderPng = async (svg: string, width: number) =>
  (
    await renderAsync(svg, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: false },
    })
  ).asPng();

/**
 * Packs: retried with exponential backoff (set by the API when enqueuing). If this process dies
 * mid-job, its lock expires and BullMQ's stalled-job check hands the job to the next worker — and
 * because output keys are content-addressed, rebuilding from scratch is safe.
 */
const packs = new Worker(
  QUEUE_PACKS,
  async (job) => {
    if (!job.id) throw new Error('pack job without id');
    return processPack(job.id, job.data, { db: db.db, storage, renderPng }, (p) =>
      job.updateProgress(p),
    );
  },
  {
    connection,
    concurrency: config.WORKER_CONCURRENCY,
    lockDuration: 30_000,
    stalledInterval: 15_000,
  },
);

const maintenance = new Worker(
  QUEUE_MAINTENANCE,
  async (job) => {
    if (job.name === 'flush-downloads') return flushDownloads(connection, db.db);
    if (job.name === 'cleanup') return cleanup(storage, db.db);
    throw new Error(`Unknown maintenance job ${job.name}`);
  },
  { connection, concurrency: 1 },
);

for (const worker of [packs, maintenance]) {
  worker.on('completed', (job, result) => {
    logger.info({ queue: worker.name, job: job.name, id: job.id, result }, 'job completed');
  });
  worker.on('failed', (job, err) => {
    // After the last attempt the job stays in the failed set (our dead-letter queue) for inspection.
    logger.error(
      { queue: worker.name, job: job?.name, id: job?.id, attempts: job?.attemptsMade, err },
      'job failed',
    );
  });
}

// Recurring jobs (idempotent upserts: safe with several worker replicas).
const scheduler = new Queue(QUEUE_MAINTENANCE, { connection });
await scheduler.upsertJobScheduler(
  'flush-downloads',
  { every: config.DOWNLOADS_FLUSH_EVERY_MS },
  { name: 'flush-downloads' },
);
await scheduler.upsertJobScheduler('cleanup', { pattern: '17 3 * * *' }, { name: 'cleanup' });
// Liveness: healthy while both job processors are running (no dependency checks, like the API).
const health = createServer((req, res) => {
  const ok = req.url === '/healthz' && packs.isRunning() && maintenance.isRunning();
  res.writeHead(ok ? 200 : 503, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify({ status: ok ? 'ok' : 'unavailable' }));
});
health.listen(config.WORKER_HEALTH_PORT);
logger.info(
  { concurrency: config.WORKER_CONCURRENCY, healthPort: config.WORKER_HEALTH_PORT },
  'IconNook worker started',
);

// Graceful shutdown: finish the current jobs, then close connections.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    health.close();
    void Promise.allSettled([packs.close(), maintenance.close(), scheduler.close()])
      .then(() => Promise.allSettled([db.close(), connection.quit()]))
      .then(() => process.exit(0));
  });
}
