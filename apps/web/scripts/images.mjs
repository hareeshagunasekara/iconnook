/**
 * Builds the web versions of our image assets. Run after adding or changing a source PNG, then
 * commit the output: images are converted once here rather than on every request in production.
 *
 *   pnpm --filter @iconnook/web images
 *
 * - src/assets/illustrations/<name>.png → <name>-<width>.{avif,webp} for <Illustration>
 * - src/assets/brand/iconnook-logo.png  → iconnook-logo-<size>.{avif,webp} for <Logo>, plus the
 *   favicon and Apple touch icon in public/
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

const ASSETS = new URL('../src/assets/', import.meta.url).pathname;
const PUBLIC = new URL('../public/', import.meta.url).pathname;

async function variants(source, outBase, widths) {
  for (const width of widths) {
    const image = sharp(source).resize({ width, withoutEnlargement: true });
    await image
      .clone()
      .avif({ quality: 50, effort: 9 })
      .toFile(`${outBase}-${String(width)}.avif`);
    await image
      .clone()
      .webp({ quality: 82, effort: 6 })
      .toFile(`${outBase}-${String(width)}.webp`);
  }
}

const illustrations = join(ASSETS, 'illustrations');
for (const file of (await readdir(illustrations)).filter((f) => f.endsWith('.png'))) {
  const name = file.slice(0, -'.png'.length);
  await variants(join(illustrations, file), join(illustrations, name), [480, 720, 960, 1280]);
  console.log(`illustration ${name}`);
}

// Logo: shown at 40–64 CSS px, so 64/128/192 cover 1×–3× screens.
const logo = join(ASSETS, 'brand', 'iconnook-logo.png');
await variants(logo, join(ASSETS, 'brand', 'iconnook-logo'), [64, 128, 192]);
await sharp(logo).resize(64).png({ palette: true }).toFile(join(PUBLIC, 'favicon.png'));
// iOS fills transparency with black and rounds the corners itself: give it a solid square.
await sharp(logo)
  .resize(180)
  .flatten({ background: '#5702c5' })
  .png()
  .toFile(join(PUBLIC, 'apple-touch-icon.png'));
console.log('logo, favicon.png, apple-touch-icon.png');
