# IconNook — Build Plan

**IconNook** (iconnook.com) — a free, open-source SVG icon library. This plan builds it phase by phase. Every phase ends with a **validation gate** (nothing moves on until it passes) and is **merged to `main` via PR and tagged** (`phase-0`, `phase-1`, …).

Legend: 👤 = you must do it (account, payment, login) · 🤖 = Claude does it · 🤝 = together (you approve / paste into a secure place).

---

## How we work with git & GitHub (every phase)

1. 🤖 Create a branch from `main`: `phase-N/<short-name>` (bigger phases may use several `feat/…` branches).
2. 🤖 Commit in small, logical steps using **Conventional Commits** (`feat(api): …`, `chore: …`). Each commit builds and passes tests.
3. 🤖 Before every commit: `gitleaks` + lint + typecheck run via pre-commit hook. **No secrets, no `.env`, no tokens ever committed** — only `.env.example` with placeholder values.
4. 🤖 Push and open a PR with `gh pr create`: what/why/how tested, checklist from `docs/standards/workflow.md`.
5. CI must be green. 👤 You review and approve (or tell Claude to merge). Squash-merge.
6. 🤖 Tag the merge commit `phase-N` and update the **Progress** table at the bottom of this file.

**Secrets rule:** secrets live in (a) your local `.env` (gitignored), (b) GitHub Actions Secrets, (c) Kubernetes Secrets encrypted with SOPS. Never in chat if avoidable — you paste tokens directly into the terminal prompt / GitHub UI, not into the conversation.

---

## Accounts you'll need (summary)

| Service                   | Needed by                    | Cost                              | How Claude gets access                                                                             |
| ------------------------- | ---------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| GitHub                    | Phase 0                      | Free                              | ✅ Already connected (`gh` logged in as `hareeshagunasekara`)                                      |
| Cloudflare                | Phase 0 (domain), 8 (CDN/R2) | Free (domain ≈ $10–11/yr at cost) | You create a scoped **API token** → store as env var / GitHub secret; Claude uses `wrangler` / API |
| Domain iconnook.com       | Phase 0                      | ≈ $10–11/yr                       | Bought via Cloudflare Registrar (looked unregistered on 2026-11-07 — buy early)                    |
| Hetzner Cloud (VPS)       | Phase 8                      | ≈ €5–15/mo                        | You create a project **API token** → Claude uses `hcloud` CLI                                      |
| Renovate (GitHub App)     | Phase 1                      | Free                              | You click "Install" on the repo                                                                    |
| Sentry (optional, errors) | Phase 9                      | Free tier                         | DSN stored as secret                                                                               |

Everything else (Postgres, Meilisearch, Valkey, MinIO, Umami analytics, Uptime Kuma, Grafana) is **self-hosted — no accounts**.

---

## Phase 0 — Foundations & accounts

**Goal:** a clean, safe repo and the name/domain secured.

Steps:

1. 👤 **Buy the domain:** create a Cloudflare account (cloudflare.com, free plan) → Domain Registration → register **iconnook.com**. Turn on 2FA on Cloudflare and GitHub.
2. 👤 Decide repo visibility. **Recommended: make it public** — it's an open-source project, and on a free GitHub plan public repos get branch protection/rulesets, unlimited Actions minutes and free GHCR. (Private repos on Free can't enforce branch protection.) Nothing secret is in the history today.
3. 🤝 Rename the repo `vector` → `iconnook` (`gh repo rename iconnook`), set description + topics.
4. 🤖 Add repo hygiene files:
   - `.gitignore` (node_modules, dist, .astro, .env*, !.env.example, coverage, playwright-report, .DS_Store, *.log, .turbo, k8s secrets plaintext, kubeconfig)
   - `.env.example` (placeholders only), `.editorconfig`, `.gitattributes`, `.nvmrc` (24)
   - `README.md` (what IconNook is, status, links to docs), `CONTRIBUTING.md`, `SECURITY.md` (how to report vulnerabilities), `CODE_OF_CONDUCT.md`
   - `.github/`: PR template (definition-of-done checklist), issue templates (bug, feature, **new icon source** with license fields), `CODEOWNERS`, `dependabot.yml` for GitHub Actions
   - Rename project to IconNook across `CLAUDE.md`, docs
   - `docs/adr/0001-tech-stack.md` (records the decisions), `0002-license-tiers.md`
