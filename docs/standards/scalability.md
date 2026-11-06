# Scalability & High Traffic

How IconNook stays fast and up when many users arrive at once (launch day, a viral post, a popular plugin). The principle: **the cheapest request is one that never reaches our servers.**

## Traffic shape

- ~95%+ of requests are reads of identical, public content (pages, icon SVGs/PNGs, set lists) → perfect for CDN caching.
- Search is the main dynamic read; it's highly repetitive (top queries dominate) → cacheable by normalized query.
- Writes are rare (download counters, collections, later: uploads) → can be async and batched.

## Layers of defense (in order)

1. **Cloudflare edge** — caches HTML, assets, icon files and popular search responses (see performance.md for headers). Target **≥ 90% cache hit ratio**. Also provides DDoS protection, WAF, and bot management for free.
2. **Origin shield / tiered cache** — avoids many edge POPs hitting origin for the same miss.
3. **Static generation** — home, set pages and the top N icon pages are prebuilt; the long tail is rendered on demand and then cached.
4. **Application caches** — Valkey caches hot DB/search results with short TTLs; request coalescing so 1,000 simultaneous misses for the same key produce one backend query.
5. **Stateless replicas** — `web`, `api`, `worker` scale horizontally.
6. **Data tier** — Postgres sized for writes + cache misses only; search served by Meilisearch replicas.

## Scaling stages

| Stage | Load (rough) | Setup |
|---|---|---|
| 1. Launch | up to ~100k visits/day | 1 VPS, k3s single node, everything in-cluster, Cloudflare in front. 2 replicas of api/web. |
| 2. Growing | ~100k–1M/day | 3-node k3s cluster (HA control plane), HorizontalPodAutoscaler on api/web/worker, Postgres on its own node with PgBouncer + daily backups + a streaming replica, 2+ Meilisearch instances. |
| 3. Large | 1M+/day | Managed Postgres (with read replicas), more nodes or move manifests to managed Kubernetes, PNG rendering pre-generated for popular sizes, consider serving the read API from edge workers. |

Move up a stage based on **measured** saturation (CPU > 70% sustained, p95 latency over budget, cache hit ratio dropping), not on guesses.

## Component scaling notes

- **web / api:** stateless; HPA on CPU (target ~60%) and/or request rate. `minReplicas: 2` so a node or pod loss doesn't cause downtime; PodDisruptionBudget `minAvailable: 1`; spread replicas across nodes (topology spread constraints).
- **Postgres:** connection pooling via PgBouncer (apps never open hundreds of connections); read-heavy queries go to a replica; counters written in batches by the worker (Valkey `INCR` → flush every minute), never one UPDATE per download.
- **Meilisearch:** the index is derived from Postgres, so scale reads by running multiple instances each built by the importer and load-balanced behind one Service. Rebuild into a new index and swap atomically, so reindexing never hurts live search.
- **Valkey:** cache + rate limits + queue. If it fails, the app must keep serving (cache misses go to DB; rate limiting falls back to Cloudflare).
- **worker:** scale on queue depth. Jobs are idempotent and retried with exponential backoff + jitter; poison jobs go to a dead-letter queue.
- **Storage (R2):** no egress fees, effectively unlimited; generated PNGs/ZIPs are stored once and served via CDN.

## Protecting the system under overload

- **Rate limits** per IP and per API key (Valkey token bucket), stricter on expensive endpoints (PNG render, ZIP). Return `429` + `Retry-After`. Cloudflare rate limiting as an outer layer.
- **Timeouts everywhere** (DB, search, storage, outbound HTTP) — a slow dependency must not tie up all workers.
- **Bounded concurrency** for CPU-heavy work (resvg rendering, ZIP creation): fixed worker pools, queue the rest.
- **Load shedding:** when queues or in-flight requests exceed limits, reject early with `503` + `Retry-After` rather than slowing down for everyone.
- **Circuit breakers** around Meilisearch and storage: after repeated failures, fail fast for a short window.
- **Retries** only for idempotent operations, with backoff + jitter and a cap; never retry storms.
- **Graceful degradation** (keep the core working):
  - Search down → show cached popular results + browse-by-set (static pages still work).
  - PNG render overloaded → offer SVG download, queue the PNG.
  - DB down → edge-cached pages keep serving (`stale-while-revalidate`, `stale-if-error`).
- **Feature flags** to switch off expensive features (live PNG render, ZIP packs) instantly during an incident.

## Load testing (k6)

Before launch and before any major release, on staging sized like production:

| Scenario | Shape | Pass criteria |
|---|---|---|
| Baseline | steady expected peak traffic, 30 min | p95 within budgets, error rate < 0.1% |
| Spike | 0 → 10× peak in 1 min (viral post) | no errors beyond 429s, autoscaling kicks in, recovers within 5 min |
| Soak | 70% peak for 4 h | no memory growth, no connection leaks, stable latency |
| Stress | ramp until failure | know the breaking point and which component fails first; it must fail gracefully (503/429, not crashes) |
| Cache-miss | randomized long-tail icons/queries | origin capacity without CDN help |

Use a realistic traffic mix (e.g. 60% icon pages/assets, 25% search, 10% set pages, 5% downloads/PNG) and real query distributions. Record results in `docs/load-tests/` and compare against the previous run.

## SLOs & monitoring

- **SLOs:** availability 99.9% monthly for page views and asset downloads; search p95 < 200ms end-to-end; error rate < 0.1%.
- **Dashboards (Grafana):** request rate, latency p50/p95/p99, error rate per route; CDN cache hit ratio; pod CPU/memory and HPA replica counts; Postgres connections/slow queries; Meilisearch latency; queue depth; 429 counts.
- **Alerts** on SLO burn rate, cache hit ratio drop, queue backlog, disk > 80%, certificate expiry.
- Uptime checks from multiple regions on the home page, an icon page, search and an asset URL.

## Traffic-spike runbook (short)

1. Check Cloudflare: cache hit ratio, top uncached paths → add/extend cache rules for them.
2. Check HPA scaled out; if nodes are full, add a node (k3s agent join) or raise limits.
3. Flip feature flags off for expensive features if latency climbs.
4. Tighten rate limits on the hot endpoint; enable Cloudflare "Under Attack" mode if the traffic is malicious.
5. After: write a short post-incident note, add the missing cache rule / limit / alert permanently.

## Reliability basics

- Backups: Postgres daily full + WAL (point-in-time recovery), stored off-cluster; **restore tested monthly**. Search index and caches are rebuildable, not backed up.
- Zero-downtime deploys: rolling updates, readiness probes, backward-compatible migrations (expand → contract).
- Disaster recovery target: whole stack rebuildable from git + backups on a fresh VPS in < 2 hours (documented and rehearsed).
- Cost guardrails: alerts on bandwidth/compute spend; serving from cache keeps cost near-flat as traffic grows.
