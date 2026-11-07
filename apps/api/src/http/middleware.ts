import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';
import type { Logger } from 'pino';

import type { RateLimiter } from '../domain.js';
import { ProblemError, problemResponse } from './problem.js';

/** Cache policies from docs/standards/performance.md. */
export const CACHE = {
  asset: 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400',
  metadata: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
  search: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  none: 'no-store',
} as const;

export const setCache = (c: Context, policy: keyof typeof CACHE) => {
  c.header('Cache-Control', CACHE[policy]);
};

/** CSP for raw .svg responses: nothing loads or runs even if a browser opens the file directly. */
export const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * Security headers (docs/standards/security.md). Only sets a header if the route didn't already,
 * so asset routes can use their own CSP.
 */
export function securityHeaders(options: { hsts: boolean }): MiddlewareHandler {
  const headers: Record<string, string> = {
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // Icons are meant to be embedded on other sites.
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(options.hsts
      ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
      : {}),
  };
  return async (c, next) => {
    await next();
    for (const [name, value] of Object.entries(headers)) {
      if (!c.res.headers.has(name)) c.res.headers.set(name, value);
    }
  };
}

/**
 * Client identity for rate limiting: the trusted proxy header if configured, else the socket address.
 * Only a single, valid IP from the header is accepted (first entry of a list), so clients can't mint
 * fresh buckets with junk values. The header is only trustworthy if the origin is reachable solely
 * through that proxy (Phase 8 firewall). Hashed so raw IPs never reach Valkey.
 */
export function clientKey(c: Context, trustProxyHeader: string | undefined): string {
  const forwarded = trustProxyHeader
    ? c.req.header(trustProxyHeader)?.split(',')[0]?.trim()
    : undefined;
  let ip = forwarded && isIP(forwarded) ? forwarded : undefined;
  if (!ip) {
    try {
      ip = getConnInfo(c).remote.address;
    } catch {
      ip = undefined; // not running on a node server (e.g. tests via app.request)
    }
  }
  return createHash('sha256')
    .update(ip ?? 'unknown')
    .digest('base64url')
    .slice(0, 16);
}

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitOptions {
  trustProxyHeader: string | undefined;
  logger: Logger;
}

/**
 * Counts one request against `rule` and returns a 429 response if over the limit, else null.
 * Fails open if Valkey is unavailable (Cloudflare rate limits remain as the outer layer —
 * docs/standards/scalability.md), and logs it.
 */
export async function checkRateLimit(
  c: Context,
  limiter: RateLimiter,
  rule: RateLimitRule,
  opts: RateLimitOptions,
): Promise<Response | null> {
  const key = `${rule.name}:${clientKey(c, opts.trustProxyHeader)}`;
  let result;
  try {
    result = await limiter.hit(key, rule.limit, rule.windowSeconds);
  } catch (error) {
    opts.logger.warn({ err: error, rule: rule.name }, 'rate limiter unavailable, allowing request');
    return null;
  }
  c.header('RateLimit-Limit', String(result.limit));
  c.header('RateLimit-Remaining', String(result.remaining));
  c.header('RateLimit-Reset', String(result.resetSeconds));
  if (result.allowed) return null;
  c.header('Retry-After', String(result.resetSeconds));
  return problemResponse(
    c,
    new ProblemError(
      429,
      'rate-limited',
      'Too Many Requests',
      `Limit of ${String(rule.limit)} requests per ${String(rule.windowSeconds)}s reached`,
    ),
  );
}

export function rateLimit(
  limiter: RateLimiter,
  rule: RateLimitRule,
  opts: RateLimitOptions,
): MiddlewareHandler {
  return async (c, next) => {
    const limited = await checkRateLimit(c, limiter, rule, opts);
    if (limited) return limited;
    await next();
    return undefined;
  };
}

/** One structured log line per request. No IPs, no user agents, no query strings. */
export function requestLog(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    await next();
    logger.info(
      {
        reqId: c.get('requestId'),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status: c.res.status,
        ms: Math.round(performance.now() - started),
      },
      'request',
    );
  };
}
