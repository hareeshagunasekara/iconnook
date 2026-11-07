import type { Redis } from 'ioredis';

/**
 * Runtime feature flags in Valkey (docs/standards/scalability.md): switch expensive features off
 * instantly during an incident — `pnpm flags set packs off` — without a deploy.
 * Missing flag or unreachable Valkey = enabled (fail open; the features have their own limits).
 */
export const FEATURE_FLAGS = ['packs', 'png'] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const FLAGS_KEY = 'flags';

export async function readFlags(redis: Redis): Promise<Record<FeatureFlag, boolean>> {
  const stored = await redis.hgetall(FLAGS_KEY);
  return Object.fromEntries(FEATURE_FLAGS.map((f) => [f, stored[f] !== 'off'])) as Record<
    FeatureFlag,
    boolean
  >;
}

export async function setFlag(redis: Redis, flag: FeatureFlag, enabled: boolean): Promise<void> {
  if (enabled) await redis.hdel(FLAGS_KEY, flag);
  else await redis.hset(FLAGS_KEY, flag, 'off');
}

/** Caches flags in memory for a few seconds so every request doesn't hit Valkey. */
export class FlagCache {
  private value: Record<FeatureFlag, boolean> | undefined;
  private fetchedAt = 0;

  constructor(
    private readonly redis: Redis,
    private readonly ttlMs = 5_000,
  ) {}

  async isEnabled(flag: FeatureFlag): Promise<boolean> {
    if (!this.value || Date.now() - this.fetchedAt > this.ttlMs) {
      try {
        this.value = await readFlags(this.redis);
      } catch {
        this.value ??= Object.fromEntries(FEATURE_FLAGS.map((f) => [f, true])) as Record<
          FeatureFlag,
          boolean
        >;
      }
      this.fetchedAt = Date.now();
    }
    return this.value[flag];
  }
}
