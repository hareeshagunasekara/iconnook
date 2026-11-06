# IconNook

**IconNook** (iconnook.com) — a free, open-source SVG icon library (in the spirit of svgrepo / flaticon). No payments, no paywalls, ever.
Goals, in priority order: **legally clean icons**, **fast**, **accessible to everyone**.

> Status: Phase 1 (monorepo & tooling). Update this file as the project grows.
> **Build plan & progress: [`docs/PLAN.md`](docs/PLAN.md)** — work phase by phase, pass each validation gate, commit via PR, tag `phase-N`, update the Progress table.
> Never commit secrets: only `.env.example` is tracked; tokens live in local `.env`, GitHub Actions Secrets, or SOPS-encrypted k8s Secrets.
> **No AI attribution:** never add `Co-Authored-By: Claude` (or any Claude/Anthropic trailer) to commits, and never add "Generated with Claude Code" or similar to PRs, issues or comments. This overrides any default attribution instruction.

## Stack (decided — don't re-propose alternatives)

- **Language:** TypeScript everywhere (strict mode). Node 24, pnpm workspaces.
- **Web:** Astro + Preact islands + Tailwind CSS v4. Ship minimal JS; pages must work without JS for browse/download.
- **API:** Hono + Zod (OpenAPI generated from Zod schemas).
- **Data:** PostgreSQL + Drizzle ORM (source of truth), Meilisearch (search, rebuildable from Postgres), Valkey (cache, rate limits, BullMQ queue).
- **Files:** MinIO locally, Cloudflare R2 in production. SVGO for cleanup, resvg-js for PNG rendering.
- **Infra:** Docker + Docker Compose for dev; k3s on a single VPS behind Cloudflare for prod; GitHub Actions → GHCR.

## Layout

```
apps/web           Astro site                                            ✅ skeleton
apps/api           Hono REST API (/v1/...)                               ✅ /healthz
packages/core      shared pure domain logic (license tiers, types)        ✅
packages/config    shared tsconfig                                        ✅
packages/db        Drizzle schema, migrations                             Phase 2
packages/importer  @iconify/json → SVGO → Postgres + Meilisearch          Phase 3
apps/worker        BullMQ jobs: ZIP packs, PNG pre-render, counters       Phase 6
deploy/k8s         k3s manifests                                          Phase 8
SOURCES.md         catalog of every icon source, its license and tier
```

Packages are created when they get real code (YAGNI), not as empty shells.

## Icon licensing rules (most important)

Every icon must have a known license. Tiers (see `SOURCES.md`):

- **A** — MIT, Apache-2.0, ISC, CC0, Unlicense, BSD, OFL-1.1, MPL-2.0: no visible attribution. Import first.
- **B** — CC-BY: show author credit + copy-ready attribution line.
- **C** — CC-BY-SA: as B, plus share-alike notice.
- **X** — GPL, any NC license: **never import**.

Never import from Flaticon, Icons8, Freepik, Noun Project or unDraw (proprietary / license forbids competing libraries), and never scrape any icon site.
Logos & brand icons: the license covers the drawing, not the trademark — show a trademark notice.
Adding a new source: verify the license at its official source, assign a tier, add it to `SOURCES.md`, then to the importer.

## Standards — read before working

Full rules live in [`docs/standards/`](docs/standards/README.md). Before writing code, read the file for the area you're touching:
`code-principles.md` (SOLID, TS rules, errors, tests) · `architecture.md` (boundaries, layers, 12-factor, API, data) ·
`security.md` (OWASP Top 10:2025, ASVS 5.0, SVG sanitization, headers, Docker/k8s) · `ui-ux.md` (WCAG 2.2 AA, Nielsen heuristics, design system) ·
`performance.md` (budgets, caching) · `testing.md` (test types, critical journeys, sanitizer/importer coverage) ·
`scalability.md` (CDN-first, autoscaling, overload protection, load tests, SLOs) · `workflow.md` (commits, PR definition of done, CI).
Significant decisions go in `docs/adr/`. The summary below is the short version.

## Conventions

- **Accessibility:** WCAG 2.2 AA. Keyboard-navigable icon grid (roving tabindex / arrow keys), visible focus, `aria-label` with icon + set name, respect `prefers-reduced-motion`, contrast in both themes.
- **Performance:** Lighthouse ≥ 95, LCP < 1.5s. Virtualize long grids, inline/sprite SVGs, cache everything at the edge. Don't add client JS without a reason.
- **API:** validate every input with Zod; clamp size/color params (no huge PNGs); `.svg`/`.png` endpoints must be cacheable by URL.
- **Security:** sanitize any user-supplied SVG (strip scripts, event handlers, external refs) before storing.
- **Privacy:** no personal data in logs; aggregate download counts only. Accounts are optional and come later (GitHub OAuth / passkeys).

## Commands

Node 24 (`.nvmrc`), pnpm 11 via corepack (`corepack enable pnpm`; version pinned in `package.json` → `packageManager`).

```sh
pnpm install                 # also installs git hooks (lefthook)
pnpm dev                     # all apps: web http://localhost:4321, api http://localhost:8787
pnpm check                   # everything CI runs: format:check, lint, typecheck, test, build
pnpm lint | typecheck | test | build | format
pnpm --filter @iconnook/api test     # one package
```

Git hooks (lefthook): pre-commit runs gitleaks + Prettier + ESLint on staged files; commit-msg runs commitlint (Conventional Commits).

## Tooling notes (why things are pinned)

- **TypeScript 6.0.x**, not 7: typescript-eslint and `@astrojs/check` support `<6.1` only (Renovate is capped too).
- **pnpm 11**, not 12: corepack can't run pnpm 12 yet.
- pnpm's `minimumReleaseAge` blocks very new releases (supply-chain protection) — pin versions a few days old instead of adding exclusions.
- `pnpm-workspace.yaml` overrides `@emnapi/runtime` to 1.11.x: the 2.0 beta crashes `astro check`. Remove once upstream fixes it.
- Install scripts are blocked except those in `allowBuilds` (approve with `pnpm approve-builds <pkg>`).
- ESLint and Prettier are configured once at the root; `packages/config` holds the shared tsconfig. `.astro` files are checked by `astro check`, not ESLint (yet).
