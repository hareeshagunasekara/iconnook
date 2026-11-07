import { createRoute, type OpenAPIHono, type z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { ZodError } from 'zod';

import type { IconRecord, Dependencies } from '../domain.js';
import { setCache, SVG_CSP } from '../http/middleware.js';
import { badRequest, notFound, unavailable } from '../http/problem.js';
import type { IconService } from '../services/icon-service.js';
import {
  AttributionResult,
  Category,
  CodeQuery,
  CodeResult,
  IconDetail,
  IconParams,
  IconSet,
  PNG_SIZE,
  PngQuery,
  problemResponses,
  SearchQuery,
  SearchResult,
  SetIconsPage,
  SetIconsQuery,
  SetListQuery,
  SetParams,
  SvgQuery,
} from './schemas.js';

export interface RouteContext {
  deps: Dependencies;
  service: IconService;
  apiUrl: string;
  siteUrl: string;
  /** Counts a PNG render against the stricter limit; returns a 429 response or null. */
  checkRenderLimit: (c: Context) => Promise<Response | null>;
}

export const toIssues = (error: ZodError) =>
  error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));

const json = <T extends z.ZodType>(schema: T, description: string) =>
  ({ content: { 'application/json': { schema } }, description }) as const;

/**
 * Asset URLs must be canonical so the CDN caches one copy per variant: params sorted, normalized,
 * unknown ones dropped. Anything else is 301-redirected to the canonical form.
 */
function canonicalRedirect(
  c: Context,
  params: Record<string, string | number | undefined>,
): Response | null {
  const url = new URL(c.req.url);
  const canonical = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value !== undefined) canonical.set(key, String(value));
  }
  const wanted = canonical.toString();
  if (wanted === url.searchParams.toString()) return null;
  return c.redirect(`${url.pathname}${wanted ? `?${wanted}` : ''}`, 301);
}

