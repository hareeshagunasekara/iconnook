/**
 * Builds the site's web fonts: Bricolage Grotesque (headings) and DM Sans (text), both OFL-1.1,
 * from the Fontsource variable fonts. Run after upgrading either package, then commit the output.
 *
 *   pnpm --filter @iconnook/web fonts
 *
 * Each font is split the way Google Fonts does it, and narrowed to the weights we use:
 * - core: the characters the interface uses (basic Latin and common punctuation), small enough to
 *   load fast on slow phones;
 * - latin, latin-ext: everything else (accents in author names, symbols), downloaded only when a
 *   page contains such a character (unicode-range in global.css).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import subsetFont from 'subset-font';

const require = createRequire(import.meta.url);
const OUT = new URL('../src/assets/fonts/', import.meta.url).pathname;

/** Characters in the core subset (keep in sync with CORE_RANGE in global.css). */
const CORE_TEXT =
  Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCodePoint(0x20 + i)).join('') +
  ' ©·×–‘’“”•…←↑→↗';

/** Fontsource's unicode-range for its latin and latin-ext files, as text to subset to. */
function rangeText(ranges) {
  let text = '';
  for (const range of ranges) {
    const [start, end = start] = range
      .replace('U+', '')
      .split('-')
      .map((h) => parseInt(h, 16));
    for (let cp = start; cp <= end; cp++) text += String.fromCodePoint(cp);
  }
  return text;
}
const LATIN = rangeText(
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'.split(
    ',',
  ),
);
const LATIN_EXT = rangeText(
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'.split(
    ',',
  ),
);

const FONTS = [
  {
    name: 'bricolage',
    pkg: '@fontsource-variable/bricolage-grotesque',
    file: 'bricolage-grotesque',
    wght: [600, 800],
  },
  { name: 'dm-sans', pkg: '@fontsource-variable/dm-sans', file: 'dm-sans', wght: [400, 700] },
];

await mkdir(OUT, { recursive: true });
for (const font of FONTS) {
  const dir = join(dirname(require.resolve(`${font.pkg}/package.json`)), 'files');
  const latin = await readFile(join(dir, `${font.file}-latin-wght-normal.woff2`));
  const latinExt = await readFile(join(dir, `${font.file}-latin-ext-wght-normal.woff2`));
  const axes = { wght: { min: font.wght[0], max: font.wght[1] } };
  const outputs = [
    ['core', latin, CORE_TEXT],
    ['latin', latin, LATIN],
    ['latin-ext', latinExt, LATIN_EXT],
  ];
  for (const [part, source, text] of outputs) {
    const subset = await subsetFont(source, text, { targetFormat: 'woff2', variationAxes: axes });
    await writeFile(join(OUT, `${font.name}-${part}.woff2`), subset);
    console.log(`${font.name}-${part}.woff2: ${String(Math.round(subset.length / 1024))} KB`);
  }
}
