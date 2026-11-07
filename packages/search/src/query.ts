import type { Meilisearch } from 'meilisearch';

import { buildFilter, SEARCH_INDEX, type SearchDocument, type SearchFilters } from './document.js';

export interface SearchQuery extends SearchFilters {
  q: string;
  page: number;
  limit: number;
}

export interface SearchHits {
  ids: number[];
  total: number;
  processingTimeMs: number;
}

export async function searchIcons(
  meili: Meilisearch,
  query: SearchQuery,
  index = SEARCH_INDEX,
): Promise<SearchHits> {
  const result = await meili.index<SearchDocument>(index).search(query.q, {
    filter: buildFilter(query),
    hitsPerPage: query.limit,
    page: query.page,
    attributesToRetrieve: ['id'],
  });
  return {
    ids: result.hits.map((h) => h.id),
    total: result.totalHits,
    processingTimeMs: result.processingTimeMs,
  };
}
