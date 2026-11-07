import { randomBytes } from 'node:crypto';

import { createRoute, type OpenAPIHono, type z } from '@hono/zod-openapi';
import { packFilename, packId, packKey, PackRequest } from '@iconnook/jobs';
import type { MiddlewareHandler } from 'hono';

import type { Dependencies, IconListItem, PackStatus } from '../domain.js';
import { setCache } from '../http/middleware.js';
import { badRequest, notFound, ProblemError, unavailable } from '../http/problem.js';
import {
  CollectionParams,
  CollectionResult,
  CreateCollectionBody,
  DownloadEventBody,
  IconListResult,
  IconsByRefQuery,
  PackIdParam,
  PackStatusResult,
  problemResponses,
} from './schemas.js';

export interface WriteRouteContext {
  deps: Dependencies;
  apiUrl: string;
  siteUrl: string;
  /** Stricter rate limit for endpoints that create things (collections, packs). */
  writeLimit: MiddlewareHandler;
}

const json = <T extends z.ZodType>(schema: T, description: string) =>
  ({ content: { 'application/json': { schema } }, description }) as const;
const body = <T extends z.ZodType>(schema: T) =>
  ({ content: { 'application/json': { schema } }, required: true }) as const;

/** Endpoints for collections, packs (ZIP / sprite) and download counting. */
export function registerCollections(app: OpenAPIHono, ctx: WriteRouteContext): void {
  const { deps, apiUrl, siteUrl } = ctx;
  const item = (i: IconListItem) => ({
    id: i.id,
    set: i.set,
    name: i.name,
    width: i.width,
    height: i.height,
    body: i.body,
    setName: i.setName,
    tier: i.tier,
    isColor: i.isColor,
    urls: {
      svg: `${apiUrl}/v1/icons/${i.set}/${i.name}.svg`,
      png: `${apiUrl}/v1/icons/${i.set}/${i.name}.png`,
      page: `${siteUrl}/icons/${i.set}/${i.name}`,
    },
  });
  const packView = (s: PackStatus) => ({
    ...s,
    statusUrl: `${apiUrl}/v1/packs/${s.id}`,
    downloadUrl: s.state === 'completed' ? `${apiUrl}/v1/packs/${s.id}/download` : null,
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/icons',
      tags: ['Icons'],
      summary: 'Several icons at once, by "set:name" (used by collections)',
      request: { query: IconsByRefQuery },
      responses: {
        200: json(IconListResult, 'Icons that exist, in request order'),
        400: problemResponses[400],
      },
    }),
    async (c) => {
      const { names } = c.req.valid('query');
      const items = await deps.icons.getIconsByRefs(names);
      setCache(c, 'metadata');
      return c.json({ items: items.map(item) }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/collections',
      tags: ['Collections'],
      summary: 'Share a collection: stores an immutable snapshot and returns its link',
      middleware: [ctx.writeLimit] as const,
      request: { body: body(CreateCollectionBody) },
      responses: {
        201: json(CollectionResult, 'Created'),
        400: problemResponses[400],
        429: problemResponses[429],
      },
    }),
    async (c) => {
      const { name: rawName, icons } = c.req.valid('json');
      const name = rawName === undefined || rawName === '' ? null : rawName;
      const found = await deps.icons.getIconsByRefs([...new Set(icons)]);
      if (found.length === 0) throw badRequest('None of these icons exist');
      // 96 random bits, URL-safe: unguessable without being a secret.
      const id = randomBytes(12).toString('base64url');
      await deps.icons.createCollection({
        id,
        name,
        iconIds: found.map((i) => i.id),
      });
      c.header('Cache-Control', 'no-store');
      c.header('Location', `${apiUrl}/v1/collections/${id}`);
      return c.json(
        {
          id,
          name,
          createdAt: new Date().toISOString(),
          url: `${siteUrl}/c/${id}`,
          items: found.map(item),
        },
        201,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/collections/{id}',
      tags: ['Collections'],
      summary: 'A shared collection',
      request: { params: CollectionParams },
      responses: { 200: json(CollectionResult, 'Collection'), 404: problemResponses[404] },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const collection = await deps.icons.getCollection(id);
      if (!collection) throw notFound('No such collection');
      setCache(c, 'metadata');
      return c.json(
        {
          id: collection.id,
          name: collection.name,
          createdAt: collection.createdAt,
          url: `${siteUrl}/c/${collection.id}`,
          items: collection.icons.map(item),
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/packs',
      tags: ['Packs'],
      summary: 'Build a ZIP (SVG, optional PNG, licenses) or an SVG sprite in the background',
      middleware: [ctx.writeLimit] as const,
      description:
        'Returns 202 with a status URL. Identical requests share one pack (content-addressed), so re-requesting is free.',
      request: { body: body(PackRequest) },
      responses: {
        202: json(PackStatusResult, 'Queued (or already built)'),
        400: problemResponses[400],
        429: problemResponses[429],
        503: problemResponses[503],
      },
    }),
    async (c) => {
      if (!(await deps.flags.isEnabled('packs')))
        throw unavailable('Packs are temporarily disabled');
      const request = c.req.valid('json');
      const id = packId(request);
      let status = await deps.packs.enqueue(id, request);
      // The file can outlive neither retention nor a storage lifecycle rule: never promise a download
      // that would 404 — rebuild instead.
      if (status.state === 'completed' && !(await deps.files.exists(packKey(id, request.format)))) {
        status = await deps.packs.rebuild(id, request);
      }
      c.header('Cache-Control', 'no-store');
      c.header('Location', `${apiUrl}/v1/packs/${status.id}`);
      return c.json(packView(status), 202);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v1/packs/{id}',
      tags: ['Packs'],
      summary: 'Pack build status',
      request: { params: PackIdParam },
      responses: {
        200: json(PackStatusResult, 'Status'),
        400: problemResponses[400],
        404: problemResponses[404],
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const status = await deps.packs.status(id);
      if (!status) throw notFound('No such pack (packs are kept for 7 days)');
      c.header('Cache-Control', 'no-store');
      return c.json(packView(status), 200);
    },
  );

  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/v1/packs/{id}/download',
    tags: ['Packs'],
    summary: 'Download a finished pack (ZIP or SVG sprite)',
    request: { params: PackIdParam },
    responses: {
      200: { description: 'The file' },
      404: problemResponses[404],
      409: { description: 'Not finished yet' },
    },
  });

  app.get('/v1/packs/:id{[0-9a-f]{32}}/download', async (c) => {
    const id = c.req.param('id');
    const status = await deps.packs.status(id);
    if (!status) throw notFound('No such pack (packs are kept for 7 days)');
    if (status.state !== 'completed') {
      throw new ProblemError(
        409,
        'not-ready',
        'Not ready',
        `The pack is ${status.state}; poll its status URL`,
      );
    }
    const file = await deps.files.get(packKey(id, status.format));
    if (!file?.body) throw notFound('This pack has expired; request it again');
    c.header('Cache-Control', 'public, max-age=86400, immutable');
    c.header('Content-Disposition', `attachment; filename="${packFilename(status.format)}"`);
    return c.body(file.body, 200, {
      'Content-Type': status.format === 'zip' ? 'application/zip' : 'image/svg+xml; charset=utf-8',
      ...(file.headers.get('content-length')
        ? { 'Content-Length': file.headers.get('content-length') ?? '' }
        : {}),
    });
  });

  app.openapi(
    createRoute({
      method: 'post',
      path: '/v1/downloads',
      tags: ['Icons'],
      summary: 'Count a download (anonymous, aggregated per icon per day)',
      request: { body: body(DownloadEventBody) },
      responses: {
        202: { description: 'Counted' },
        400: problemResponses[400],
        404: problemResponses[404],
      },
    }),
    async (c) => {
      const { iconId } = c.req.valid('json');
      if (!(await deps.icons.iconExists(iconId))) throw notFound('No such icon');
      await deps.downloads.record(iconId);
      c.header('Cache-Control', 'no-store');
      return c.body(null, 202);
    },
  );
}
