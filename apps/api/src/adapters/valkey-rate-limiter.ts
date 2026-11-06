import type { Redis } from 'ioredis';

import type { RateLimiter, RateLimitResult } from '../domain.js';

/**
 * Fixed-window counter in Valkey: one INCR per request, the key expires with its window.
 * Atomic via MULTI so the TTL is always set on the first hit.
 */
export class ValkeyRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl',
  ) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const redisKey = `${this.prefix}:${key}:${String(window)}`;
    const results = await this.redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, 'NX')
      .exec();
    const used = Number(results?.[0]?.[1] ?? 0);
    const resetSeconds = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
    return { allowed: used <= limit, limit, remaining: Math.max(0, limit - used), resetSeconds };
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}
