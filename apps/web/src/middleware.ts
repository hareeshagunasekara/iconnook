import { defineMiddleware } from 'astro:middleware';

/**
 * Security headers a CSP <meta> can't express (docs/standards/security.md), plus a default HTML
 * cache policy (docs/standards/performance.md). Pages may set their own Cache-Control.
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

export const onRequest = defineMiddleware(async (_context, next) => {
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
  return response;
});
