import type { LicenseTier } from '@iconnook/core';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/** Tier X is deliberately absent: a set with a GPL/NC/unknown license cannot be stored (ADR 0002). */
export const licenseTier = pgEnum('license_tier', [
  'A',
  'B',
  'C',
] as const satisfies readonly Exclude<LicenseTier, 'X'>[]);

export const setType = pgEnum('set_type', [
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
]);

export const tagSource = pgEnum('tag_source', ['set', 'auto', 'cldr', 'manual']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const iconSets = pgTable(
  'icon_sets',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    prefix: text('prefix').notNull(),
    name: text('name').notNull(),
    authorName: text('author_name'),
    authorUrl: text('author_url'),
    licenseSpdx: text('license_spdx').notNull(),
    licenseTier: licenseTier('license_tier').notNull(),
    licenseUrl: text('license_url'),
    type: setType('type').notNull(),
    isColor: boolean('is_color').notNull().default(false),
    gridSize: integer('grid_size'),
    version: text('version'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('icon_sets_prefix_key').on(t.prefix),
    check('icon_sets_prefix_format', sql`${t.prefix} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);

export const icons = pgTable(
  'icons',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    setId: integer('set_id')
      .notNull()
      .references(() => iconSets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Sanitized SVG inner markup (without the outer <svg> element). */
    body: text('body').notNull(),
    // Iconify allows fractional sizes (e.g. FormKit is 25.9 wide); float8 round-trips JS numbers exactly.
    width: doublePrecision('width').notNull(),
    height: doublePrecision('height').notNull(),
    hidden: boolean('hidden').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('icons_set_id_name_key').on(t.setId, t.name),
    check('icons_name_format', sql`${t.name} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('icons_dimensions_positive', sql`${t.width} > 0 AND ${t.height} > 0`),
  ],
);

export const tags = pgTable(
  'tags',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex('tags_slug_key').on(t.slug)],
);

export const iconTags = pgTable(
  'icon_tags',
  {
    iconId: bigint('icon_id', { mode: 'number' })
      .notNull()
      .references(() => icons.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    source: tagSource('source').notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.iconId, t.tagId] }), index('icon_tags_tag_id_idx').on(t.tagId)],
);

export const categories = pgTable(
  'categories',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    parentId: integer('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex('categories_slug_key').on(t.slug)],
);

export const iconCategories = pgTable(
  'icon_categories',
  {
    iconId: bigint('icon_id', { mode: 'number' })
      .notNull()
      .references(() => icons.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.iconId, t.categoryId] }),
    index('icon_categories_category_id_idx').on(t.categoryId),
  ],
);

/** Aggregated per icon per day — no personal data (docs/standards/security.md#privacy). */
export const downloads = pgTable(
  'downloads',
  {
    iconId: bigint('icon_id', { mode: 'number' })
      .notNull()
      .references(() => icons.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.iconId, t.day] }),
    check('downloads_count_non_negative', sql`${t.count} >= 0`),
  ],
);
