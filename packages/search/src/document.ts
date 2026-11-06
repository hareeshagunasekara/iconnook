/** The search index contract: the importer writes these documents, the API queries them. */

export const SEARCH_INDEX = 'icons';

export interface SearchDocument {
  id: number;
  name: string;
  /** Name with spaces, so "arrow-left" matches "arrow left". */
  label: string;
  set: string;
  setName: string;
  tier: string;
  type: string;
  color: boolean;
  /** Synonyms (from upstream aliases), human-readable. */
  tags: string[];
  /** Category labels (searchable). */
  categories: string[];
  /** Category slugs (filterable; slugs are validated, labels are free text). */
  categorySlugs: string[];
}

export const SEARCH_SETTINGS = {
  searchableAttributes: ['label', 'tags', 'categories', 'setName'],
  filterableAttributes: ['set', 'tier', 'type', 'color', 'categorySlugs'],
  displayedAttributes: ['id', 'name', 'set', 'setName', 'tier', 'type', 'color'],
  pagination: { maxTotalHits: 5_000 },
  // Icon names are short: allow one typo from 4 letters ("trsh" → trash), two from 8.
  typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
};

export interface SearchFilters {
  set?: string | undefined;
  type?: string | undefined;
  tier?: string | undefined;
  color?: boolean | undefined;
  category?: string | undefined;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TIER = /^[ABC]$/;

/**
 * Builds a Meilisearch filter. Values are re-validated here (defense in depth: callers validate too),
 * so user input can never inject filter syntax.
 */
export function buildFilter(filters: SearchFilters): string[] {
  const out: string[] = [];
  const slug = (field: string, value: string | undefined) => {
    if (value === undefined) return;
    if (!SLUG.test(value)) throw new RangeError(`Invalid ${field} filter "${value}"`);
    out.push(`${field} = "${value}"`);
  };
  slug('set', filters.set);
  slug('type', filters.type);
  slug('categorySlugs', filters.category);
  if (filters.tier !== undefined) {
    if (!TIER.test(filters.tier)) throw new RangeError(`Invalid tier filter "${filters.tier}"`);
    out.push(`tier = "${filters.tier}"`);
  }
  if (filters.color !== undefined) out.push(`color = ${String(filters.color)}`);
  return out;
}
