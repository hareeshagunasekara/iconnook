import type { LicenseTier } from '@iconnook/core';

import { BLOCKED_SETS } from './approved.js';
import type { SetType, SourceSet } from './types.js';

const GROUPS: readonly [SetType, string][] = [
  ['libraries', 'Big all-purpose libraries'],
  ['line', 'Line icons'],
  ['solid', 'Solid & glyph icons'],
  ['material', 'Material & Google'],
  ['design-systems', 'Company design systems'],
  ['frameworks', 'Framework icons'],
  ['pixel', 'Pixel & retro'],
  ['animated', 'Animated'],
  ['cute', 'Cute & kawaii'],
  ['color', 'Color icons'],
  ['developer', 'Developer & tech'],
  ['logos', 'Logos & brands'],
  ['emoji', 'Emoji'],
  ['maps', 'Maps & location'],
  ['flags', 'Flags'],
  ['themed', 'Themed (games, weather, science, medical)'],
  ['illustrations', 'Illustrations'],
  ['archive', 'Archive (import last)'],
];

const TIER_ORDER: Readonly<Record<LicenseTier, number>> = { A: 0, B: 1, C: 2, X: 3 };

const REVIEWED = `## Reviewed and imported beyond Tier A

Imported by default after a one-by-one review (license checked at the source on 2026-11-07 for
CC BY and 2026-11-08 for CC BY-SA, credit wording checked; see \`packages/importer/src/approved.ts\`).
Every icon page shows a copy-ready credit, every downloaded SVG carries the credit in a comment, and
ZIP packs include a LICENSES file. For CC BY-SA sets, each of these also says that modified versions
must use the same license. Brand logos inside these sets are filed under "Brands" and carry a
trademark notice.

| Set | License | Credited as |
|---|---|---|
| \`pixel\` HackerNoon Pixel Icon Library | CC BY 4.0 | HackerNoon, linking the library |
| \`streamline-pixel\`, \`streamline-emojis\` | CC BY 4.0 | Streamline, linking streamlinehq.com (as their license asks) |
| \`twemoji\` Twemoji | CC BY 4.0 (graphics) | Twitter, Inc. and other contributors |
| \`emojione\`, \`emojione-monotone\` Emoji One 2.x | CC BY 4.0 | Ranks.com and the Emojitwo contributors, in the set "Emoji One" (as Emojitwo asks) |
| \`amcharts-weather\` amCharts Animated Weather | CC BY 4.0 | amCharts |
| \`openmoji\` OpenMoji | CC BY-SA 4.0 | OpenMoji, linking openmoji.org (as their README asks) |
| \`emojione-v1\` Emoji One 1.x | CC BY-SA 4.0 (artwork) | Emoji One |
| \`typcn\` Typicons | CC BY-SA 4.0 (artwork; the font is OFL) | Stephen Hutchings |
| \`entypo\`, \`entypo-social\` Entypo+ | CC BY-SA 4.0 | Daniel Bruce |
| \`brandico\` Brandico | CC BY-SA 3.0 (the README says "CC BY" but links BY-SA; we follow BY-SA) | Fontello |

Not imported: \`arcticons\` (CC BY-SA, but 15,000 drawings of other companies' app logos would bury
ordinary results), and \`fontelico\` and \`si-glyph\` (hidden as deprecated in Iconify).

`;

const BLOCKED = `## Never imported on purpose

These sets have permissive licenses but break our sources policy, so the importer skips them
(\`BLOCKED_SETS\` in \`packages/importer/src/approved.ts\`):

${Object.entries(BLOCKED_SETS)
  .map(([prefix, why]) => `- \`${prefix}\`: ${why}`)
  .join('\n')}

`;

const BLOCKED = `## Never imported on purpose

These sets have permissive licenses but break our sources policy, so the importer skips them
(\`BLOCKED_SETS\` in \`packages/importer/src/approved.ts\`):

${Object.entries(BLOCKED_SETS)
  .map(([prefix, why]) => `- \`${prefix}\`: ${why}`)
  .join('\n')}

`;

const EXTRA_SOURCES = `## Sources outside Iconify

