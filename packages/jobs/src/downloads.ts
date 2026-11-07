import { randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';

/**
 * Download counters (docs/standards/scalability.md): the API does one atomic HINCRBY per download;
 * the worker periodically moves the whole hash to a uniquely named batch (RENAME is atomic, so no
 * increment is ever lost) and applies it to Postgres. Field = "<iconId>:<YYYY-MM-DD>".
 */
export const DOWNLOADS_PENDING = 'downloads:pending';
export const DOWNLOADS_BATCH_PREFIX = 'downloads:batch:';

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

export async function recordDownload(
  redis: Redis,
  iconId: number,
  now = new Date(),
): Promise<void> {
  await redis.hincrby(DOWNLOADS_PENDING, `${String(iconId)}:${today(now)}`, 1);
}

export interface DownloadBatch {
  id: string;
  counts: { iconId: number; day: string; count: number }[];
}

/** Atomically takes everything counted so far and returns the batch key (null if nothing pending). */
export async function takePendingBatch(redis: Redis): Promise<string | null> {
  const key = `${DOWNLOADS_BATCH_PREFIX}${randomUUID()}`;
  try {
    await redis.rename(DOWNLOADS_PENDING, key);
  } catch (error) {
    if (error instanceof Error && /no such key/i.test(error.message)) return null;
    throw error;
  }
  return key;
}

/** All batches not yet deleted — including ones left behind by a crash mid-flush. */
export async function listBatches(redis: Redis): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, found] = await redis.scan(
      cursor,
      'MATCH',
      `${DOWNLOADS_BATCH_PREFIX}*`,
      'COUNT',
      100,
    );
    cursor = next;
    keys.push(...found);
  } while (cursor !== '0');
  return keys;
}

export async function readBatch(redis: Redis, key: string): Promise<DownloadBatch> {
  const raw = await redis.hgetall(key);
  const counts = Object.entries(raw).flatMap(([field, value]) => {
    const [id, day] = field.split(':');
    const iconId = Number(id);
    const count = Number(value);
    return Number.isSafeInteger(iconId) && day && /^\d{4}-\d{2}-\d{2}$/.test(day) && count > 0
      ? [{ iconId, day, count }]
      : [];
  });
  return { id: key.slice(DOWNLOADS_BATCH_PREFIX.length), counts };
}
