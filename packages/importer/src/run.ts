import { isImportable, type ImportableTier } from '@iconnook/core';
import type { Database } from '@iconnook/db';

import { prepareIcons } from './prepare.js';
import { syncSet, type SyncStats } from './sync.js';
import type { IconSource, SourceSet } from './types.js';

export interface ImportOptions {
  tiers: readonly ImportableTier[];
  /** Limit to these prefixes (default: every set in the selected tiers). */
  prefixes?: readonly string[];
  /** Reviewed sets imported even though their tier isn't selected (never Tier X). */
  approved?: readonly string[];
  log?: (line: string) => void;
}

export interface SetReport extends SyncStats {
  prefix: string;
  tier: string;
  icons: number;
  rejected: { name: string; reason: string }[];
  modified: string[];
}

/** Names the failing set and surfaces the database error instead of Drizzle's full query dump. */
export class ImportError extends Error {
  constructor(
    readonly prefix: string,
    cause: unknown,
  ) {
    const root = cause instanceof Error && cause.cause instanceof Error ? cause.cause : cause;
    super(
      `Importing set "${prefix}" failed: ${root instanceof Error ? root.message : String(root)}`,
      { cause },
    );
    this.name = 'ImportError';
  }
}

export function selectSets(sets: readonly SourceSet[], options: ImportOptions): SourceSet[] {
  const tiers = new Set<string>(options.tiers);
  const approved = new Set(options.approved);
  const prefixes = options.prefixes ? new Set(options.prefixes) : null;
  return sets.filter(
    (s) =>
      isImportable(s.licenseTier) &&
      (tiers.has(s.licenseTier) || approved.has(s.prefix)) &&
      (!prefixes || prefixes.has(s.prefix)),
  );
}

/** Imports the selected sets one by one; each set is its own transaction. */
export async function importSets(
  db: Database,
  source: IconSource,
  options: ImportOptions,
): Promise<SetReport[]> {
  const log = options.log ?? (() => undefined);
  const selected = selectSets(await source.listSets(), options);
  const reports: SetReport[] = [];

  for (const [i, meta] of selected.entries()) {
    const loaded = await source.loadSet(meta.prefix);
    const prepared = prepareIcons(loaded.icons);
    let stats: SyncStats;
    try {
      stats = await syncSet(db, loaded, prepared.icons);
    } catch (error) {
      throw new ImportError(meta.prefix, error);
    }
    reports.push({
      prefix: meta.prefix,
      tier: meta.licenseTier,
      icons: prepared.icons.length,
      rejected: prepared.rejected,
      modified: prepared.modified,
      ...stats,
    });
    log(
      `[${String(i + 1)}/${String(selected.length)}] ${meta.prefix}: ${String(prepared.icons.length)} icons ` +
        `(+${String(stats.inserted)} ~${String(stats.updated)} -${String(stats.deleted)} =${String(stats.unchanged)})` +
        (prepared.rejected.length ? `, ${String(prepared.rejected.length)} rejected` : '') +
        (prepared.modified.length ? `, ${String(prepared.modified.length)} sanitized` : ''),
    );
  }
  return reports;
}
