# @iconnook/worker

Background jobs on BullMQ (Valkey). Stateless — run as many replicas as you like.

```sh
pnpm --filter @iconnook/worker dev                 # needs docker compose (Postgres, Valkey, SeaweedFS)
pnpm --filter @iconnook/worker test                # unit
pnpm --filter @iconnook/worker test:integration    # real Postgres + Valkey (db 15) + S3
pnpm --filter @iconnook/worker flags               # show feature flags
pnpm --filter @iconnook/worker flags set packs off # switch packs off everywhere (~5 s)
```

## Jobs

| Queue         | Job               | What                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packs`       | `pack`            | ZIP (`svg/<set>/<name>.svg`, optional `png/…`, `LICENSES.md` with every set's license and required credit lines) or SVG sprite (`<symbol id="set-name">`, ids made unique). Stored at `packs/<id>.zip` or `.svg`; the id is a hash of the request, so identical requests share one file. 3 attempts, exponential backoff; failed jobs stay in the failed set (dead-letter) for 1 day. |
| `maintenance` | `flush-downloads` | Every 60 s: moves download counts from Valkey to Postgres **exactly once** (atomic RENAME to a batch; batch id recorded in `download_flushes` in the same transaction as the counts).                                                                                                                                                                                                 |
| `maintenance` | `cleanup`         | Daily 03:17 UTC: deletes packs older than 7 days and month-old flush records.                                                                                                                                                                                                                                                                                                         |

**Crash safety:** a killed worker stops renewing its job lock; after `lockDuration` (30 s) BullMQ's stalled check gives the job to another worker. Output keys are content-addressed, so a rebuild from scratch is always safe. Verified with a real `kill -9` mid-pack (see PR).

**Health:** `GET :8788/healthz` → 200 while both processors run (Kubernetes liveness probe).

## Environment

`DATABASE_URL`, `VALKEY_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; optional `WORKER_CONCURRENCY` (2), `DOWNLOADS_FLUSH_EVERY_MS` (60000), `WORKER_HEALTH_PORT` (8788), `LOG_LEVEL`.
