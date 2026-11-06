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

Coming in Phase 1–2 (Node 24, pnpm, Docker). This section will list the exact commands.
