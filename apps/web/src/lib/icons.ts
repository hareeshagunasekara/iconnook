import { replaceIDs } from '@iconify/utils';

/**
 * Inline SVG for an icon whose body was sanitized at import time (packages/svg). Many icons share a
 * page, so internal ids (gradients, masks) are made unique to stop icons from stealing each other's
 * defs. Decorative: the surrounding link/heading carries the accessible name.
 */
export function inlineSvg(
  icon: { body: string; width: number; height: number },
  className = '',
): string {
  const body = replaceIDs(icon.body);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(icon.width)} ${String(icon.height)}" aria-hidden="true" focusable="false" class="${className}">${body}</svg>`;
}

/** Canonical asset URL (sorted params) so the CDN caches one copy per variant and no 301 is needed. */
export function assetUrl(
  apiUrl: string,
  set: string,
  name: string,
  ext: 'svg' | 'png',
  params: { color?: string; size?: number; stroke?: number; download?: boolean } = {},
): string {
  const q = new URLSearchParams();
  if (params.color)
    q.set(
      'color',
      params.color.toLowerCase() === 'currentcolor' ? 'currentColor' : params.color.toLowerCase(),
    );
  if (params.download) q.set('download', '1');
  if (params.size) q.set('size', String(params.size));
  if (params.stroke) q.set('stroke', String(params.stroke));
  const query = q.toString();
  return `${apiUrl}/v1/icons/${set}/${name}.${ext}${query ? `?${query}` : ''}`;
}

export const label = (name: string) => name.replaceAll('-', ' ');
