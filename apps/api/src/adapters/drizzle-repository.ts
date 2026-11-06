import { requiresAttribution } from '@iconnook/core';
import { schema, type Database } from '@iconnook/db';
import { and, asc, count, eq, gt, inArray, sql, type SQL } from 'drizzle-orm';

import type {
  CategorySummary,
  IconDetail,
  IconListItem,
  IconRecord,
  IconRepository,
  Page,
  SetSummary,
} from '../domain.js';

const { categories, iconCategories, icons, iconSets, iconTags, tags } = schema;
type SetRow = typeof iconSets.$inferSelect;

const visible = eq(icons.hidden, false);

function toSetSummary(row: SetRow): SetSummary {
  return {
    prefix: row.prefix,
    name: row.name,
    type: row.type,
    total: row.iconCount,
    isColor: row.isColor,
    gridSize: row.gridSize,
    version: row.version,
    author: row.authorName ? { name: row.authorName, url: row.authorUrl } : null,
    license: {
      spdx: row.licenseSpdx,
      tier: row.licenseTier,
      url: row.licenseUrl,
      attributionRequired: requiresAttribution(row.licenseTier),
    },
  };
}

const iconColumns = {
  id: icons.id,
  set: iconSets.prefix,
  name: icons.name,
  body: icons.body,
  width: icons.width,
  height: icons.height,
};

export class DrizzleIconRepository implements IconRepository {
  constructor(private readonly db: Database) {}

  async getIcon(set: string, name: string): Promise<IconDetail | null> {
    const [row] = await this.db
      .select({ icon: iconColumns, setRow: iconSets })
      .from(icons)
      .innerJoin(iconSets, eq(iconSets.id, icons.setId))
      .where(and(eq(iconSets.prefix, set), eq(icons.name, name), visible));
    if (!row) return null;

    const [synonyms, cats] = await Promise.all([
      this.db
        .select({ label: tags.label })
        .from(iconTags)
        .innerJoin(tags, eq(tags.id, iconTags.tagId))
        .where(eq(iconTags.iconId, row.icon.id))
        .orderBy(asc(tags.label)),
      this.db
        .select({ slug: categories.slug, label: categories.label })
        .from(iconCategories)
        .innerJoin(categories, eq(categories.id, iconCategories.categoryId))
        .where(eq(iconCategories.iconId, row.icon.id))
        .orderBy(asc(categories.label)),
    ]);

    return {
      ...row.icon,
      setInfo: toSetSummary(row.setRow),
      synonyms: synonyms.map((s) => s.label),
      categories: cats,
    };
  }

  async getIconsByIds(ids: readonly number[]): Promise<IconListItem[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        ...iconColumns,
        setName: iconSets.name,
        tier: iconSets.licenseTier,
        isColor: iconSets.isColor,
      })
      .from(icons)
      .innerJoin(iconSets, eq(iconSets.id, icons.setId))
      .where(and(inArray(icons.id, [...ids]), visible));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  async listSets(filter: { type?: string; tier?: string }): Promise<SetSummary[]> {
    const where: SQL[] = [];
    if (filter.type) where.push(sql`${iconSets.type} = ${filter.type}`);
    if (filter.tier) where.push(sql`${iconSets.licenseTier} = ${filter.tier}`);
    const rows = await this.db
      .select()
      .from(iconSets)
      .where(and(...where))
      .orderBy(asc(iconSets.name));
    return rows.map(toSetSummary);
  }

  async getSet(prefix: string): Promise<SetSummary | null> {
    const [row] = await this.db.select().from(iconSets).where(eq(iconSets.prefix, prefix));
    return row ? toSetSummary(row) : null;
  }

  async listSetIcons(
    prefix: string,
    page: { cursor?: string; limit: number },
  ): Promise<Page<IconRecord>> {
    const conditions = [eq(iconSets.prefix, prefix), visible];
    if (page.cursor) conditions.push(gt(icons.name, page.cursor));
    const rows = await this.db
      .select(iconColumns)
      .from(icons)
      .innerJoin(iconSets, eq(iconSets.id, icons.setId))
      .where(and(...conditions))
      .orderBy(asc(icons.name))
      .limit(page.limit + 1);
    const items = rows.slice(0, page.limit);
    return { items, nextCursor: rows.length > page.limit ? (items.at(-1)?.name ?? null) : null };
  }

  async listCategories(): Promise<CategorySummary[]> {
    return this.db
      .select({
        slug: categories.slug,
        label: categories.label,
        total: count(iconCategories.iconId),
      })
      .from(categories)
      .innerJoin(iconCategories, eq(iconCategories.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.label));
  }

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
