import type { ImportableTier } from '@iconnook/core';
import type { SearchHits, SearchQuery } from '@iconnook/search';

/** Domain types and the ports (interfaces) the services depend on. Adapters implement them. */

export interface LicenseInfo {
  spdx: string;
  tier: ImportableTier;
  url: string | null;
  attributionRequired: boolean;
}

export interface SetSummary {
  prefix: string;
  name: string;
  type: string;
  total: number;
  isColor: boolean;
  gridSize: number | null;
  version: string | null;
  author: { name: string; url: string | null } | null;
  license: LicenseInfo;
}

export interface IconRecord {
  id: number;
  set: string;
  name: string;
  /** Sanitized inner SVG markup. */
  body: string;
  width: number;
  height: number;
}

export interface IconListItem extends IconRecord {
  setName: string;
  tier: ImportableTier;
  isColor: boolean;
}

export interface IconDetail extends IconRecord {
  setInfo: SetSummary;
  synonyms: string[];
  categories: { slug: string; label: string }[];
}

export interface CategorySummary {
  slug: string;
  label: string;
  total: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface IconRepository {
  getIcon(set: string, name: string): Promise<IconDetail | null>;
  /** Returns icons in the same order as `ids`; unknown ids are skipped. */
  getIconsByIds(ids: readonly number[]): Promise<IconListItem[]>;
  listSets(filter: { type?: string; tier?: string }): Promise<SetSummary[]>;
  getSet(prefix: string): Promise<SetSummary | null>;
  /** Icons of a set ordered by name; `cursor` is the last name of the previous page. */
  listSetIcons(prefix: string, page: { cursor?: string; limit: number }): Promise<Page<IconRecord>>;
  listCategories(): Promise<CategorySummary[]>;
  ping(): Promise<void>;
}

export interface IconSearch {
  search(query: SearchQuery): Promise<SearchHits>;
  ping(): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  ping(): Promise<void>;
}

export interface PngRenderer {
  render(svg: string, width: number): Promise<Buffer>;
}

export interface Dependencies {
  icons: IconRepository;
  search: IconSearch;
  rateLimiter: RateLimiter;
  png: PngRenderer;
}
