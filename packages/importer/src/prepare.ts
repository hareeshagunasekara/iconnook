import { buildSvg, sanitizeSvg } from '@iconnook/svg';

import type { SourceIcon } from './types.js';

export interface PreparedIcon {
  name: string;
  body: string;
  width: number;
  height: number;
}

export interface PrepareResult {
  icons: PreparedIcon[];
  rejected: { name: string; reason: string }[];
  /** Icons the sanitizer had to change (kept, but worth reviewing upstream). */
  modified: string[];
}

const NAME_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Path data holds only commands, numbers and separators; anything else is a broken upstream file. */
const BAD_PATH_DATA = /\sd="[^"]*[^"MmZzLlHhVvCcSsQqTtAa0-9.,eE+\s-]/;

/** Runs every icon through the sanitizer. Anything that fails is rejected, never stored (fail closed). */
export function prepareIcons(icons: readonly SourceIcon[]): PrepareResult {
  const result: PrepareResult = { icons: [], rejected: [], modified: [] };

  for (const icon of icons) {
    if (!NAME_FORMAT.test(icon.name)) {
      result.rejected.push({ name: icon.name, reason: 'name is not lowercase kebab-case' });
      continue;
    }
    let svg: string;
    try {
      svg = buildSvg(icon);
    } catch (error) {
      result.rejected.push({ name: icon.name, reason: String(error) });
      continue;
    }
    const sanitized = sanitizeSvg(svg);
    if (!sanitized.ok) {
      result.rejected.push({ name: icon.name, reason: sanitized.reason });
      continue;
    }
    if (BAD_PATH_DATA.test(sanitized.body)) {
      result.rejected.push({ name: icon.name, reason: 'malformed path data' });
      continue;
    }
    if (sanitized.removed > 0) result.modified.push(icon.name);
    result.icons.push({
      name: icon.name,
      body: sanitized.body,
      width: icon.width,
      height: icon.height,
    });
  }

  return result;
}
