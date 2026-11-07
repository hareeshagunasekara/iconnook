# Testing

Goal: confidence to deploy `main` any time. Tests are part of "done" (see workflow.md), not a follow-up.

## Test types & tools

| Layer             | Tool                                                                                                 | What it covers                                                                                                                        | Runs                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Static            | `tsc --noEmit`, ESLint, Prettier                                                                     | Types, bugs patterns, import cycles, formatting                                                                                       | Pre-commit + every PR                       |
| Unit              | **Vitest**                                                                                           | Pure logic: SVG transforms, sanitizer, license-tier mapping, slugging, Zod schemas, formatters (JSX/Vue/data URI)                     | Every PR                                    |
| Integration       | **Vitest + Testcontainers** (or the compose stack in CI)                                             | API routes against real Postgres / Meilisearch / Valkey; repositories; importer end-to-end on a fixture set; migrations up from empty | Every PR                                    |
| Contract          | OpenAPI schema check (generated spec diff) + response validation in integration tests                | API responses match the published `/v1/openapi.json`; no accidental breaking change                                                   | Every PR                                    |
| Component         | Vitest + Testing Library (Preact)                                                                    | Interactive islands: search box, editor controls, icon grid keyboard nav                                                              | Every PR                                    |
| E2E               | **Playwright** (Chromium, Firefox, WebKit; one mobile viewport)                                      | Critical user journeys (below) on a production build                                                                                  | Every PR (Chromium), nightly (all browsers) |
| Accessibility     | **@axe-core/playwright** in every E2E page visit; Lighthouse a11y = 100                              | WCAG 2.2 AA automated checks                                                                                                          | Every PR                                    |
| Visual regression | Playwright screenshots of a few key components/pages                                                 | Unintended UI changes                                                                                                                 | Every PR, reviewed on diff                  |
| Performance       | **Lighthouse CI** (budgets in performance.md)                                                        | LCP/CLS/JS size per template                                                                                                          | Every PR                                    |
| Load              | **k6**                                                                                               | Throughput, latency, scaling behavior (see scalability.md)                                                                            | Before launch, before big releases, monthly |
| Security          | gitleaks, `pnpm audit`/OSV, CodeQL, Trivy; **OWASP ZAP baseline** scan on staging; sanitizer fuzzing | Secrets, vulnerable deps, code flaws, image CVEs, header/config issues, SVG XSS                                                       | PR (static), nightly (ZAP, fuzz)            |
| Resilience        | Manual/scripted: kill pods, stop Meilisearch, saturate Valkey on staging                             | Graceful degradation, recovery                                                                                                        | Before launch, quarterly                    |

## Critical E2E journeys (must always pass)

1. Search "home" → results appear → open an icon → change color and size → copy SVG → clipboard contains valid, sanitized SVG with the chosen color.
2. Download SVG and PNG from an icon page; files open and match chosen size.
3. Filter by set + style + license tier; URL updates; reload and Back restore the same state.
4. **Keyboard only:** `/` focuses search, arrows move through the grid, Enter opens, all actions reachable, focus always visible.
5. Add icons to a collection (no account) → share link → open in fresh context → bulk download ZIP.
6. Tier B icon shows license badge and a copyable attribution line.
7. No-results search shows suggestions; API failure shows a friendly error, not a blank page.
8. Pages render core content with JavaScript disabled.

## What to test where

- **Sanitizer (security-critical, ≥ 95% branch coverage):** a corpus of known SVG XSS payloads (`<script>`, `onload=`, `javascript:` hrefs, `<foreignObject>`, `<use href="http://…">`, `@import` in `<style>`, entity bombs, huge files); each must be neutralized or rejected. Add a test for every new bypass we learn about. Property-based tests (fast-check): sanitize(sanitize(x)) === sanitize(x); output never contains `on*` attributes or external refs.
- **Importer (≥ 90%):** a small fixture of 3–4 sets (one per tier + one tier X) → assert tier X is skipped, licenses stored, re-run is idempotent, hidden icons excluded, search index matches DB.
- **API:** every route: happy path, validation failure (400 + Problem Details), not found (404), limits (oversized PNG → 400, rate limit → 429), cache headers present and correct.
- **Web:** the islands' behavior and accessibility; Astro pages via E2E rather than unit tests.

## Test data

- Fixtures are tiny, committed, and license-clean (use real MIT/CC0 icons). Never depend on the full 400k-icon dataset in PR CI.
- Each integration test gets an isolated DB (transaction rollback or per-test schema) and a uniquely named Meilisearch index. Tests never depend on order.
- No real external network in tests; the importer reads fixtures from disk.

## Rules

- Test behavior through public interfaces, not private internals. Mock only at boundaries (network, clock, randomness): prefer real Postgres over mocking the DB.
- Every bug fix includes a test that fails before the fix.
- Arrange–Act–Assert; one behavior per test; descriptive names (`rejects SVG with javascript: href`).
- **Flaky tests are bugs:** quarantine within a day, fix or delete within a week. No `sleep`: wait for conditions.
- Coverage is reported per package; thresholds enforced only for sanitizer and importer. Don't chase 100% elsewhere.
- Keep PR CI under ~10 minutes: parallelize, cache, run full browser matrix nightly.
