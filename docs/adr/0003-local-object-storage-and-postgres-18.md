# 0003: SeaweedFS for local object storage, PostgreSQL 18

- **Status:** Accepted (amends ADR 0001)
- **Date:** 2026-11-07

## Context

ADR 0001 chose MinIO as the local S3-compatible store (production uses Cloudflare R2). Since then MinIO stopped publishing community Docker images and binaries (October 2025), moved the community edition to maintenance mode, and archived it; the `minio/minio` image is no longer on Docker Hub. ADR 0001 also implied PostgreSQL 17; PostgreSQL 18 is the current major release.

## Decision

- Use **SeaweedFS** (`chrislusf/seaweedfs`, Apache-2.0) as the local S3-compatible store in Docker Compose. It runs as a single `weed server -s3` process; `infra/seaweedfs/start.sh` writes S3 credentials from `.env` and creates the app bucket.
- Use **PostgreSQL 18** (`postgres:18.6-alpine`) locally, in CI service containers, and later in production.

## Alternatives considered

- Garage: AGPL-3.0 and needs a config file before first start; fine for dev but more setup.
- RustFS: closest to MinIO's UX but still alpha.
- Building MinIO from source: unmaintained upstream; no security fixes.

## Consequences

- Application code talks to storage only through the S3 API, so SeaweedFS (dev) and R2 (prod) are interchangeable behind a `Storage` interface.
- Postgres 18 images store data under `/var/lib/postgresql/18/`, so volumes mount `/var/lib/postgresql`.
