import type { APIRoute } from 'astro';

import { api, type IconSet } from '../lib/api';
import { sitemapIndex, xmlResponse } from '../lib/sitemap';

/** Sitemap index: one static sitemap plus one per icon set (each well under the 50,000-URL limit). */
export const GET: APIRoute = async ({ site }) => {
  const sets = (await api<IconSet[]>('/v1/sets')) ?? [];
  const url = (path: string) => new URL(path, site).toString();
  return xmlResponse(
    sitemapIndex([
      url('/sitemaps/pages.xml'),
      ...sets.map((s) => url(`/sitemaps/${s.prefix}.xml`)),
    ]),
  );
};