export function registerV1(app: OpenAPIHono, ctx: RouteContext): void {
  const { deps, service, apiUrl, siteUrl } = ctx;
  const urls = (icon: Pick<IconRecord, 'set' | 'name'>) => ({
    svg: `${apiUrl}/v1/icons/${icon.set}/${icon.name}.svg`,
    png: `${apiUrl}/v1/icons/${icon.set}/${icon.name}.png`,
    page: `${siteUrl}/icons/${icon.set}/${icon.name}`,
  });
  const summary = (icon: IconRecord) => ({
    id: icon.id,
    set: icon.set,
    name: icon.name,
    width: icon.width,
    height: icon.height,
    body: icon.body,
    urls: urls(icon),
  });

  // ---- Asset routes (.svg / .png). Plain Hono routes because OpenAPI paths can't express the file
  // extension; validated with the same Zod schemas and documented in the OpenAPI registry below.
  const SET = ':set{[a-z0-9-]+}';
  const assetName = (c: Context, ext: string) => {
    const parsed = IconParams.safeParse({
      set: c.req.param('set'),
      name: c.req.param('file')?.slice(0, -ext.length),
    });
    if (!parsed.success) throw notFound('No such icon');
    return parsed.data;
  };

  app.get(`/v1/icons/${SET}/:file{[a-z0-9-]+\\.svg}`, async (c) => {
    const { set, name } = assetName(c, '.svg');
    const query = SvgQuery.safeParse(c.req.query());
    if (!query.success) throw badRequest('Invalid SVG parameters', toIssues(query.error));
    const { color, size, stroke, download } = query.data;
    const redirect = canonicalRedirect(c, { color, size, stroke, download });
    if (redirect) return redirect;

    const svg = await service.svg(set, name, {
      ...(color ? { color } : {}),
      ...(size ? { size } : {}),
      ...(stroke ? { strokeWidth: stroke } : {}),
    });
    setCache(c, 'asset');
    c.header('Content-Security-Policy', SVG_CSP);
    if (download) c.header('Content-Disposition', `attachment; filename="${set}-${name}.svg"`);
    return c.body(svg, 200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
  });

  app.get(`/v1/icons/${SET}/:file{[a-z0-9-]+\\.png}`, async (c) => {
    const { set, name } = assetName(c, '.png');
    const query = PngQuery.safeParse(c.req.query());
    if (!query.success) throw badRequest('Invalid PNG parameters', toIssues(query.error));
    const { color, size, stroke, download } = query.data;
    const redirect = canonicalRedirect(c, { color, size, stroke, download });
    if (redirect) return redirect;
    // Only real renders count against the render limit (not the redirect hop).
    if (!(await deps.flags.isEnabled('png')))
      throw unavailable('PNG rendering is temporarily disabled');
    const limited = await ctx.checkRenderLimit(c);
    if (limited) return limited;

    const png = await service.png(set, name, {
      size: size ?? PNG_SIZE.default,
      ...(color ? { color } : {}),
      ...(stroke ? { strokeWidth: stroke } : {}),
    });
    setCache(c, 'asset');
    if (download) c.header('Content-Disposition', `attachment; filename="${set}-${name}.png"`);
    return c.body(new Uint8Array(png), 200, { 'Content-Type': 'image/png' });
  });

  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/v1/icons/{set}/{name}.svg',
    summary: 'Icon as SVG (optionally recolored / resized / restroked)',
    tags: ['Assets'],
    request: { params: IconParams, query: SvgQuery },
    responses: {
      200: {
        content: { 'image/svg+xml': { schema: { type: 'string' } } },
        description: 'SVG document',
      },
      301: { description: 'Redirect to the canonical URL for these parameters' },
      ...problemResponses,
    },
  });
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/v1/icons/{set}/{name}.png',
    summary: 'Icon rendered as PNG',
    tags: ['Assets'],
    request: { params: IconParams, query: PngQuery },
    responses: {
      200: {
        content: { 'image/png': { schema: { type: 'string', format: 'binary' } } },
        description: 'PNG image',
      },
      301: { description: 'Redirect to the canonical URL for these parameters' },
      ...problemResponses,
    },
  });

  // ---- JSON routes ----

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/search',
      tags: ['Search'],
      summary: 'Search icons (typo-tolerant, with filters)',
      request: { query: SearchQuery },
      responses: {
        200: json(SearchResult, 'Matching icons'),
        400: problemResponses[400],
        429: problemResponses[429],
      },
    }),
    async (c) => {
      const q = c.req.valid('query');
      const result = await service.search(q);
      setCache(c, 'search');
      return c.json(
        {
          query: q.q,
          total: result.total,
          page: q.page,
          limit: q.limit,
          tookMs: result.tookMs,
          items: result.items.map((i) => ({
            ...summary(i),
            setName: i.setName,
            tier: i.tier,
            isColor: i.isColor,
          })),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/sets',
      tags: ['Sets'],
      summary: 'List icon sets',
      request: { query: SetListQuery },
      responses: { 200: json(IconSet.array(), 'Icon sets'), 400: problemResponses[400] },
    }),
    async (c) => {
      const { type, tier } = c.req.valid('query');
      const sets = await deps.icons.listSets({
        ...(type ? { type } : {}),
        ...(tier ? { tier } : {}),
      });
      setCache(c, 'metadata');
      return c.json(sets, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/sets/{set}',
      tags: ['Sets'],
      summary: 'Icon set details and license',
      request: { params: SetParams },
      responses: {
        200: json(IconSet, 'Icon set'),
        400: problemResponses[400],
        404: problemResponses[404],
      },
    }),
    async (c) => {
      const { set } = c.req.valid('param');
      const found = await deps.icons.getSet(set);
      if (!found) throw notFound(`Icon set "${set}" does not exist`);
      setCache(c, 'metadata');
      return c.json(found, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/sets/{set}/icons',
      tags: ['Sets'],
      summary: 'Icons in a set (cursor pagination, ordered by name)',
      request: { params: SetParams, query: SetIconsQuery },
      responses: {
        200: json(SetIconsPage, 'A page of icons'),
        400: problemResponses[400],
        404: problemResponses[404],
      },
    }),
    async (c) => {
      const { set } = c.req.valid('param');
      const { cursor, limit } = c.req.valid('query');
      if (!(await deps.icons.getSet(set))) throw notFound(`Icon set "${set}" does not exist`);
      const page = await deps.icons.listSetIcons(set, { limit, ...(cursor ? { cursor } : {}) });
      setCache(c, 'metadata');
      return c.json({ items: page.items.map(summary), nextCursor: page.nextCursor }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/icons/{set}/{name}',
      tags: ['Icons'],
      summary: 'Icon details: SVG body, set, license, synonyms, categories',
      request: { params: IconParams },
      responses: {
        200: json(IconDetail, 'Icon'),
        400: problemResponses[400],
        404: problemResponses[404],
      },
    }),
    async (c) => {
      const { set, name } = c.req.valid('param');
      const icon = await service.getIcon(set, name);
      setCache(c, 'metadata');
      return c.json(
        {
          ...summary(icon),
          setInfo: icon.setInfo,
          synonyms: icon.synonyms,
          categories: icon.categories,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/icons/{set}/{name}/code',
      tags: ['Icons'],
      summary: 'Copy-ready code: SVG, JSX, Vue, Svelte, data URI or CSS',
      request: { params: IconParams, query: CodeQuery },
      responses: {
        200: json(CodeResult, 'Code snippet'),
        400: problemResponses[400],
        404: problemResponses[404],
      },
    }),
    async (c) => {
      const { set, name } = c.req.valid('param');
      const { format, color, size, stroke } = c.req.valid('query');
      const code = await service.code(set, name, format, {
        ...(color ? { color } : {}),
        ...(size ? { size } : {}),
        ...(stroke ? { strokeWidth: stroke } : {}),
      });
      setCache(c, 'asset');
      return c.json({ format, code }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/icons/{set}/{name}/attribution',
      tags: ['Icons'],
      summary: 'Ready-made credit line (required for tier B/C icons)',
      request: { params: IconParams },
      responses: {
        200: json(AttributionResult, 'Attribution'),
        400: problemResponses[400],
        404: problemResponses[404],
      },
    }),
    async (c) => {
      const { set, name } = c.req.valid('param');
      const attribution = await service.attribution(set, name);
      setCache(c, 'metadata');
      return c.json(attribution, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/categories',
      tags: ['Categories'],
      summary: 'Categories with icon counts',
      responses: { 200: json(Category.array(), 'Categories') },
    }),
    async (c) => {
      const categories = await deps.icons.listCategories();
      setCache(c, 'metadata');
      return c.json(categories, 200);
    },
  );
}
