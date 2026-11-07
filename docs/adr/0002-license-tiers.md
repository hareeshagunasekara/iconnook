# 0002: Icon license tiers

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Competing sites either restrict free use (Flaticon, Icons8 require attribution links or subscriptions) or aggregate icons with unclear licenses (SVG Repo). IconNook's differentiator is that every icon is free and its license is clear. Iconify's metadata gives an SPDX license per set (276 sets, ~474k icons as of 2026-11-07).

## Decision

Every icon set is assigned a tier from its license:

| Tier | Licenses                                                                 | User obligation      | Import                            |
| ---- | ------------------------------------------------------------------------ | -------------------- | --------------------------------- |
| A    | MIT, Apache-2.0, ISC, CC0-1.0, Unlicense, BSD-3-Clause, OFL-1.1, MPL-2.0 | None visible         | Phase 3 (launch)                  |
| B    | CC-BY-3.0, CC-BY-4.0                                                     | Credit author        | After launch, with attribution UI |
| C    | CC-BY-SA-3.0, CC-BY-SA-4.0                                               | Credit + share-alike | After launch, with attribution UI |
| X    | GPL-*, any NC license                                                    | -                    | Never                             |

Never imported regardless of license claims on third-party sites: Flaticon, Icons8, Freepik, Noun Project, unDraw (its license forbids building a competing library). Logo sets carry a trademark notice. A source's license must be verified at its official origin before import.

## Consequences

- Launch catalog is ~370k Tier A icons: no attribution friction for users.
- The importer enforces tiers in code (tier X rejected, license fields mandatory); `SOURCES.md` documents the mapping.
- Adding a source requires a "New icon source" issue with the official license link.