5. 🤖 Install `gitleaks` (brew) and scan the full history.
6. 🤖 Commit the planning docs already written (CLAUDE.md, SOURCES.md, docs/standards, this plan).
7. 🤝 Turn on GitHub: branch ruleset on `main` (PR required, status checks required, no force-push), secret scanning + push protection, Dependabot alerts, private vulnerability reporting.

**Validation gate:** `gitleaks detect` finds nothing · `git status` clean · `.env` provably ignored (`git check-ignore .env`) · ruleset blocks a direct push to `main` · domain shows as yours in Cloudflare.
**Commit/tag:** `chore: repo foundations` … → PR → `phase-0`.

---

## Phase 1 — Monorepo & tooling

**Goal:** an empty-but-real TypeScript monorepo where quality checks run locally and in CI.

Steps:

1. 🤖 Enable pnpm (`corepack enable pnpm`), create `pnpm-workspace.yaml`, root `package.json` scripts, **Turborepo** for task caching.
2. 🤖 `packages/config`: shared `tsconfig` (strict + extras from code-principles.md), ESLint (flat config, `import/no-cycle`), Prettier.
3. 🤖 Skeletons: `apps/web` (Astro + Preact + Tailwind v4), `apps/api` (Hono, `/healthz`), `packages/core` (license tiers) — each with a README and tests. `packages/db`, `packages/importer` and `apps/worker` are created in Phases 2, 3 and 6 when they get real code (YAGNI).
4. 🤖 Vitest workspace; Lefthook pre-commit (format, lint staged, gitleaks); commitlint for Conventional Commits.
5. 🤖 CI workflow `.github/workflows/ci.yml`: install (frozen lockfile) → lint → typecheck → test → build; CodeQL; dependency review.
6. 👤 Install the **Renovate** GitHub App on the repo (one click); 🤖 add `renovate.json`.
7. 🤖 Run `/init`-style refresh of `CLAUDE.md` Commands section with real commands; 🤝 optionally install the vetted extra skills (Astro, Hono, Drizzle, Tailwind, Docker, k8s, a11y) into `.claude/skills/`.

**Validation gate:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass on a clean clone · CI green on the PR · a commit with a bad message or a fake secret is rejected by hooks · `pnpm dev` serves the Astro page and `GET /healthz` returns 200.
**Tag:** `phase-1`.

---

## Phase 2 — Local infrastructure & database

**Goal:** the full backing stack runs locally with one command; schema exists.

Steps:

1. 🤖 `docker-compose.yml`: postgres 17, meilisearch, valkey, minio (+ bucket init) — pinned versions, healthchecks, named volumes, ports bound to 127.0.0.1.
2. 🤖 `packages/core/config`: Zod-validated env loader (process refuses to start on bad config); `.env.example` updated.
3. 🤖 `packages/db`: Drizzle schema (icon_sets, icons, tags, icon_tags, categories, icon_categories, downloads) + migrations + seed from a tiny fixture.
4. 🤖 Integration test harness (Testcontainers or compose in CI) — per-test isolated DB.

**Validation gate:** `docker compose up -d` → all services healthy · `pnpm db:migrate` from empty succeeds and is re-runnable · integration tests pass in CI with service containers · `.env` still not tracked.
**Tag:** `phase-2`.

---

## Phase 3 — Importer & SVG sanitizer (the core)

**Goal:** real Tier A icons in the database and search index, safely.

Steps:

1. 🤖 `IconSource` interface + Iconify adapter reading `@iconify/json` (pinned version).
2. 🤖 License-tier mapper (from SOURCES.md rules); **tier X rejected**, archive sets flagged.
3. 🤖 SVG pipeline: build full SVG → SVGO → DOMPurify (SVG profile) → size/element caps → store. Fail closed.
4. 🤖 Sanitizer test corpus (XSS payloads, entity bombs) + property tests; ≥ 95% branch coverage.
5. 🤖 Upsert into Postgres (idempotent), auto-tags from names, category mapping; build Meilisearch index (new index → atomic swap).
6. 🤖 Regenerate SOURCES.md from the importer's metadata so docs and data can't drift.

**Validation gate:** full Tier A import completes locally; counts match SOURCES.md (~370k) · re-run produces zero changes · tier X count in DB = 0 · every icon has a license · sanitizer corpus 100% neutralized · searching "home" in Meilisearch returns results in < 50ms.
**Tag:** `phase-3`.

---

## Phase 4 — API

