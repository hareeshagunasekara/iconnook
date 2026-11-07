# 0004 — Light theme only (no dark mode)

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Phase 5 shipped light and dark color tokens that followed the operating system's `prefers-color-scheme`, and the UI/UX standard asked for an override toggle. The product owner decided IconNook should not have a dark mode.

## Decision

- The website has a single light theme. No `prefers-color-scheme` styles, no theme toggle, `color-scheme: light`.
- Accessibility checks (axe, contrast) run against the light theme only.
- Not affected: the icon page's preview of the icon on a dark background (it shows how an _icon_ looks, not a site theme), and the dark social-card image (branding).

## Consequences

- Fewer tokens and tests to maintain; one set of contrast values to verify.
- Users who prefer dark interfaces get the light site. Revisit only if the product owner asks.
