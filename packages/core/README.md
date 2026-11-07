# @iconnook/core

Shared domain logic used by the API, importer and web app. Pure functions only: no I/O.

- `licenseTier(spdx)`: maps an SPDX license id to tier A/B/C/X ([ADR 0002](../../docs/adr/0002-license-tiers.md)). Unknown licenses are tier X.
- `isImportable(tier)`, `requiresAttribution(tier)`

```sh
pnpm --filter @iconnook/core test
```
