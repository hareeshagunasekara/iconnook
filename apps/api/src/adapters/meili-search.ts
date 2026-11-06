import { searchIcons, SEARCH_INDEX, type SearchHits, type SearchQuery } from '@iconnook/search';
import type { Meilisearch } from 'meilisearch';

import type { IconSearch } from '../domain.js';

export class MeiliIconSearch implements IconSearch {
  constructor(
    private readonly meili: Meilisearch,
    private readonly index = SEARCH_INDEX,
  ) {}

  search(query: SearchQuery): Promise<SearchHits> {
    return searchIcons(this.meili, query, this.index);
  }

  async ping(): Promise<void> {
    // Throws if Meilisearch is unreachable or unhealthy.
    await this.meili.health();
  }
}