**Goal:** a fast, safe, documented public API.

Steps:

1. 🤖 Routes from the backend plan (`/v1/search`, `/sets`, `/icons/:set/:name`, `.svg`, `.png`, `/code`, `/attribution`, `/categories`), layered routes → services → repositories.
2. 🤖 Zod everywhere, OpenAPI 3.1 at `/v1/openapi.json`, RFC 9457 errors.
3. 🤖 SVG customization (validated color/size/stroke), PNG via resvg-js with clamped sizes and bounded concurrency.
4. 🤖 Security headers, CORS policy, rate limiting (Valkey), request size limits, timeouts, `/healthz` + `/readyz`, pino logs without personal data.
5. 🤖 Cache headers + ETags, normalized params.

**Validation gate:** integration + contract tests pass · every route has 400/404/429 tests · OWASP ZAP baseline scan against local API has no high/medium findings · p95 targets met in a quick local k6 run · `/code-review medium` and `/security-review` run with findings fixed.
**Tag:** `phase-4`.

---

## Phase 5 — Web app

**Goal:** the IconNook website: browse, search, customize, download.

Steps:

1. 🤖 Design tokens (light/dark), layout, header with search, footer with license/FAQ links (consistent help).
2. 🤖 Pages: home, search results (filters in URL), set list + set page, category pages, icon page (preview, editor island, copy-as tabs, downloads, license + attribution), FAQ/licensing, 404.
3. 🤖 Accessible icon grid (roving tabindex, arrow keys, virtualization), keyboard shortcuts, live-region announcements, reduced motion.
4. 🤖 SEO basics: titles/meta, sitemap index (many icon pages), robots.txt, Open Graph images, canonical URLs.
5. 🤖 Playwright critical journeys + axe on every template; Lighthouse CI budgets.

**Validation gate:** all 8 critical E2E journeys pass · axe: zero violations · Lighthouse ≥ 95/100/100/100 on key templates · keyboard-only and VoiceOver smoke test done (👤 you try it too) · works at 320px and with JS disabled.
**Tag:** `phase-5`.

---

## Phase 6 — Worker, collections & downloads

**Goal:** bulk features without slowing the site.

Steps:

1. 🤖 BullMQ worker: ZIP packs, SVG sprites, PNG pre-render, download-counter flush; retries with backoff, dead-letter queue.
2. 🤖 Collections without accounts (local storage + shareable link stored in Postgres), bulk download.
3. 🤖 Feature flags for expensive features.

**Validation gate:** 500-icon ZIP builds and downloads correctly · counters accurate under concurrent load test · killing the worker mid-job → job resumes · flags turn features off instantly.
**Tag:** `phase-6`.

---

## Phase 7 — Containers & CI/CD

**Goal:** production-grade images built and verified only by CI.

Steps:

1. 🤖 Multi-stage Dockerfiles (non-root, read-only FS, pinned digests, healthchecks), `.dockerignore`.
2. 🤖 CI: build images → Trivy scan (fail on high/critical) → SBOM + provenance → push to **GHCR** tagged with git SHA (GHCR uses your GitHub account — no new account).
3. 🤖 `docker-compose.prod.yml` to run the built images locally end-to-end.

**Validation gate:** images run as non-root (`docker run … id` ≠ 0) · Trivy clean · full stack from GHCR images passes E2E locally · image sizes reasonable (api < 200 MB).
**Tag:** `phase-7`.

---

## Phase 8 — Infrastructure & first deploy (staging, then production)

**Goal:** IconNook live on iconnook.com behind Cloudflare.

Steps:

