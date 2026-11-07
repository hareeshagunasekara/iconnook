import { randomBytes } from 'node:crypto';

import { schema } from '@iconnook/db';
import { createTestDatabase, type TestDatabase } from '@iconnook/db/testing';
import {
  DOWNLOADS_BATCH_PREFIX,
  FlagCache,
  packId,
  packKey,
  QUEUE_PACKS,
  readFlags,
  recordDownload,
  setFlag,
  type PackRequest,
} from '@iconnook/jobs';
import { loadStorageConfig, S3Storage } from '@iconnook/storage';
import { renderAsync } from '@resvg/resvg-js';
import { Queue, Worker, type Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { cleanup, flushDownloads, processPack } from '../src/jobs.js';

const { VALKEY_URL } = z.object({ VALKEY_URL: z.string() }).parse(process.env);
// Isolated Valkey database + BullMQ prefix: tests never touch dev/prod keys.
const TEST_DB = 15;
const redis = new Redis(VALKEY_URL, { db: TEST_DB, maxRetriesPerRequest: null });
const prefix = `bull_test_${randomBytes(4).toString('hex')}`;
const storage = new S3Storage(loadStorageConfig());
const renderPng = async (svg: string, width: number) =>
  (
    await renderAsync(svg, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: false },
    })
  ).asPng();

let t: TestDatabase;
let iconIds: number[] = [];
const refs = Array.from({ length: 500 }, (_, i) => `pack-test:icon-${String(i)}`);

beforeAll(async () => {
  t = await createTestDatabase();
  await redis.flushdb();
  const [set] = await t.db
    .insert(schema.iconSets)
    .values({
      prefix: 'pack-test',
      name: 'Pack Test',
      licenseSpdx: 'MIT',
      licenseTier: 'A',
      type: 'ui',
      authorName: 'IconNook',
    })
    .returning({ id: schema.iconSets.id });
  if (!set) throw new Error('set insert failed');
  const rows = await t.db
    .insert(schema.icons)
    .values(
      refs.map((r, i) => ({
        setId: set.id,
        name: r.split(':')[1] ?? '',
        body: `<circle cx="12" cy="12" r="${String((i % 10) + 1)}" fill="currentColor"/>`,
        width: 24,
        height: 24,
      })),
    )
    .returning({ id: schema.icons.id });
  iconIds = rows.map((r) => r.id);
});

afterAll(async () => {
  await redis.flushdb();
  await redis.quit();
  await t.drop();
});

