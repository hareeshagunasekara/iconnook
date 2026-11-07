import { replaceIDs } from '@iconify/utils';
import { requiresAttribution, type ImportableTier } from '@iconnook/core';
import type { PackRequest } from '@iconnook/jobs';
import { customizeSvg } from '@iconnook/svg';
import { strToU8, zipSync, type Zippable } from 'fflate';

export interface PackIcon {
  set: string;
  name: string;
  body: string;
  width: number;
  height: number;
  setName: string;
  author: string | null;
  licenseSpdx: string;
  licenseUrl: string | null;
  tier: ImportableTier;
}

export interface BuiltPack {
  bytes: Uint8Array;
  contentType: string;
}

export type RenderPng = (svg: string, width: number) => Promise<Uint8Array>;

const customization = (req: PackRequest) => ({
  ...(req.color ? { color: req.color } : {}),
  ...(req.stroke ? { strokeWidth: req.stroke } : {}),
});

/**
 * LICENSES.md — every pack carries the license of each set it contains, plus ready-made credit
 * lines where the license requires attribution (tier B/C), so downloads stay license-compliant.
 */
export function licensesMarkdown(icons: readonly PackIcon[], missing: readonly string[]): string {
  const sets = new Map<string, { icon: PackIcon; names: string[] }>();
  for (const icon of icons) {
    const entry = sets.get(icon.set) ?? { icon, names: [] };
    entry.names.push(icon.name);
    sets.set(icon.set, entry);
  }
  const lines = [
    '# Icon licenses',
    '',
    'Icons downloaded from IconNook (https://iconnook.com). Each icon keeps the license of its set.',
    '',
  ];
  for (const { icon, names } of [...sets.values()].sort((a, b) =>
    a.icon.setName.localeCompare(b.icon.setName),
  )) {
    lines.push(`## ${icon.setName} (${icon.set})`, '');
    lines.push(`- License: ${icon.licenseSpdx}${icon.licenseUrl ? ` (${icon.licenseUrl})` : ''}`);
    if (icon.author) lines.push(`- Author: ${icon.author}`);
    lines.push(`- Icons in this pack: ${String(names.length)}`);
    if (requiresAttribution(icon.tier)) {
      lines.push(
        '- **Attribution required.** Include this credit where you use the icons:',
        '',
        `  > Icons from ${icon.setName}${icon.author ? ` by ${icon.author}` : ''}, licensed under ${icon.licenseSpdx}${icon.licenseUrl ? ` (${icon.licenseUrl})` : ''}.`,
      );
      if (icon.tier === 'C')
        lines.push('', '  Modified versions must be shared under the same license.');
    } else {
      lines.push('- No attribution required (a credit is always appreciated).');
    }
    lines.push('');
  }
  if (missing.length > 0) {
    lines.push(
      '## Not included',
      '',
      'These icons no longer exist on IconNook:',
      '',
      ...missing.map((m) => `- ${m}`),
      '',
    );
  }
  return lines.join('\n');
}

/** ZIP with svg/<set>/<name>.svg (+ png/… when requested) and LICENSES.md. */
export async function buildZip(
  icons: readonly PackIcon[],
  missing: readonly string[],
  req: PackRequest,
  renderPng: RenderPng,
  onProgress: (fraction: number) => Promise<void> = () => Promise.resolve(),
): Promise<BuiltPack> {
  const files: Zippable = { 'LICENSES.md': strToU8(licensesMarkdown(icons, missing)) };
  for (const [i, icon] of icons.entries()) {
    const svg = customizeSvg(icon, customization(req));
    files[`svg/${icon.set}/${icon.name}.svg`] = strToU8(svg);
    if (req.png) {
      const width =
        icon.width >= icon.height
          ? req.png
          : Math.max(1, Math.round((req.png * icon.width) / icon.height));
      // PNGs are already compressed: store them as-is.
      files[`png/${icon.set}/${icon.name}.png`] = [await renderPng(svg, width), { level: 0 }];
    }
    if (i % 25 === 0) await onProgress(i / icons.length);
  }
  return { bytes: zipSync(files, { level: 6 }), contentType: 'application/zip' };
}

/**
 * One SVG file of <symbol>s: <svg><use href="sprite.svg#tabler-home"/></svg>. Ids inside each icon
 * are made unique so gradients/masks of different icons can't collide. Each symbol is re-sanitized.
 */
export function buildSprite(icons: readonly PackIcon[], req: PackRequest): BuiltPack {
  const symbols = icons.map((icon) => {
    const xml = customizeSvg({ ...icon, body: replaceIDs(icon.body) }, customization(req));
    const viewBox =
      /viewBox="([^"]+)"/.exec(xml)?.[1] ?? `0 0 ${String(icon.width)} ${String(icon.height)}`;
    const inner = xml.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    return `<symbol id="${icon.set}-${icon.name}" viewBox="${viewBox}">${inner}</symbol>`;
  });
  const sprite =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:none">\n` +
    `<!-- IconNook sprite: ${String(icons.length)} icons. Licenses: see each icon's page on https://iconnook.com -->\n` +
    `${symbols.join('\n')}\n</svg>\n`;
  return { bytes: strToU8(sprite), contentType: 'image/svg+xml' };
}
