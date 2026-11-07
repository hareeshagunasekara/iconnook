import { OpenAPIHono } from '@hono/zod-openapi';
import { except } from 'hono/combine';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { timeout } from 'hono/timeout';
import { pino, type Logger } from 'pino';

import type { Dependencies } from './domain.js';
import { checkRateLimit, rateLimit, requestLog, securityHeaders } from './http/middleware.js';
import { badRequest, ProblemError, problemResponse } from './http/problem.js';
import { registerV1, toIssues } from './routes/v1.js';
import { IconService } from './services/icon-service.js';

export interface AppOptions {
  apiUrl: string;
  siteUrl: string;
  /** Send HSTS (production only — browsers would pin localhost otherwise). */
  hsts: boolean;
  trustProxyHeader?: string | undefined;
  rateLimit: { perMinute: number; renderPerMinute: number };
  requestTimeoutMs?: number;
  logger?: Logger;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`timed out after ${String(ms)}ms`));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createApp(deps: Dependencies, options: AppOptions): OpenAPIHono {
  const logger = options.logger ?? pino({ level: 'silent' });
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problemResponse(c, badRequest('Invalid request parameters', toIssues(result.error)));
      }
      return undefined;
    },
  });
  const limitOpts = { trustProxyHeader: options.trustProxyHeader, logger };

  app.use('*', requestId());
  app.use('*', requestLog(logger));
  app.use('*', securityHeaders({ hsts: options.hsts }));
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'HEAD', 'OPTIONS'],
      exposeHeaders: [
        'ETag',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Retry-After',
      ],
      maxAge: 86_400,
    }),
  );
  app.use('*', timeout(options.requestTimeoutMs ?? 10_000));
  app.use(
    '/v1/*',
    rateLimit(
      deps.rateLimiter,
      { name: 'api', limit: options.rateLimit.perMinute, windowSeconds: 60 },
      limitOpts,
    ),
  );
  // ETags for JSON and SVG; PNGs are large and CDN-cached for a year, so hashing them is wasted CPU.
  app.use(
    '/v1/*',
    except((c) => c.req.path.endsWith('.png'), etag()),
  );

  // Liveness: no dependency checks, so a slow database never gets the pod killed.
  app.get('/healthz', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ status: 'ok' });
  });

  // Readiness: can this instance serve traffic right now?
  app.get('/readyz', async (c) => {
    const check = async (name: string, fn: () => Promise<void>) => {
      try {
        await withTimeout(fn(), 2_000);
        return [name, 'ok'] as const;
      } catch {
        return [name, 'down'] as const;
      }
    };
    const checks = Object.fromEntries(
      await Promise.all([
        check('database', () => deps.icons.ping()),
        check('search', () => deps.search.ping()),
        check('cache', () => deps.rateLimiter.ping()),
      ]),
    );
    // Valkey is optional: the rate limiter fails open without it, so it never makes a pod unready.
    const ready = checks['database'] === 'ok' && checks['search'] === 'ok';
    c.header('Cache-Control', 'no-store');
    const status = !ready ? 'unavailable' : checks['cache'] === 'ok' ? 'ok' : 'degraded';
    return c.json({ status, checks }, ready ? 200 : 503);
  });

  registerV1(app, {
    deps,
    service: new IconService(deps, options.siteUrl),
    apiUrl: options.apiUrl,
    siteUrl: options.siteUrl,
    checkRenderLimit: (c) =>
      checkRateLimit(
        c,
        deps.rateLimiter,
        { name: 'render', limit: options.rateLimit.renderPerMinute, windowSeconds: 60 },
        limitOpts,
      ),
  });

  app.doc31('/v1/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'IconNook API',
      version: '1.0.0',
      description: 'Free, open-source SVG icons. Every icon clearly licensed. No API key required.',
      license: { name: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
    },
    servers: [{ url: options.apiUrl }],
  });

  app.notFound((c) =>
    problemResponse(c, new ProblemError(404, 'not-found', 'Not Found', 'No such endpoint')),
  );

  app.onError((error, c) => {
    if (error instanceof ProblemError) return problemResponse(c, error);
    if (error instanceof HTTPException && error.status === 504) {
      return problemResponse(
        c,
        new ProblemError(504, 'timeout', 'Gateway Timeout', 'The request took too long'),
      );
    }
    logger.error({ err: error, reqId: c.get('requestId') }, 'unhandled error');
    return problemResponse(
      c,
      new ProblemError(500, 'internal-error', 'Internal Server Error', 'Something went wrong'),
    );
  });

  return app;
}
