import { createHash } from 'node:crypto';

import { COLOR_PATTERN, STROKE_RANGE } from '@iconnook/svg';
import { z } from 'zod';

export const QUEUE_PACKS = 'packs';
export const QUEUE_MAINTENANCE = 'maintenance';

export const MAX_PACK_ICONS = 500;
export const PACK_RETENTION_DAYS = 7;

/** "set:name", both lowercase kebab-case. */
export const IconRef = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*$/, 'must look like "set:name"');

export const PackRequest = z
  .object({
    icons: z.array(IconRef).min(1).max(MAX_PACK_ICONS),
    format: z.enum(['zip', 'sprite']),
    color: z.string().regex(COLOR_PATTERN).optional(),
    stroke: z.number().min(STROKE_RANGE.min).max(STROKE_RANGE.max).optional(),
    /** ZIP only: also include a PNG of every icon at this size. */
    png: z.number().int().min(16).max(1024).optional(),
  })
  .refine((r) => new Set(r.icons).size === r.icons.length, {
    message: 'icons must be unique',
    path: ['icons'],
  })
  .refine((r) => r.format === 'zip' || r.png === undefined, {
    message: 'png is only available for zip packs',
    path: ['png'],
  });

export type PackRequest = z.infer<typeof PackRequest>;

/**
 * Content-addressed pack id: the same request always maps to the same id, so repeat requests reuse
 * the queued/finished pack instead of building it again. Icon order doesn't matter.
 */
export function packId(request: PackRequest): string {
  const canonical = JSON.stringify({
    icons: [...request.icons].sort(),
    format: request.format,
    color: request.color?.toLowerCase() ?? null,
    stroke: request.stroke ?? null,
    png: request.png ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export const packKey = (id: string, format: PackRequest['format']) =>
  `packs/${id}.${format === 'zip' ? 'zip' : 'svg'}`;

export const packFilename = (format: PackRequest['format']) =>
  format === 'zip' ? 'iconnook-icons.zip' : 'iconnook-sprite.svg';
