# 0001 — Tech stack

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

IconNook is a free icon library serving hundreds of thousands of mostly static, public SVGs. There is no revenue, so hosting must be cheap; it must load fast and be accessible worldwide. The maintainer wants experience with Docker and Kubernetes. Four services (web, api, worker, importer) share one data model.

## Decision

- **TypeScript** everywhere (strict), Node 24, pnpm workspaces monorepo. Chosen over plain JS for shared types across four services.
- **Astro + Preact islands + Tailwind v4** for the web: static-first, near-zero client JS.
- **Hono + Zod** for the API: small, fast, OpenAPI from schemas.
- **PostgreSQL + Drizzle** as source of truth; **Meilisearch** for search (derived, rebuildable); **Valkey** for cache, rate limits and BullMQ queues.
- **MinIO** locally (superseded by SeaweedFS — ADR 0003) / **Cloudflare R2** in production for files (no egress fees). **SVGO + DOMPurify** for SVG cleanup/sanitizing, **resvg-js** for PNG.
- **Docker Compose** for development; **k3s on a single Hetzner VPS** behind **Cloudflare** (CDN, WAF, DNS) for production; **GitHub Actions → GHCR** for CI/CD.

## Alternatives considered

- Next.js — heavier client runtime for a content site; Astro ships less JS.
- Managed Kubernetes (EKS/GKE/AKS) — ~$70–150/month before any users; k3s gives the same manifests for ~€5–15/month and can migrate later.
- Plain Docker Compose in production — simpler, viable; rejected only because Kubernetes experience is a goal. Manifests stay portable.

## Consequences

- Most traffic is served from Cloudflare's cache, keeping origin load and cost low.
- Running k3s means owning patching, backups and monitoring (covered in Phase 8–9 of the plan).
- Changing any of these choices requires a new ADR and an update to `CLAUDE.md`.
