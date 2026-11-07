import { z } from '@hono/zod-openapi';
import { CODE_FORMATS, COLOR_PATTERN, SIZE_RANGE, STROKE_RANGE } from '@iconnook/svg';

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SET_TYPES = [
  'ui',
  'color',
  'developer',
  'logos',
  'emoji',
  'flags',
  'maps',
  'themed',
  'illustrations',
  'archive',
] as const;

const slug = (name: string, example: string) =>
  z
    .string()
    .max(100)
    .regex(SLUG)
    .openapi({ example, description: `${name} (lowercase kebab-case)` });

export const SetParams = z.object({
  set: slug('Icon set prefix', 'tabler').openapi({ param: { name: 'set', in: 'path' } }),
});
export const IconParams = SetParams.extend({
  name: slug('Icon name', 'arrow-left').openapi({ param: { name: 'name', in: 'path' } }),
});

/** Customization shared by .svg, .png and /code. Unknown params are dropped (and redirected away). */
export const CustomizeQuery = z.object({
  color: z
    .string()
    .regex(COLOR_PATTERN)
    .transform((v) =>
      v === 'currentColor' || v.toLowerCase() === 'currentcolor' ? 'currentColor' : v.toLowerCase(),
    )
    .optional()
    .openapi({ example: '#ff0000', description: '#rgb, #rrggbb, #rrggbbaa or currentColor' }),
  stroke: z.coerce
    .number()
    .min(STROKE_RANGE.min)
    .max(STROKE_RANGE.max)
    .optional()
    .openapi({ example: 1.5 }),
});

export const SvgQuery = CustomizeQuery.extend({
  size: z.coerce
    .number()
    .int()
    .min(SIZE_RANGE.min)
    .max(SIZE_RANGE.max)
    .optional()
    .openapi({ example: 48 }),
  download: z.enum(['1']).optional().openapi({ description: 'Set to 1 to download as a file' }),
});

export const PNG_SIZE = { min: 16, max: 2048, default: 256 } as const;
export const PngQuery = CustomizeQuery.extend({
  size: z.coerce
    .number()
    .int()
    .min(PNG_SIZE.min)
    .max(PNG_SIZE.max)
    .optional()
    .openapi({ example: 256 }),
  download: z.enum(['1']).optional(),
});

export const CodeQuery = CustomizeQuery.extend({
  format: z.enum(CODE_FORMATS).default('svg'),
  size: z.coerce.number().int().min(SIZE_RANGE.min).max(SIZE_RANGE.max).optional(),
});

export const SearchQuery = z
  .object({
    q: z.string().trim().max(100).default('').openapi({
      example: 'arrow left',
      description: 'Search text; may be empty when a filter is given',
    }),
    set: slug('Filter by set', 'tabler').optional(),
    type: z.enum(SET_TYPES).optional(),
    tier: z.enum(['A', 'B', 'C']).optional(),
    color: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    category: slug('Filter by category', 'arrows').optional(),
    page: z.coerce.number().int().min(1).max(100).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(48),
  })
  .refine(
    (s) => s.q !== '' || s.set !== undefined || s.type !== undefined || s.category !== undefined,
    {
      message: 'Provide q, or browse with a set, type or category filter',
      path: ['q'],
    },
  );

export const SetListQuery = z.object({
  type: z.enum(SET_TYPES).optional(),
  tier: z.enum(['A', 'B', 'C']).optional(),
});

export const SetIconsQuery = z.object({
  cursor: z.string().max(100).regex(SLUG).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// ---- Response schemas ----

export const Problem = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .openapi('Problem');

export const License = z
  .object({
    spdx: z.string(),
    tier: z.enum(['A', 'B', 'C']),
    url: z.string().nullable(),
    attributionRequired: z.boolean(),
  })
  .openapi('License');

export const IconSet = z
  .object({
    prefix: z.string(),
    name: z.string(),
    type: z.string(),
    total: z.number().int(),
    isColor: z.boolean(),
    gridSize: z.number().nullable(),
    version: z.string().nullable(),
    author: z.object({ name: z.string(), url: z.string().nullable() }).nullable(),
    license: License,
  })
  .openapi('IconSet');

export const IconUrls = z.object({ svg: z.string(), png: z.string(), page: z.string() });

export const IconSummary = z
  .object({
    id: z.number().int(),
    set: z.string(),
    name: z.string(),
    width: z.number(),
    height: z.number(),
    body: z.string().openapi({ description: 'Sanitized inner SVG markup' }),
    urls: IconUrls,
  })
  .openapi('IconSummary');

export const SearchResult = z
  .object({
    query: z.string(),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    tookMs: z.number(),
    items: z.array(
      IconSummary.extend({
        setName: z.string(),
        tier: z.enum(['A', 'B', 'C']),
        isColor: z.boolean(),
      }),
    ),
  })
  .openapi('SearchResult');

export const IconDetail = IconSummary.extend({
  setInfo: IconSet,
  synonyms: z.array(z.string()),
  categories: z.array(z.object({ slug: z.string(), label: z.string() })),
}).openapi('IconDetail');

export const SetIconsPage = z
  .object({ items: z.array(IconSummary), nextCursor: z.string().nullable() })
  .openapi('SetIconsPage');

export const Category = z
  .object({ slug: z.string(), label: z.string(), total: z.number().int() })
  .openapi('Category');

export const CodeResult = z
  .object({ format: z.enum(CODE_FORMATS), code: z.string() })
  .openapi('CodeResult');

export const AttributionResult = z
  .object({
    required: z.boolean(),
    shareAlike: z.boolean(),
    plain: z.string(),
    html: z.string(),
    markdown: z.string(),
  })
  .openapi('Attribution');

export const problemResponses = {
  400: {
    content: { 'application/problem+json': { schema: Problem } },
    description: 'Invalid request',
  },
  404: { content: { 'application/problem+json': { schema: Problem } }, description: 'Not found' },
  429: {
    content: { 'application/problem+json': { schema: Problem } },
    description: 'Rate limited',
  },
} as const;
