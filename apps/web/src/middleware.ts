import { defineMiddleware } from 'astro:middleware';

/**
 * Security headers a CSP <meta> can't express (docs/standards/security.md), a default HTML cache
 * policy and gzip for rendered pages (docs/standards/performance.md). Pages may set their own
 * Cache-Control.
 */
const HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  ...(import.meta.env.PROD
    ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    : {}),
};

const COMPRESSIBLE = /^(text\/|application\/(xml|json))/;

/**
 * Long listings (e.g. /sets) are ~10× smaller gzipped. The CDN would compress too, but compressing
 * at the origin also shrinks origin → CDN traffic. Pages hold no secrets, so BREACH doesn't apply.
 */
function gzip(request: Request, response: Response): Response {
  if (
    !response.body ||
    response.headers.has('Content-Encoding') ||
    !COMPRESSIBLE.test(response.headers.get('content-type') ?? '') ||
    !/\bgzip\b/.test(request.headers.get('accept-encoding') ?? '')
  )
    return response;
  const headers = new Headers(response.headers);
  headers.set('Content-Encoding', 'gzip');
  headers.append('Vary', 'Accept-Encoding');
  headers.delete('Content-Length');
  return new Response(response.body.pipeThrough(new CompressionStream('gzip')), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  for (const [name, value] of Object.entries(HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  // Astro sends its hashed CSP as a header; frame-ancestors (anti-clickjacking) must be added to it.
  const csp = response.headers.get('Content-Security-Policy');
  if (!csp) {
    response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  } else if (!csp.includes('frame-ancestors')) {
    response.headers.set(
      'Content-Security-Policy',
      `${csp.replace(/;?\s*$/, '')}; frame-ancestors 'none'`,
    );
  }
  if (
    !response.headers.has('Cache-Control') &&
    response.headers.get('content-type')?.includes('text/html')
  ) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    );
  }
  return gzip(context.request, response);
});
