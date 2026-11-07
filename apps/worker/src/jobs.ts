import { schema, type Database } from '@iconnook/db';
import {
  listBatches,
  PACK_RETENTION_DAYS,
  packKey,
  PackRequest,
  readBatch,
  takePendingBatch,
} from '@iconnook/jobs';
import type { ObjectStorage } from '@iconnook/storage';
import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';

import { buildSprite, buildZip, type PackIcon, type RenderPng } from './pack-builder.js';

const { downloadFlushes, downloads, icons, iconSets } = schema;

/** Loads requested icons (keeping request order); refs that no longer exist are reported, not fatal. */
export async function loadPackIcons(
  db: Database,
  refs: readonly string[],
): Promise<{ icons: PackIcon[]; missing: string[] }> {
  const pairs = refs.map((r) => r.split(':') as [string, string]);
  const found: PackIcon[] = [];
  for (let i = 0; i < pairs.length; i += 200) {
    const chunk = pairs.slice(i, i + 200);
    const rows = await db
      .select({
        set: iconSets.prefix,
        name: icons.name,
        body: icons.body,
        width: icons.width,
        height: icons.height,
        setName: iconSets.name,
        author: iconSets.authorName,
        licenseSpdx: iconSets.licenseSpdx,
        licenseUrl: iconSets.licenseUrl,
        tier: iconSets.licenseTier,
      })
      .from(icons)
      .innerJoin(iconSets, eq(iconSets.id, icons.setId))
      .where(
        and(
          eq(icons.hidden, false),
          or(...chunk.map(([set, name]) => and(eq(iconSets.prefix, set), eq(icons.name, name)))),
        ),
      );
    found.push(...rows);
  }
  const byRef = new Map(found.map((icon) => [`${icon.set}:${icon.name}`, icon]));
  return {
    icons: refs.flatMap((r) => byRef.get(r) ?? []),
    missing: refs.filter((r) => !byRef.has(r)),
  };
}

export interface PackResult {
  key: string;
  icons: number;
  missing: string[];
  bytes: number;
}

/** Builds a pack and stores it under its content-addressed key. Idempotent: safe to retry or resume. */
export async function processPack(
  id: string,
  data: unknown,
  deps: { db: Database; storage: ObjectStorage; renderPng: RenderPng },
  onProgress: (percent: number) => Promise<void>,
): Promise<PackResult> {
  const req = PackRequest.parse(data); // never trust queue contents blindly
  const { icons: found, missing } = await loadPackIcons(deps.db, req.icons);
  if (found.length === 0) throw new Error('None of the requested icons exist');
  await onProgress(5);

  const pack =
    req.format === 'sprite'
      ? buildSprite(found, req)
      : await buildZip(found, missing, req, deps.renderPng, (f) =>
          onProgress(5 + Math.round(f * 85)),
        );
  await onProgress(95);

  const key = packKey(id, req.format);
  await deps.storage.put(key, pack.bytes, pack.contentType);
  await onProgress(100);
  return { key, icons: found.length, missing, bytes: pack.bytes.length };
}

/**
 * Moves pending download counts from Valkey into Postgres exactly once: each batch id is recorded in
 * download_flushes in the same transaction as its counts, so a batch re-read after a crash is skipped.
 */
export async function flushDownloads(
  redis: Redis,
  db: Database,
): Promise<{ batches: number; downloads: number }> {
  await takePendingBatch(redis);
  let total = 0;
  const keys = await listBatches(redis);
  for (const key of keys) {
    const batch = await readBatch(redis, key);
    await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(downloadFlushes)
        .values({ id: batch.id })
        .onConflictDoNothing()
        .returning();
      if (claimed.length === 0 || batch.counts.length === 0) return; // already applied, or empty

      // Icons may have been removed since they were downloaded; count only ones that still exist.
      const existing = new Set<number>();
      const ids = [...new Set(batch.counts.map((c) => c.iconId))];
      for (let i = 0; i < ids.length; i += 1_000) {
        const rows = await tx
          .select({ id: icons.id })
          .from(icons)
          .where(inArray(icons.id, ids.slice(i, i + 1_000)));
        for (const r of rows) existing.add(r.id);
      }
      const rows = batch.counts.filter((c) => existing.has(c.iconId));
      for (let i = 0; i < rows.length; i += 1_000) {
        await tx
          .insert(downloads)
          .values(rows.slice(i, i + 1_000))
          .onConflictDoUpdate({
            target: [downloads.iconId, downloads.day],
            set: { count: sql`${downloads.count} + excluded.count` },
          });
      }
      total += rows.reduce((n, r) => n + r.count, 0);
    });
    await redis.del(key);
  }
  return { batches: keys.length, downloads: total };
}

/** Deletes packs older than the retention period and old flush records. */
export async function cleanup(
  storage: ObjectStorage,
  db: Database,
  { now = new Date(), prefix = 'packs/' }: { now?: Date; prefix?: string } = {},
): Promise<{ packs: number }> {
  const cutoff = new Date(now.getTime() - PACK_RETENTION_DAYS * 86_400_000);
  const old = (await storage.list(prefix)).filter((o) => o.lastModified < cutoff);
  for (const o of old) await storage.delete(o.key);
  // Batches are deleted from Valkey right after they're applied, so month-old records are never needed.
  await db
    .delete(downloadFlushes)
    .where(lt(downloadFlushes.appliedAt, new Date(now.getTime() - 30 * 86_400_000)));
  return { packs: old.length };
}
