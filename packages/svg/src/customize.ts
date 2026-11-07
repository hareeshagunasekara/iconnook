import { buildSvg, type SvgIcon } from './build.js';
import { sanitizeSvg } from './sanitize.js';

export interface Customization {
  /** `#rgb`, `#rrggbb`, `#rrggbbaa` or `currentColor`. Applies to icons drawn with currentColor. */
  color?: string;
  /** Rendered size in px for the longer side (viewBox is kept, so it scales cleanly). */
  size?: number;
  /** Replaces every stroke-width (stroke-based icons only). */
  strokeWidth?: number;
}

export const COLOR_PATTERN =
  /^(#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|currentColor)$/i;
export const SIZE_RANGE = { min: 8, max: 2048 } as const;
export const STROKE_RANGE = { min: 0.25, max: 4 } as const;

const round = (n: number) => Math.round(n * 1000) / 1000;

function validate(c: Customization): void {
  if (c.color !== undefined && !COLOR_PATTERN.test(c.color)) {
    throw new RangeError(`Invalid color "${c.color}"`);
  }
  if (
    c.size !== undefined &&
    !(Number.isFinite(c.size) && c.size >= SIZE_RANGE.min && c.size <= SIZE_RANGE.max)
  ) {
    throw new RangeError(
      `size must be between ${String(SIZE_RANGE.min)} and ${String(SIZE_RANGE.max)}`,
    );
  }
  if (
    c.strokeWidth !== undefined &&
    !(
      Number.isFinite(c.strokeWidth) &&
      c.strokeWidth >= STROKE_RANGE.min &&
      c.strokeWidth <= STROKE_RANGE.max
    )
  ) {
    throw new RangeError(
      `strokeWidth must be between ${String(STROKE_RANGE.min)} and ${String(STROKE_RANGE.max)}`,
    );
  }
}

/**
 * Returns a standalone, customized SVG document. Values are validated first and the result is
 * sanitized again (docs/standards/security.md: never trust modified output without re-sanitizing).
 */
export function customizeSvg(icon: SvgIcon, c: Customization = {}): string {
  validate(c);
  let body = icon.body;
  if (c.strokeWidth !== undefined) {
    body = body.replace(/stroke-width="[^"]*"/g, `stroke-width="${String(c.strokeWidth)}"`);
  }
  let svg = buildSvg({ ...icon, body });

  const attrs: string[] = [];
  if (c.size !== undefined) {
    const landscape = icon.width >= icon.height;
    const width = landscape ? c.size : (c.size * icon.width) / icon.height;
    const height = landscape ? (c.size * icon.height) / icon.width : c.size;
    attrs.push(`width="${String(round(width))}"`, `height="${String(round(height))}"`);
  }
  if (c.color !== undefined) attrs.push(`color="${c.color}"`);
  if (attrs.length > 0) svg = svg.replace(/^<svg /, `<svg ${attrs.join(' ')} `);

  const result = sanitizeSvg(svg);
  if (!result.ok) throw new Error(`Customized SVG failed sanitization: ${result.reason}`);
  return result.xml;
}
