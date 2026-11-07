import { convertParsedSVG, parseSVGContent } from '@iconify/utils';

import type { SourceIcon } from '../types.js';

/**
 * A standalone .svg file → an icon body (root attributes such as stroke/fill are kept on a
 * wrapping <g>). The XML prolog, DOCTYPE and comments outside <svg> are dropped. Returns null
 * when the file isn't a usable SVG; the sanitizer still checks everything that is returned.
 */
export function svgFileToIcon(name: string, content: string): SourceIcon | null {
  const parsed = parseSVGContent(content);
  if (!parsed) return null;
  const attribs = { ...parsed.attribs };
  // Some tools write "viewbox"; without a viewBox, fall back to the declared size ("128px" → 128).
  const size = (value: string | undefined) => (value ? Number.parseFloat(value) : Number.NaN);
  const [w, h] = [size(attribs['width']), size(attribs['height'])];
  const viewBox =
    attribs['viewBox'] ??
    attribs['viewbox'] ??
    (w > 0 && h > 0 ? `0 0 ${String(w)} ${String(h)}` : undefined);
  if (!viewBox) return null;
  delete attribs['viewbox'];
  const icon = convertParsedSVG({ ...parsed, attribs: { ...attribs, viewBox } });
  if (!icon) return null;
  const { left = 0, top = 0, width = 16, height = 16 } = icon;
  const body =
    left || top
      ? `<g transform="translate(${String(-left)} ${String(-top)})">${icon.body}</g>`
      : icon.body;
  return { name, body, width, height };
}

/**
 * File, component or emoji names → icon names in lowercase kebab-case:
 * "Snowy_2" → "snowy-2", "IceCream" → "ice-cream", "piñata" → "pinata", "keycap: #" → "keycap-number-sign".
 */
export function iconName(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/#/g, ' number sign ')
    .replace(/\*/g, ' asterisk ')
    .replace(/&/g, ' and ')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