| Source | Type | License | Status |
|---|---|---|---|
| [SVG Loaders](https://github.com/SamHerbert/SVG-Loaders) | Animated loaders | MIT | ✅ Imported (\`svg-loaders\`, pinned commit; white made currentColor) |
| [amCharts weather icons](https://www.amcharts.com/free-animated-svg-weather-icons/) | Animated weather | CC BY 4.0 | ✅ Imported (\`amcharts-weather\`, pinned zip SHA-256) |
| [Blobmoji](https://github.com/C1710/blobmoji) | Emoji (Google's blob style) | Apache-2.0 | ✅ Imported (\`blobmoji\`, pinned commit; not named "Noto", a Google trademark) |
| [React Kawaii](https://github.com/elizabetdev/react-kawaii) | Cute characters | MIT | ✅ Imported (\`react-kawaii\`, npm 1.6.0 rendered to SVG) |
| [Lordicon](https://lordicon.com/licenses) | Animated icons | Modified CC BY-ND | ❌ No-derivatives; terms bar icon-library use |
| [Tossface](https://github.com/toss/tossface) | Emoji | Custom | ❌ Forbids unapproved modified versions |
| [Open Peeps](https://openpeeps.com) | Illustrations (people) | CC0 | ✅ Import |
| [Open Doodles](https://www.opendoodles.com) | Illustrations | CC0 | ✅ Import |
| [Openclipart](https://openclipart.org) | Clipart | Public domain / CC0 | ✅ Import (no current bulk archive, needs per-item fetch or old 0.19 release) |
| [AIGA Symbol Signs](https://commons.wikimedia.org/wiki/Category:AIGA_symbol_signs) | Pictograms (signage) | Public domain | ✅ Import |
| [Kenney](https://kenney.nl/assets) | Game assets | CC0 | ✅ Import vector packs only |
| [Natural Earth](https://www.naturalearthdata.com) | Country/region shapes (convert to SVG) | Public domain | ✅ Import |
| [Wikimedia Commons](https://commons.wikimedia.org) | Mixed SVGs | Per file | ⚠️ Only files tagged CC0 / PD / CC-BY |
| [Humaaans](https://www.humaaans.com) | Illustrations | Unclear (sources disagree) | ⚠️ Verify before import |
| [svgl](https://github.com/pheralb/svgl) | Logos | MIT code, logos are trademarks | ⚠️ Overlaps Simple Icons; optional |
| [Unicode CLDR annotations](https://github.com/unicode-org/cldr-json) | Emoji keywords (search tags, not icons) | Unicode License | ✅ Use for search |
| [unDraw](https://undraw.co/license) | Illustrations | Custom | ❌ License forbids building a competing library / packs |
| Flaticon, Icons8, Freepik, Noun Project | Icons | Proprietary | ❌ Never import |
`;

const n = (value: number) => value.toLocaleString('en-US');
const cell = (value: string) => value.replaceAll('|', '\\|');

/** Renders SOURCES.md from the same metadata and tier rules the importer uses, so docs can't drift. */
export function renderCatalog(
  sets: readonly SourceSet[],
  meta: { iconifyVersion: string; date: string },
): string {
  const totals: Record<LicenseTier, number> = { A: 0, B: 0, C: 0, X: 0 };
  for (const s of sets) if (!(s.prefix in BLOCKED_SETS)) totals[s.licenseTier] += s.total;

  const out: string[] = [
    '# Icon Sources',
    '',
    `Catalog of open-source icon sets we can import, generated by \`pnpm icons:catalog\` from \`@iconify/json\` ${meta.iconifyVersion} ([iconify/icon-sets](https://github.com/iconify/icon-sets)) on ${meta.date}. Do not edit by hand.`,
    '',
    '## License tiers',
    '',
    '| Tier | Licenses | What users must do | Icons |',
    '|---|---|---|---|',
    `| **A** | MIT, Apache-2.0, ISC, CC0, Unlicense, BSD, OFL-1.1, MPL-2.0 | Nothing visible (we keep the license text on file) | ${n(totals.A)} |`,
    `| **B** | CC-BY 3.0/4.0 | Credit the author (we show a copy-ready credit line) | ${n(totals.B)} |`,
    `| **C** | CC-BY-SA | Credit + share edits under the same license | ${n(totals.C)} |`,
    `| **X** | GPL, non-commercial, or unreviewed | **Do not import** | ${n(totals.X)} |`,
    '',
    'Logos & Brands: the SVG license covers the drawing, not the trademark. Show a trademark notice on those pages.',
    '',
  ];

  for (const [type, title] of GROUPS) {
    const rows = sets
      .filter((s) => s.type === type && !(s.prefix in BLOCKED_SETS))
      .sort((a, b) => TIER_ORDER[a.licenseTier] - TIER_ORDER[b.licenseTier] || b.total - a.total);
    if (rows.length === 0) continue;
    out.push(
      `## ${title}: ${n(rows.length)} sets, ${n(rows.reduce((t, s) => t + s.total, 0))} icons`,
      '',
    );
    out.push(
      '| Prefix | Set | Icons | License | Tier | Color | Author |',
      '|---|---|---:|---|:-:|:-:|---|',
    );
    for (const s of rows) {
      const author = s.authorName
        ? s.authorUrl
          ? `[${cell(s.authorName)}](${s.authorUrl})`
          : cell(s.authorName)
        : '';
      out.push(
        `| \`${s.prefix}\` | ${cell(s.name)} | ${n(s.total)} | ${cell(s.licenseSpdx)} | ${s.licenseTier} | ${s.isColor ? '●' : ''} | ${author} |`,
      );
    }
    out.push('');
  }

  out.push(REVIEWED, BLOCKED, EXTRA_SOURCES);
  return out.join('\n');
}
