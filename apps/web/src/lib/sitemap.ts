const escapeXml = (s: string) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );

export function urlset(urls: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
}

export function sitemapIndex(urls: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <sitemap><loc>${escapeXml(u)}</loc></sitemap>`)
    .join('\n')}\n</sitemapindex>\n`;
}

export const xmlResponse = (body: string) =>
  new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
