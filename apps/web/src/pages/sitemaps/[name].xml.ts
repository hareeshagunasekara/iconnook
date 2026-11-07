import type { APIRoute } from 'astro';

import { api, type Category, type IconSet, type IconSummary } from '../../lib/api';
import { urlset, xmlResponse } from '../../lib/sitemap';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const GET: APIRoute = async ({ params, site }) => {
  const name = params.name ?? '';
  const url = (path: string) => new URL(path, site).toString();

  if (name === 'pages') {
    const [sets, categories] = await Promise.all([
      api<IconSet[]>('/v1/sets'),
      api<Category[]>('/v1/categories'),
    ]);
    return xmlResponse(
      urlset([
        url('/'),
        url('/sets'),
        url('/categories'),
        url('/licenses'),
        url('/about'),
        ...(sets ?? []).map((s) => url(`/sets/${s.prefix}`)),
        ...(categories ?? []).map((c) => url(`/categories/${c.slug}`)),
      ]),
    );
  }

  if (!SLUG.test(name)) return new Response('Not found', { status: 404 });
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await api<{ items: IconSummary[]; nextCursor: string | null }>(
      `/v1/sets/${name}/icons`,
      {
        limit: 500,
        cursor,
      },
    );
    if (!page) return new Response('Not found', { status: 404 });
    urls.push(...page.items.map((i) => url(`/icons/${i.set}/${i.name}`)));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return xmlResponse(urlset(urls));
};
