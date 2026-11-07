# Workflow

## Git

- `main` is always deployable and protected: no direct pushes, PR + passing CI required.
- Short-lived branches: `feat/search-filters`, `fix/svg-sanitize-href`, `chore/deps`, `docs/...`.
- **Conventional Commits:** `feat(api): add PNG endpoint`, `fix(importer): skip hidden icons`, `docs:`, `chore:`, `refactor:`, `test:`, `perf:`, `ci:`. Scope = app/package name. `!` or `BREAKING CHANGE:` for breaking changes.
- Small PRs (aim < 400 changed lines, excluding generated files). One concern per PR.
- Squash-merge; the PR title becomes the commit message.
- **Wording:** no em dashes (U+2014) in commit messages, PR titles or descriptions, or docs. No phase or step numbers in commit messages or PR titles: say what changed (`feat(worker): build ZIP packs`, not `feat: phase 6`).

## Pull requests

Description covers: what changed, why, how it was tested, screenshots for UI, and any security/accessibility/performance impact. Link the issue.

**Definition of done (every PR):**

- [ ] Typecheck, lint, format, unit + integration tests pass
- [ ] New behavior has tests; bug fixes have a regression test
- [ ] UI changes: keyboard-only pass, axe clean, works at 320px wide
- [ ] Inputs validated with Zod; no secrets; no new `any`
- [ ] Performance budgets hold (Lighthouse CI)
- [ ] New dependency? Justified in the PR (size, maintenance, license is MIT/Apache/BSD/ISC-compatible)
- [ ] New icon source? License verified and `SOURCES.md` updated
- [ ] Docs updated (`CLAUDE.md`, standards, ADR) if behavior or conventions changed

## CI pipeline (GitHub Actions)

1. Install (`pnpm install --frozen-lockfile`, cached)
2. Lint (ESLint) + format check (Prettier) + typecheck (`tsc --noEmit` per package)
3. Unit + integration tests (Vitest; Postgres/Meili/Valkey as service containers)
4. Security: `pnpm audit` / OSV scan, gitleaks, CodeQL
5. Build web + images; Trivy image scan; SBOM + provenance
6. E2E + accessibility (Playwright + axe) and Lighthouse CI against a preview build
7. On `main`: push images to GHCR tagged with the git SHA → deploy to k3s (migrations run as a Job first)

Pre-commit hooks (lefthook or husky + lint-staged): format, lint staged files, gitleaks.

## Releases & versions

- The site deploys continuously from `main`. The public API follows SemVer via its path (`/v1`); breaking changes need a new version and a deprecation period with `Deprecation`/`Sunset` headers.
- Changelog generated from Conventional Commits.
- Rollback = redeploy the previous image SHA. Migrations must be backward-compatible so rollback is safe.

## Dependencies

- Prefer the platform and existing deps before adding a new one. Check: weekly downloads, last release, open issues, license, install scripts, bundle size (for web).
- Renovate groups minor/patch updates weekly; majors get their own PR and a read of the changelog.

## Documentation

- `CLAUDE.md` — how to work in this repo (stack, layout, commands).
- `docs/standards/` — these rules. `docs/adr/` — decisions and why. `SOURCES.md` — icon sources and licenses.
- README per app/package: what it is, how to run it, env vars it needs.
