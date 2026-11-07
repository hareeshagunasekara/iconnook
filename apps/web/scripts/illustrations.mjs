/**
 * Builds the responsive AVIF/WebP variants of the illustrations in src/assets/illustrations
 * (sources: the *.png files there). Run after adding or changing an illustration, then commit the
 * output: images are converted once here rather than on every request in production.
 *
 *   pnpm --filter @iconnook/web illustrations
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

const DIR = new URL('../src/assets/illustrations/', import.meta.url).pathname;
const WIDTHS = [480, 800, 1280];

for (const file of (await readdir(DIR)).filter((f) => f.endsWith('.png'))) {
  const name = file.slice(0, -'.png'.length);
  for (const width of WIDTHS) {
    const image = sharp(join(DIR, file)).resize({ width, withoutEnlargement: true });
    await image
      .clone()
      .avif({ quality: 50, effort: 9 })
      .toFile(join(DIR, `${name}-${String(width)}.avif`));
    await image
      .clone()
      .webp({ quality: 82, effort: 6 })
      .toFile(join(DIR, `${name}-${String(width)}.webp`));
  }
  console.log(`${name}: ${WIDTHS.join(', ')} px`);
}
