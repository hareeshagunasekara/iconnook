# @iconnook/api

IconNook's public REST API (Hono). Currently: `GET /healthz`. Full routes arrive in Phase 4 (see [docs/PLAN.md](../../docs/PLAN.md)).

```sh
pnpm --filter @iconnook/api dev    # http://localhost:8787/healthz
pnpm --filter @iconnook/api test
```

## Environment

| Variable   | Default       | Notes                                                     |
| ---------- | ------------- | --------------------------------------------------------- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production`                   |
| `API_PORT` | `8787`        | Validated at startup; the process exits on invalid config |
