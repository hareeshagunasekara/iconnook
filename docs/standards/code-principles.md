# Code Principles

## Core principles

**SOLID** — applied pragmatically in TypeScript, which favors functions and modules over class hierarchies:

| Principle | What it means here |
|---|---|
| **S**ingle Responsibility | One module = one reason to change. A route handler parses input, calls a service, shapes the response — it does not run SQL or render SVG itself. |
| **O**pen/Closed | Add behavior by adding code, not editing stable code. New icon source = new adapter implementing `IconSource`; the importer core doesn't change. New export format (JSX, Vue…) = new entry in a formatter map. |
| **L**iskov Substitution | Any implementation of an interface must be usable wherever the interface is expected. `MinioStorage` and `R2Storage` behave identically behind `Storage` — same errors, same semantics. |
| **I**nterface Segregation | Small, specific interfaces. A function that only reads icons takes `IconReader`, not the whole repository. |
| **D**ependency Inversion | Business logic depends on interfaces; concrete infra (Postgres, Meilisearch, R2) is injected at the edge (app startup). This is what makes services testable without Docker. |

**Also:**
- **KISS** — the simplest thing that meets the requirement. A static page beats an API call; an API call beats a queue.
- **YAGNI** — don't build for hypothetical futures (no plugin system until there's a second plugin, no accounts until we need them).
- **DRY, but rule of three** — duplicate once; extract on the third copy. Wrong abstractions cost more than duplication.
- **Composition over inheritance** — no class hierarchies deeper than one level.
- **Fail fast** — validate at the boundary, throw early, never continue with half-valid data.
- **Principle of least surprise** — names, return types and errors should be what a reader would guess.
- **Boy-scout rule** — leave touched code slightly better, but keep refactors out of feature PRs if they're large.

## TypeScript rules

- `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`. No `any` — use `unknown` and narrow. `// @ts-expect-error` only with a reason comment.
- **Parse, don't validate:** every external input (HTTP, env vars, files, DB JSON, third-party data) goes through a Zod schema at the boundary; inner code receives typed, trusted values. Infer types from schemas (`z.infer`) instead of writing them twice.
- Shared domain types live in `packages/db` (or a `packages/core` if it grows) — never redefine `Icon` in an app.
- Prefer `type` unions and discriminated unions over enums; prefer `readonly` data.
- Pure functions for logic (SVG transforms, license tier mapping, slug generation); side effects at the edges.
- ESM only. Named exports (no default exports except where a framework requires them, e.g. Astro pages).

## Naming

- Files: `kebab-case.ts`. Components: `PascalCase.tsx` / `.astro`. Types: `PascalCase`. Functions/vars: `camelCase`. Constants: `SCREAMING_SNAKE_CASE` only for true compile-time constants.
- Names say what, not how: `getIconsBySet`, not `fetchData2`. Booleans read as questions: `isColor`, `hasAttribution`.
- Domain words are fixed — use them consistently: **icon**, **set** (not pack/collection for Iconify sets), **collection** (a user's saved list), **source**, **tier**, **tag**, **category**.

## Errors

- Throw typed errors (`NotFoundError`, `ValidationError`, `LicenseError`) from services; translate to HTTP once, in the API's error middleware, as RFC 9457 Problem Details.
- Never swallow errors. `catch` must handle, wrap with context (`cause`), or rethrow.
- Expected outcomes (icon not found) are return values or typed errors; unexpected ones crash the request and get logged.
- Handle exceptional conditions explicitly (timeouts, partial failures, empty results) — OWASP A10:2025.

## Functions & modules

- Small functions (aim < 40 lines), few parameters (> 3 → options object).
- No hidden global state. Config is read once at startup and passed in.
- Comments explain **why**, not what. Public functions in shared packages get a one-line JSDoc.
- Delete dead code; git remembers.

## Testing

Write code so it's testable: pure logic separated from I/O, dependencies injected (see Dependency Inversion above). Full testing strategy, tools and rules: [testing.md](testing.md).
