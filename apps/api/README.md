# @iconnook/api

IconNook's public REST API (Hono + `@hono/zod-openapi`). No API key required. OpenAPI 3.1: `GET /v1/openapi.json`.

```sh
docker compose up -d                       # postgres, meilisearch, valkey
pnpm --filter @iconnook/api dev            # http://localhost:8787 (reads ../../.env)
pnpm --filter @iconnook/api test           # unit tests (in-memory fakes, no Docker)
pnpm --filter @iconnook/api test:integration   # real Postgres + Meilisearch + Valkey
```

## Endpoints

| Endpoint                                                                              | What                                                                   |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /v1/search?q=&set=&type=&tier=&color=&category=&page=&limit=`                    | Typo-tolerant search with filters; returns sanitized SVG bodies + URLs |
| `GET /v1/sets?type=&tier=` · `/v1/sets/{set}` · `/v1/sets/{set}/icons?cursor=&limit=` | Sets, license, icons (cursor pagination)                               |
| `GET /v1/icons/{set}/{name}`                                                          | Icon details: body, set, license, synonyms, categories                 |
| `GET /v1/icons/{set}/{name}.svg?color=&size=&stroke=&download=1`                      | Customized SVG (sandboxing CSP)                                        |
| `GET /v1/icons/{set}/{name}.png?size=&color=&stroke=&download=1`                      | PNG (16–2048 px, default 256; stricter rate limit)                     |
| `GET /v1/icons/{set}/{name}/code?format=svg\|jsx\|vue\|svelte\|datauri\|css`          | Copy-ready code                                                        |
| `GET /v1/icons/{set}/{name}/attribution`                                              | Credit line (required for tier B/C)                                    |
| `GET /v1/categories`                                                                  | Categories with counts                                                 |
| `GET /healthz` · `GET /readyz`                                                        | Liveness (no deps) · readiness (DB, search, cache)                     |

## Behavior

- **Errors:** RFC 9457 `application/problem+json`. 400 validation (with `errors[]`), 404, 429 + `Retry-After`, 503 + `Retry-After` when search is down, 504 after 10 s; internal details never leak.
- **Caching:** `Cache-Control` per endpoint (assets cache for a year at the CDN), `ETag` + `304`. Asset URLs are canonical — non-canonical query params are 301-redirected (sorted, lowercased color, unknown params dropped).
- **Security:** CSP / nosniff / frame / referrer / permissions headers on every response; raw SVG gets `default-src 'none'; style-src 'unsafe-inline'; sandbox`. CORS `*` for GET (public, unauthenticated, no cookies). Customized SVGs are re-sanitized.
- **Rate limits:** per client (hashed IP — raw IPs never stored), 300/min general, 60/min PNG; fails open if Valkey is down.
- **Logs:** one JSON line per request (method, path, status, ms, request id) — no IPs, user agents or query strings.

## Environment

See `.env.example`. Required: `DATABASE_URL`, `MEILI_URL`, `MEILI_API_KEY` (search-only key in production), `VALKEY_URL`. Optional: `API_PORT` (8787), `PUBLIC_API_URL`, `PUBLIC_SITE_URL`, `LOG_LEVEL`, `TRUST_PROXY_HEADER` (production: `cf-connecting-ip`), `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_RENDER_PER_MINUTE`, `PNG_CONCURRENCY` (4). Invalid config → the process refuses to start.
