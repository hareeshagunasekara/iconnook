---
name: tailwind-4-docs
description: Tailwind CSS v4 gotchas and engineering playbook. Use when writing, reviewing or refactoring Tailwind v4 styles, configuring Tailwind v4 (@theme, @import "tailwindcss", @tailwindcss/vite), or checking v3→v4 differences.
---

# Tailwind 4 Docs

> Modified for IconNook from `lombiq/tailwind-agent-skills@tailwind-4-docs`: the docs-snapshot sync script was removed because tailwindcss.com docs are source-available, not open-source, and must not be redistributed in this public repo. Use the official online docs instead.

## Quick start

1. Identify the topic (utility, variant, config, migration, implementation, refactor, review).
2. For implementation, refactor, or review tasks, load `references/engineering-playbook.md`.
3. For configuration or v3→v4 questions, scan `references/gotchas.md`.
4. When exact utility names, variants or config syntax matter, check the official docs at https://tailwindcss.com/docs (fetch the specific page) rather than relying on memory.
5. Apply guidance and call out any breaking changes or constraints.

## IconNook conventions

- Tailwind v4 via `@tailwindcss/vite` in `apps/web/astro.config.mjs`; CSS entry `apps/web/src/styles/global.css` with `@import 'tailwindcss'`.
- Design tokens live in `@theme` (and dark-mode overrides on `:root`); components use tokens, never raw hex values (docs/standards/ui-ux.md).

## References map

- `references/engineering-playbook.md` — implementation, refactor and review guide.
- `references/gotchas.md` — common v4 migration pitfalls.

## Migration checklist

When upgrading from v3 to v4, confirm in the official docs:

- Browser support and compatibility expectations.
- Tooling changes: `@tailwindcss/postcss`, `@tailwindcss/cli`, `@tailwindcss/vite`.
- Import syntax: `@import "tailwindcss"` replaces `@tailwind` directives.
- Utility renames/removals, prefix format, and important modifier placement.
- Changes to variants, transforms, and arbitrary value syntax.