1. 👤 **Hetzner Cloud:** create account (hetzner.com/cloud), add payment, create project "iconnook", create an **API token (read/write)**. Run `hcloud context create iconnook` in your terminal and paste the token at the prompt (not in chat). Also upload your SSH public key.
2. 🤖 Provision VPS (e.g. CPX31/CCX13-class, Ubuntu LTS) via `hcloud`; firewall (80/443 from Cloudflare IPs only, SSH from your IP); unattended security updates.
3. 🤖 Install k3s; copy kubeconfig to your machine (`~/.kube/iconnook.yaml`, never committed).
4. 👤 **Cloudflare API token:** My Profile → API Tokens → create token with _Zone:DNS:Edit_, _Zone:Cache Purge_, _Account:R2 Storage:Edit_ scoped to iconnook.com only. Store it as `CLOUDFLARE_API_TOKEN` in your shell (or `.env`, gitignored) and as a GitHub Actions secret.
5. 🤖 Cloudflare: DNS records (proxied), SSL Full (strict) with origin certificate, cache rules, WAF + rate-limit rules, R2 bucket for assets, `staging.iconnook.com` protected by Cloudflare Access (free).
6. 🤖 `deploy/k8s`: namespaces (PSS restricted), Deployments/StatefulSets, Services, Traefik IngressRoutes, NetworkPolicies (default deny), resource limits, probes, PDBs, HPA; secrets encrypted with **SOPS + age** (👤 you keep the age private key safely; Claude never sees it unless you choose).
7. 🤖 Deploy workflow: on merge to `main` → migrations Job → rolling update to **staging**; manual approval (GitHub Environment) → **production**.
8. 🤖 Backups: Postgres daily + WAL to R2; **test a restore**.
9. 🤖 Import Tier A on production via the importer Job.

**Validation gate:** https://iconnook.com loads via Cloudflare with valid TLS · origin unreachable directly (only Cloudflare IPs) · securityheaders.com grade A · pods pass `restricted` admission · restore from backup verified · deploy + rollback both tested.
**Tag:** `phase-8`.

---

## Phase 9 — Launch readiness

**Goal:** confident public launch.

Steps:

1. 🤖 Monitoring: Grafana + Prometheus (or k3s-friendly stack), Uptime Kuma, alerts (👤 choose where alerts go: email / Telegram / Discord).
2. 🤖 Privacy-friendly analytics (self-hosted Umami) + Web Vitals collection. Optional 👤 Sentry free account for error tracking.
3. 🤖 k6 load tests on staging: baseline, spike (10×), soak, stress, cache-miss — results in `docs/load-tests/`.
4. 🤖 Full `/security-review`, ZAP full scan on staging, dependency audit; fix findings.
5. 🤖 Legal & trust pages: license FAQ, privacy policy, terms, trademark notice for logos, **takedown/contact** process (👤 provide a contact email — e.g. set up `hello@iconnook.com` with free Cloudflare Email Routing).
6. 👤 Submit sitemap to Google Search Console and Bing Webmaster (free accounts, verify via Cloudflare DNS — Claude can add the TXT record).

**Validation gate:** all load-test pass criteria met · no high/medium security findings · SLO dashboards live and alerts tested · restore + DR rehearsal done · you sign off.
**Tag:** `phase-9` → 🎉 **v1.0 launch**.

---

## Phase 10 — After launch (each its own small phase)

- Tier B & C sets with attribution UI · extra sources (Open Peeps, Openclipart, AIGA, Natural Earth)
- Topic categories & better tagging (CLDR synonyms) · "similar icons"
- Public API docs page + API keys · Figma & VS Code plugins
- Optional accounts (GitHub OAuth / passkeys) · community uploads with moderation
- i18n · scaling to stage 2 when metrics say so (scalability.md)
- `/schedule` a weekly job that checks `@iconify/json` for new sets / license changes

---

## Progress

| Phase                  | Status       | PR                                                          | Tag       | Validated on                                                                                                                                                            |
| ---------------------- | ------------ | ----------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Foundations          | ✅ done      | [#1](https://github.com/hareeshagunasekara/iconnook/pull/1) | `phase-0` | 2026-11-07: gitleaks clean (tree + history), `.env` ignored, direct push to `main` rejected, secret scanning + push protection on, iconnook.com registered (Cloudflare) |
| 1 Monorepo & tooling   | 🟡 in review |                                                             |           | 2026-11-07 local: format/lint/typecheck/test (17)/build pass; `/healthz` 200; invalid config refused; hooks reject bad commit msg + secrets                             |
| 2 Local infra & DB     | —            |                                                             |           |                                                                                                                                                                         |
| 3 Importer & sanitizer | —            |                                                             |           |                                                                                                                                                                         |
| 4 API                  | —            |                                                             |           |                                                                                                                                                                         |
| 5 Web                  | —            |                                                             |           |                                                                                                                                                                         |
| 6 Worker & collections | —            |                                                             |           |                                                                                                                                                                         |
| 7 Containers & CI/CD   | —            |                                                             |           |                                                                                                                                                                         |
| 8 Infra & deploy       | —            |                                                             |           |                                                                                                                                                                         |
| 9 Launch readiness     | —            |                                                             |           |                                                                                                                                                                         |
