import { API_INTERNAL_URL } from 'astro:env/server';

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
  /** A few icons that show what the category is about. */
  preview: { set: string; name: string }[];
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

export { SET_TYPES, typeLabel } from './kinds';