const waitFor = async (check: () => Promise<boolean>, timeoutMs = 30_000) => {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe('packs through a real BullMQ queue', () => {
  it('builds a 500-icon ZIP with PNGs and stores it under its content-addressed key', async () => {
    const queue = new Queue(QUEUE_PACKS, { connection: redis, prefix });
    const worker = new Worker(
      QUEUE_PACKS,
      (job: Job) =>
        processPack(job.id ?? '', job.data, { db: t.db, storage, renderPng }, (p) =>
          job.updateProgress(p),
        ),
      { connection: redis.duplicate(), prefix, concurrency: 2 },
    );
    const request: PackRequest = { icons: refs, format: 'zip', png: 32, color: '#3443c4' };
    const id = packId(request);
    const job = await queue.add('pack', request, { jobId: id });

    await waitFor(async () => (await job.getState()) === 'completed', 120_000);
    const done = await queue.getJob(id);
    expect(done?.returnvalue).toMatchObject({ key: packKey(id, 'zip'), icons: 500, missing: [] });

    const file = await storage.get(packKey(id, 'zip'));
    if (!file) throw new Error('pack file missing');
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const svgs = Object.keys(files).filter((f) => f.startsWith('svg/'));
    const pngs = Object.keys(files).filter((f) => f.startsWith('png/'));
    expect(svgs).toHaveLength(500);
    expect(pngs).toHaveLength(500);
    expect(strFromU8(files['svg/pack-test/icon-7.svg'] ?? new Uint8Array())).toContain(
      'color="#3443c4"',
    );
    expect(strFromU8(files['png/pack-test/icon-7.png'] ?? new Uint8Array()).slice(1, 4)).toBe(
      'PNG',
    );
    expect(strFromU8(files['LICENSES.md'] ?? new Uint8Array())).toContain(
      'Icons in this pack: 500',
    );

    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await storage.delete(packKey(id, 'zip'));
  }, 180_000);

  it('resumes a job when the worker processing it dies', async () => {
    const queue = new Queue(QUEUE_PACKS, { connection: redis, prefix: `${prefix}_stall` });
    const request: PackRequest = { icons: refs.slice(0, 20), format: 'sprite' };
    const id = packId(request);

    // Worker A takes the job and then "crashes": its connection drops, so it never renews the lock.
    const deadConnection = redis.duplicate();
    deadConnection.on('error', () => undefined);
    let started = false;
    const workerA = new Worker(
      QUEUE_PACKS,
      async () => {
        started = true;
        await new Promise(() => undefined); // hangs forever, like a killed process
      },
      {
        connection: deadConnection,
        prefix: `${prefix}_stall`,
        lockDuration: 1_000,
        stalledInterval: 500,
      },
    );
    workerA.on('error', () => undefined);
    await queue.add('pack', request, { jobId: id, attempts: 3 });
    await waitFor(() => Promise.resolve(started));
    deadConnection.disconnect();

    // Worker B notices the stalled job and finishes it.
    const workerB = new Worker(
      QUEUE_PACKS,
      (job: Job) =>
        processPack(job.id ?? '', job.data, { db: t.db, storage, renderPng }, (p) =>
          job.updateProgress(p),
        ),
      {
        connection: redis.duplicate(),
        prefix: `${prefix}_stall`,
        lockDuration: 1_000,
        stalledInterval: 500,
      },
    );
    await waitFor(async () => (await (await queue.getJob(id))?.getState()) === 'completed', 30_000);
    expect(await storage.get(packKey(id, 'sprite'))).not.toBeNull();

    await workerB.close();
    await workerA.close(true).catch(() => undefined);
    await queue.obliterate({ force: true });
    await queue.close();
    await storage.delete(packKey(id, 'sprite'));
  }, 60_000);
});

describe('download counters', () => {
  const total = async () =>
    Number(
      (
        await t.db
          .select({ n: sql<string>`coalesce(sum(${schema.downloads.count}), 0)` })
          .from(schema.downloads)
      )[0]?.n,
    );

  it('stay exact under concurrent increments and concurrent flushes', async () => {
    const icons = iconIds.slice(0, 5);
    let flushing = true;
    // Three flushers racing each other (e.g. several worker replicas) while downloads pour in.
    const flushers = Array.from({ length: 3 }, async () => {
      while (flushing) {
        await flushDownloads(redis, t.db);
        await new Promise((r) => setTimeout(r, 5));
      }
    });
    await Promise.all(
      Array.from({ length: 2_000 }, (_, i) => recordDownload(redis, icons[i % icons.length] ?? 0)),
    );
    flushing = false;
    await Promise.all(flushers);
    await flushDownloads(redis, t.db);

    expect(await total()).toBe(2_000);
    for (const id of icons) {
      const [row] = await t.db
        .select()
        .from(schema.downloads)
        .where(eq(schema.downloads.iconId, id));
      expect(row?.count).toBe(400);
    }
  });

  it('never double-counts a batch re-read after a crash between commit and cleanup', async () => {
    const before = await total();
    await recordDownload(redis, iconIds[10] ?? 0);
    await recordDownload(redis, iconIds[10] ?? 0);
    // Capture the batch the flusher is about to take, then put it back afterwards as if DEL never ran.
    const pending = await redis.hgetall('downloads:pending');
    await flushDownloads(redis, t.db);
    const [applied] = await t.db
      .select()
      .from(schema.downloadFlushes)
      .orderBy(sql`applied_at desc`)
      .limit(1);
    await redis.hset(`${DOWNLOADS_BATCH_PREFIX}${applied?.id ?? ''}`, pending);

    await flushDownloads(redis, t.db);
    expect(await total()).toBe(before + 2);
    expect(await redis.keys(`${DOWNLOADS_BATCH_PREFIX}*`)).toEqual([]);
  });

  it('ignores icons that were deleted before the flush', async () => {
    const before = await total();
    await recordDownload(redis, 999_999_999);
    await flushDownloads(redis, t.db);
    expect(await total()).toBe(before);
  });
});

describe('cleanup', () => {
  it('deletes packs older than the retention period and keeps recent ones', async () => {
    const key = packKey(randomBytes(16).toString('hex'), 'zip');
    await storage.put(key, new Uint8Array([1, 2, 3]), 'application/zip');

    await cleanup(storage, t.db, new Date());
    expect(await storage.get(key)).not.toBeNull();

    await cleanup(storage, t.db, new Date(Date.now() + 8 * 86_400_000));
    expect(await storage.get(key)).toBeNull();
  });
});

describe('feature flags', () => {
  it('default to on, switch off and on, and are cached briefly', async () => {
    expect(await readFlags(redis)).toEqual({ packs: true, png: true });
    const cache = new FlagCache(redis, 50);
    expect(await cache.isEnabled('packs')).toBe(true);

    await setFlag(redis, 'packs', false);
    expect(await readFlags(redis)).toEqual({ packs: false, png: true });
    await new Promise((r) => setTimeout(r, 60));
    expect(await cache.isEnabled('packs')).toBe(false);

    await setFlag(redis, 'packs', true);
    expect((await readFlags(redis)).packs).toBe(true);
  });
});
