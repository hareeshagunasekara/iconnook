import type { ImportableTier } from '@iconnook/core';
import type { FeatureFlag, PackRequest } from '@iconnook/jobs';
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
  /** A real icon from the set (the first of its authors' sample icons) for cards; null if none. */
  preview: SetPreview | null;
}

export interface SetPreview {
  name: string;
  /** Sanitized inner SVG markup. */
  body: string;
  width: number;
  height: number;
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
  /** Icons by "set:name", in request order; unknown refs are skipped. */
  getIconsByRefs(refs: readonly string[]): Promise<IconListItem[]>;
  iconExists(id: number): Promise<boolean>;
  createCollection(collection: {
    id: string;
    name: string | null;
    iconIds: readonly number[];
  }): Promise<void>;
  getCollection(id: string): Promise<Collection | null>;
  ping(): Promise<void>;
}

export interface Collection {
  id: string;
  name: string | null;
  createdAt: string;
  icons: IconListItem[];
}

export type PackState = 'queued' | 'active' | 'completed' | 'failed';

export interface PackStatus {
  id: string;
  state: PackState;
  /** 0–100 */
  progress: number;
  format: 'zip' | 'sprite';
  error?: string;
}

/** Background pack builds (BullMQ in production). */
export interface PackQueue {
  /** Enqueues the pack, or returns the existing job for this id (content-addressed). */
  enqueue(id: string, request: PackRequest): Promise<PackStatus>;
  /** Discards a finished job whose file is gone and builds the pack again. */
  rebuild(id: string, request: PackRequest): Promise<PackStatus>;
  status(id: string): Promise<PackStatus | null>;
}

export interface FileStore {
  /** Streams a stored file; null if it doesn't exist (e.g. a pack past retention). */
  get(key: string): Promise<Response | null>;
  exists(key: string): Promise<boolean>;
}

export interface FeatureFlags {
  isEnabled(flag: FeatureFlag): Promise<boolean>;
}

export interface DownloadCounter {
  record(iconId: number): Promise<void>;
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
  packs: PackQueue;
  files: FileStore;
  flags: FeatureFlags;
  downloads: DownloadCounter;
}
