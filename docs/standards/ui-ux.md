# UI/UX Rules

Two frameworks guide every screen: **WCAG 2.2 AA** (must pass) and **Nielsen's 10 usability heuristics** (should follow). Accessibility is not a final pass — it's part of "done" for every component.

## Nielsen's heuristics → how they apply to an icon library

1. **Visibility of system status** — search shows result count and a loading state; copy/download actions confirm ("Copied SVG").
2. **Match the real world** — say "Download", "Copy SVG", "Color"; not "Export artifact". Search understands synonyms (trash = delete = bin).
3. **User control & freedom** — every filter is removable in one click; "Clear all"; editor has Reset; browser Back restores search + scroll position (filters live in the URL).
4. **Consistency & standards** — same icon card, same action order, same keyboard shortcuts everywhere. Follow platform conventions (links look like links).
5. **Error prevention** — invalid color input can't be applied; disabled states explain why.
6. **Recognition over recall** — show recently used colors/sizes, recent searches, and the user's collections inline.
7. **Flexibility & efficiency** — keyboard shortcuts (`/` focuses search, arrows move in grid, `Enter` opens, `c` copies) for power users; plain clicks for everyone else.
8. **Aesthetic & minimalist design** — the icons are the content; chrome stays quiet. One primary action per view.
9. **Help users recover from errors** — "No results for 'hosue'. Did you mean 'house'?" plus suggestions, never a dead end.
10. **Help & documentation** — short license explanation on every icon page; an FAQ on licensing and attribution.

## WCAG 2.2 AA checklist (the parts that bite icon sites)

**Perceivable**

- Text contrast ≥ 4.5:1 (≥ 3:1 for large text); icons, focus rings and input borders ≥ 3:1 against background (1.4.11).
- Every icon conveys a name: grid items have accessible names like "home, Tabler Icons, outline". Decorative SVGs get `aria-hidden="true"`.
- Don't rely on color alone (license tiers use text labels + color).
- Text resizes to 200% and reflows at 320 CSS px wide with no horizontal scroll (1.4.10).

**Operable**

- Everything works with keyboard only; no keyboard traps; logical tab order. Icon grid uses `role="grid"` (or a list of buttons) with **roving tabindex** and arrow-key navigation, so it's one tab stop, not thousands.
- Visible focus indicator on everything; **focus never hidden** behind sticky headers or banners (2.4.11, new in 2.2).
- **Target size ≥ 24×24 CSS px** (2.5.8, new in 2.2); we aim for 44×44 on touch.
- Anything done by dragging (e.g. reordering a collection) has a click/keyboard alternative (2.5.7, new in 2.2).
- Skip link to main content. Respect `prefers-reduced-motion` (no non-essential animation).

**Understandable**

- `lang` set on `<html>`. Labels on every input (placeholder is not a label). Errors described in text, next to the field.
- Help (FAQ / contact) in the same place on every page (3.2.6 Consistent Help, new in 2.2).
- Don't make users re-enter information they already gave in the same flow (3.3.7 Redundant Entry, new in 2.2).
- Login (if any) needs no memory/cognitive test; allow password managers and passkeys (3.3.8, new in 2.2).

**Robust**

- Semantic HTML first (`button`, `a`, `nav`, `main`, headings in order); ARIA only when HTML can't express it. Live regions (`aria-live="polite"`) announce "Copied" and result counts.

**Verify with:** axe-core in Playwright on every page template (CI-blocking), Lighthouse accessibility = 100, plus a manual keyboard pass and a screen-reader smoke test (VoiceOver / NVDA) on major UI changes.

## Design system rules

- **Design tokens** (CSS custom properties) for color, spacing, radius, type, motion — no raw hex values or magic numbers in components. **Light theme only — no dark mode** (ADR 0004). Don't add `prefers-color-scheme` styles or a theme toggle.
- **Spacing** on a 4px scale. **Type** scale with ≤ 6 sizes; body ≥ 16px; line height 1.5 for body text.
- **Visual identity** (playful, retro-modern): warm cream background, near-black text and 2px ink outlines, purple (`#552CB7`) for actions and links, and six accents (mustard, pink, coral, purple, green, blue) for tiles, pills and offset "printed paper" shadows. Tokens live in `apps/web/src/styles/global.css` (`@theme static`). Ink text on the `-soft` tints and on every accent except purple passes AA; text on purple is white. No gradients, glassmorphism or blurred drop shadows.
- **Fonts:** Bricolage Grotesque (headings) and DM Sans (body), self-hosted variable fonts (OFL, via Fontsource) with `font-display: swap`, weight axis only, Latin subsets loaded by `unicode-range`. The heading font is preloaded.
- **Decoration** (squiggles, bursts, blobs) is tiny inline SVG (`Doodle.astro`), `aria-hidden`, never over text or controls. Illustrations are transparent PNG sources turned into AVIF/WebP variants by `pnpm --filter @iconnook/web images` (committed output), served with explicit width/height; only the hero one loads eagerly.
- **States for every interactive component:** default, hover, focus-visible, active, disabled, loading, error, empty.
- **Responsive:** mobile-first; grid adapts columns to width; touch targets bigger on coarse pointers.
- **Motion:** ≤ 200ms for UI feedback; never animate layout on load; honor reduced motion.

## Icon-library-specific UX

- **Search is the homepage's main action.** Instant results as you type (debounced ~150ms), typo tolerance, filters for style / set / license tier / color-vs-mono, all reflected in the URL so results are shareable.
- **Icon card:** icon preview on a neutral background; hover/focus reveals quick actions (copy SVG, download, add to collection) — and those actions are reachable by keyboard, not hover-only.
- **Icon page:** large preview on a light and a dark background (an icon preview, not a site theme), live controls (color, size, stroke), copy-as tabs (SVG / JSX / Vue / Svelte / data URI / CSS), download SVG/PNG, license badge + attribution text (tier B/C), author link, set link, similar icons.
- **License clarity is a UX feature:** tier badge on every card in tier B/C views; plain-language explanation ("Free for commercial use. Credit required: copy this line"). Never hide license info behind a click.
- **Collections:** no sign-up required (stored locally, shareable by link). Bulk download as ZIP or SVG sprite.
- **Empty & error states** always offer a next step (suggestions, popular sets, clear filters).
- **No dark patterns:** no fake download buttons, no forced sign-up, no attribution nags beyond what the license requires, no interstitials.
- **i18n-ready:** no hard-coded UI strings in components; layout tolerates 30% longer text and RTL.
