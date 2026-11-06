export interface SvgIcon {
  /** Inner markup (no outer `<svg>`). */
  body: string;
  width: number;
  height: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Wraps an icon body in a standalone `<svg>` document. Callers sanitize the result before storing. */
export function buildSvg(icon: SvgIcon): string {
  const { body, width, height } = icon;
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new RangeError(`Invalid icon dimensions ${String(width)}x${String(height)}`);
  }
  const xlink = body.includes('xlink:') ? ` xmlns:xlink="${XLINK_NS}"` : '';
  return `<svg xmlns="${SVG_NS}"${xlink} viewBox="0 0 ${String(width)} ${String(height)}">${body}</svg>`;
}
