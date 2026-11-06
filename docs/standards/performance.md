# Performance

Google's "good" Core Web Vitals (p75 of real visits): **LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1**. A static-first icon site should beat them comfortably, so our targets are stricter.

## Budgets (CI-enforced with Lighthouse CI on key templates: home, search, set, icon page)

| Metric                                                        | Target                                               |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| LCP                                                           | ≤ 1.5s (mobile, simulated 4G)                        |
| INP                                                           | ≤ 100ms                                              |
| CLS                                                           | ≤ 0.05                                               |
| TTFB (cached at edge)                                         | ≤ 200ms                                              |
| Lighthouse Performance / Accessibility / Best Practices / SEO | ≥ 95 / 100 / 100 / 100                               |
| JS per page (gzip)                                            | ≤ 50 KB initial; icon page editor island lazy-loaded |
| CSS per page (gzip)                                           | ≤ 20 KB                                              |
| API p95 latency (uncached)                                    | search ≤ 100ms, icon JSON ≤ 50ms, PNG render ≤ 300ms |

A PR that breaks a budget needs an explicit justification or a fix.

## Rendering

- **Astro islands:** ship zero JS by default; hydrate only interactive parts (`client:visible` / `client:idle`, rarely `client:load`).
- Icon grids: render the first screen as HTML; **virtualize** long lists; give every cell fixed dimensions (no CLS).
- Inline SVG for small counts; an SVG sprite (`<use href>`) for large grids; never one HTTP request per icon.
- Preload only the LCP-critical resource; no render-blocking third-party scripts (we have none).
- Fonts: system stack or one self-hosted subset variable font, `font-display: swap`, size-adjusted fallback.

## Caching

| What                                         | Cache-Control                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Hashed static assets (`/_astro/*`)           | `public, max-age=31536000, immutable`                                                           |
| Icon `.svg`/`.png`/JSON by deterministic URL | `public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400` (+ purge on re-import) |
| HTML pages                                   | `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`                                |
| Search API                                   | short `s-maxage` (e.g. 300) keyed on normalized query                                           |
| Anything user-specific                       | `private, no-store`                                                                             |

- Normalize query params (sorted, lowercase, defaults removed) so equivalent URLs share a cache entry.
- Brotli compression at the edge. HTTP/2+ (HTTP/3 via Cloudflare).
- ETags on API responses; support `If-None-Match`.

## Backend

- Postgres: indexes for every hot query; connection pooling; no N+1 (batch loads). Check with `EXPLAIN ANALYZE`.
- Meilisearch: only index fields we search/filter on; set `filterableAttributes`/`sortableAttributes` explicitly.
- Expensive work (PNG render, ZIP) is cached in storage after first generation; ZIPs are queued.
- Timeouts on every outbound call; cap concurrency for resvg rendering.

## Measuring

- Lab: Lighthouse CI in every PR. Field: real-user Web Vitals (the `web-vitals` library → our privacy-friendly analytics), reviewed monthly.
- Test on a mid-range Android profile, not just a fast laptop.
