# @iconnook/web

The iconnook.com website: Astro (server-rendered, Node adapter) with Preact islands and Tailwind CSS v4. All data comes from the IconNook API (`API_INTERNAL_URL` on the server; browsers load images/code from `PUBLIC_API_URL`).

```sh
docker compose up -d && pnpm db:migrate && pnpm db:seed   # data (+ pnpm icons:import for the full catalog)
pnpm --filter @iconnook/api dev                           # API on :8787
pnpm --filter @iconnook/web dev                           # site on :4321
pnpm --filter @iconnook/web typecheck                     # astro check
pnpm build && pnpm --filter @iconnook/web test:e2e        # Playwright journeys + axe (builds required)
```

## Pages

`/` · `/search?q=&type=&tier=&color=&set=&page=` · `/sets` · `/sets/{set}?after=` · `/categories` · `/categories/{slug}` · `/icons/{set}/{name}` · `/licenses` · 404 · `/robots.txt` · `/sitemap.xml` (index) → `/sitemaps/pages.xml` + `/sitemaps/{set}.xml`

## How it's built

- **Server-rendered, CDN-cached:** 370k icon pages can't be prebuilt; every page sets `Cache-Control` for the CDN (performance.md).
- **Works without JavaScript:** search, filters (Apply button), pagination, icon preview, downloads and SVG code are plain HTML. JS adds: the icon editor island (live color/size/stroke, copy-as tabs), `/` to focus search, roving-tabindex arrow-key navigation in icon grids, auto-submitting filters.
- **Icons inline in grids** (no request per icon), with SVG ids made unique per page (`@iconify/utils` `replaceIDs`) so gradients don't collide. Bodies were sanitized at import (packages/svg). The editor preview is an `<img>` of the API's sanitized SVG: no client-side `innerHTML`.
- **Security:** Astro's CSP (hashed scripts, no `unsafe-inline` for scripts; styles allow inline for icon `style` attributes), plus `frame-ancestors 'none'`, nosniff, frame/referrer/permissions headers via middleware.
- **Accessibility (WCAG 2.2 AA):** skip link, named landmarks, visible focus never hidden under the sticky header, 44 px targets, labels on every control, live region for "Copied", ARIA tabs for code formats, reduced motion, text-labelled license badges (not color alone), light theme with checked contrast (no dark mode, ADR 0004). Base CSS lives in `@layer base`: unlayered CSS would override Tailwind utilities.

## Tests

`e2e/journeys.spec.ts` (search → customize → copy, downloads, filters in URL, keyboard-only, no-results, 404, CSP/console errors, headers), `e2e/a11y.spec.ts` (axe, every template), `e2e/responsive.spec.ts` (320 px reflow, no-JS). Uses the CC0 fixture set from `pnpm db:seed`. Lighthouse budgets: `lighthouserc.json`.
