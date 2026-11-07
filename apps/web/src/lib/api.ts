import { API_INTERNAL_URL } from 'astro:env/server';

import type { UiIconName } from './ui-icons';

/** Response shapes of the IconNook API (see /v1/openapi.json; contract-tested in apps/api). */

export type Tier = 'A' | 'B' | 'C';

export interface License {
  spdx: string;
  tier: Tier;
  url: string | null;
  attributionRequired: boolean;
}

export interface IconSet {
  prefix: string;
  name: string;
  type: string;
  total: number;
  isColor: boolean;
  gridSize: number | null;
  version: string | null;
  author: { name: string; url: string | null } | null;
  license: License;
  /** A representative icon chosen by the set's authors (sanitized SVG body). */
  preview: { name: string; body: string; width: number; height: number } | null;
}

export interface IconSummary {
  id: number;
  set: string;
  name: string;
  width: number;
  height: number;
  body: string;
  urls: { svg: string; png: string; page: string };
  setName?: string;
  tier?: Tier;
  isColor?: boolean;
}

export interface IconDetail extends IconSummary {
  setInfo: IconSet;
  synonyms: string[];
  categories: { slug: string; label: string }[];
}

export interface SearchResult {
  query: string;
  total: number;
  page: number;
  limit: number;
  tookMs: number;
  items: IconSummary[];
}

export interface Category {
  slug: string;
  label: string;
  total: number;
}

export interface Attribution {
  required: boolean;
  shareAlike: boolean;
  plain: string;
  html: string;
  markdown: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Server-side API call with a timeout. 404 → null; anything else non-2xx → ApiError. */
export async function api<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T | null> {
  const url = new URL(path, API_INTERNAL_URL);
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    throw new ApiError(503, `API unreachable: ${String(error)}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, `API ${String(res.status)} for ${url.pathname}`);
  return (await res.json()) as T;
}

export const SET_TYPES = [
  { value: 'libraries', label: 'Big all-purpose libraries', icon: 'library-big', color: 'purple' },
  { value: 'line', label: 'Line icons', icon: 'pen-line', color: 'mustard' },
  { value: 'solid', label: 'Solid & glyph icons', icon: 'shapes', color: 'coral' },
  { value: 'material', label: 'Material & Google', icon: 'component', color: 'blue' },
  { value: 'design-systems', label: 'Company design systems', icon: 'building', color: 'green' },
  { value: 'frameworks', label: 'Framework icons', icon: 'blocks', color: 'pink' },
  { value: 'pixel', label: 'Pixel & retro', icon: 'gamepad-2', color: 'purple' },
  { value: 'animated', label: 'Animated', icon: 'loader', color: 'mustard' },
  { value: 'cute', label: 'Cute & kawaii', icon: 'cat', color: 'pink' },
  { value: 'color', label: 'Color icons', icon: 'palette', color: 'pink' },
  { value: 'developer', label: 'Developer & tech', icon: 'code-xml', color: 'green' },
  { value: 'logos', label: 'Logos & brands', icon: 'tag', color: 'blue' },
  { value: 'emoji', label: 'Emoji', icon: 'smile', color: 'purple' },
  { value: 'flags', label: 'Flags', icon: 'flag', color: 'coral' },
  { value: 'maps', label: 'Maps & location', icon: 'map-pin', color: 'mustard' },
  { value: 'themed', label: 'Themed', icon: 'layers', color: 'pink' },
  { value: 'archive', label: 'Archive', icon: 'archive', color: 'blue' },
] as const satisfies readonly { value: string; label: string; icon: UiIconName; color: string }[];

export const typeLabel = (type: string) => SET_TYPES.find((t) => t.value === type)?.label ?? type;
