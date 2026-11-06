# Contributing to IconNook

Thanks for helping! IconNook is early in development — see [docs/PLAN.md](docs/PLAN.md) for what's being built now.

## Ground rules

- Be kind — see the [Code of Conduct](CODE_OF_CONDUCT.md).
- Read the [engineering standards](docs/standards/README.md) for the area you're changing.
- **Never commit secrets.** Only `.env.example` is tracked. Pre-commit hooks and CI run gitleaks.
- **Icons must be legally clean.** Proposing a new icon source? Open a "New icon source" issue with a link to its official license. GPL and non-commercial licenses can't be accepted. Never submit icons copied from Flaticon, Icons8, Freepik, Noun Project or unDraw.

## Workflow

1. Open or pick an issue; discuss larger changes first.
2. Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
3. Commit with [Conventional Commits](https://www.conventionalcommits.org): `feat(api): add PNG endpoint`.
4. Open a PR and fill in the template checklist. CI must pass.
5. PRs are squash-merged.

## Development setup

Requirements: Node 24, Docker, and pnpm via corepack (`corepack enable pnpm`).

```sh
cp .env.example .env     # then replace the change-me values
pnpm install
docker compose up -d
pnpm db:migrate && pnpm db:seed
pnpm dev                 # web http://localhost:4321 · api http://localhost:8787
pnpm check               # what CI runs
pnpm test:integration    # database tests (needs docker compose)
```
