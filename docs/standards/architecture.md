# Architecture Guide

## Shape of the system

```
Browser ──► Cloudflare (CDN, WAF, cache) ──► Traefik ingress (k3s)
                                            ├── web    Astro (SSR + static), cached at edge
                                            ├── api    Hono, stateless, ≥2 replicas
                                            └── (internal) postgres · meilisearch · valkey · minio/R2
              worker (BullMQ) ◄── valkey queue      importer (Job) ──► postgres + meili + storage
```

- **Static first.** Anything that can be built ahead or cached at the edge, is. The origin should see a small fraction of traffic.
- **Postgres is the source of truth.** Meilisearch and caches are derived and must be rebuildable from Postgres with one command.
- **Stateless services.** `web`, `api`, `worker` hold no local state; they can be killed and rescheduled any time.

## Module boundaries (monorepo)

```
apps/web ─┐
apps/api ─┼──► packages/db (schema, types)   packages/config (tooling only)
apps/worker┘         ▲
packages/importer ───┘
```

- Apps depend on packages, **never on each other**. `web` talks to `api` over HTTP (or reads build-time data), not via imports.
- Packages never import from apps. No circular dependencies (enforce with ESLint `import/no-cycle` or dependency-cruiser).
- Shared code earns a package only when two apps need it (rule of three applies loosely).

## Inside a service (layered, hexagonal-lite)

```
routes/      HTTP: parse input (Zod), call service, map to response. No business logic.
services/    Business logic. Pure where possible. Depends on interfaces (ports).
repositories/ Data access behind interfaces (IconRepository, SearchIndex, Storage).
adapters/    Concrete implementations: Drizzle/Postgres, Meilisearch, R2/MinIO, Valkey.
main.ts      Composition root: read config, build adapters, inject into services, start server.
```

Dependencies point inward: routes → services → interfaces ← adapters. Services never import an adapter directly.

## Twelve-Factor rules we apply

1. One codebase (this monorepo), many deploys (local, staging, prod).
2. Dependencies declared explicitly (`package.json` + lockfile; base images pinned by digest).
3. **Config in environment variables**, validated by Zod at startup; the process refuses to start on invalid config. `.env.example` lists every variable; real `.env` is never committed.
4. Backing services (Postgres, Meili, Valkey, storage) are attached resources, swappable by URL.
5. Build → release → run are separate (CI builds an image once; the same image runs everywhere).
6. Processes are stateless. 7. Services export HTTP on a port from `PORT`.
7. Scale by adding processes (replicas), not threads. 9. Fast startup, graceful shutdown on `SIGTERM` (finish in-flight requests, close pools).
8. Dev/prod parity via Docker Compose ≈ k3s. 11. Logs are structured JSON to stdout (pino). 12. Admin tasks (migrate, import, reindex) run as one-off Jobs using the same image.

## API design

- REST, versioned under `/v1`. Breaking changes → `/v2`; additive changes are fine in place.
- Nouns for resources (`/icons/:set/:name`), plural collections, kebab-case paths, camelCase JSON.
- All inputs Zod-validated; OpenAPI 3.1 generated from the schemas and published at `/v1/openapi.json`.
- Errors as RFC 9457 Problem Details (`application/problem+json`) with `type`, `title`, `status`, `detail`.
- Cursor pagination for lists (`?cursor=&limit=`, max limit enforced).
- **Cacheability is a design requirement:** GET responses set `Cache-Control` and `ETag`; asset URLs are deterministic for the same params (normalize & sort query params) so the CDN can cache them.
- Idempotent operations are GET/PUT/DELETE; anything long-running (ZIP packs) returns `202` + a job URL.
- Health endpoints: `/healthz` (liveness, no dependencies), `/readyz` (readiness, checks DB/search).

## Data

- Schema changes only through Drizzle migrations, committed and reviewed; migrations are forward-only and safe to run while the old version is still serving (expand → migrate → contract).
- Every table has a primary key, `created_at`, and foreign keys with explicit `ON DELETE`.
- Index for the queries we actually run; check with `EXPLAIN` before adding a slow query.
- License data is mandatory: an icon cannot be inserted without a set that has `license_spdx` and `license_tier`.
- Imports are idempotent: re-running the importer produces the same state (upsert by `set_prefix + name`).

## Decisions

Record significant choices as ADRs in `docs/adr/NNNN-title.md` (Context → Decision → Consequences). Anything that changes the stack in `CLAUDE.md` needs an ADR.

## Observability

- Structured logs with a request ID propagated across services; no personal data (no raw IPs stored long-term, no user agents in logs).
- Metrics: request rate/latency/errors per route, queue depth, import results. Uptime checks on public endpoints.
- Alert on symptoms users feel (error rate, latency, site down), not on every warning.
