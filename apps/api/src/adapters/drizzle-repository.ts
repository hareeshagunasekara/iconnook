import { requiresAttribution } from '@iconnook/core';
import { schema, type Database } from '@iconnook/db';
import { and, asc, count, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm';

import type {
  CategorySummary,
  Collection,
  IconDetail,
  IconListItem,
  IconRecord,
  IconRepository,
  Page,
  SetPreview,
  SetSummary,
} from '../domain.js';

const {
  categories,
  collectionIcons,
  collections,
  iconCategories,
  icons,
  iconSets,
  iconTags,
  tags,
} = schema;
type SetRow = typeof iconSets.$inferSelect;

const visible = eq(icons.hidden, false);

/** Style words that only make variants of one icon ("cat-outline", "cat-24-filled"). */
const STYLE_WORD =
  /^(outline|outlined|filled|fill|solid|bold|thin|light|regular|duotone|duo|sharp|rounded|round|twotone|line|linear|broken|alt|\d+)$/;
/** An icon name without its style words: "cat-outline" and "cat-24-filled" are both "cat". */
const iconStem = (name: string) =>
  name
    .split('-')
    .filter((part) => !STYLE_WORD.test(part))
    .join('-');

interface SetSamples {
  preview: SetPreview | null;
  samples: string[];
}

function toSetSummary(row: SetRow, { preview, samples }: SetSamples): SetSummary {
  return {
    preview,
    samples,
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

interface PreviewRow extends Record<string, unknown> {
  set_id: number;
  name: string;
  body: string;
  width: number;
  height: number;
}

/**
 * Preview icon per set: the first of the set's sample icons that exists and is visible, in the
 * order the set's authors listed them. One query for any number of sets (uses the set_id+name index).
 */
const NO_SAMPLES: SetSamples = { preview: null, samples: [] };

/** The authors' sample icons that exist, in their order: the first as the preview, up to 4 names. */
async function loadPreviews(
  db: Database,
  setIds: readonly number[],
): Promise<Map<number, SetSamples>> {
  if (setIds.length === 0) return new Map();
  const rows = await db.execute<PreviewRow>(sql`
    SELECT s.id AS set_id, i.name, i.body, i.width, i.height
    FROM icon_sets s
    JOIN icons i ON i.set_id = s.id AND i.name = ANY (s.sample_icons) AND NOT i.hidden
    WHERE s.id IN (${sql.join(
      setIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    ORDER BY s.id, array_position(s.sample_icons, i.name)`);
  const bySet = new Map<number, SetSamples>();
  for (const r of rows) {
    const entry = bySet.get(r.set_id) ?? {
      preview: { name: r.name, body: r.body, width: r.width, height: r.height },
      samples: [],
    };
    if (entry.samples.length < 4) entry.samples.push(r.name);
    bySet.set(r.set_id, entry);
  }
  return bySet;
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
      setInfo: toSetSummary(
        row.setRow,
        (await loadPreviews(this.db, [row.setRow.id])).get(row.setRow.id) ?? NO_SAMPLES,
      ),
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
    const previews = await loadPreviews(
      this.db,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toSetSummary(r, previews.get(r.id) ?? NO_SAMPLES));
  }

  async getSet(prefix: string): Promise<SetSummary | null> {
    const [row] = await this.db.select().from(iconSets).where(eq(iconSets.prefix, prefix));
    if (!row) return null;
    return toSetSummary(row, (await loadPreviews(this.db, [row.id])).get(row.id) ?? NO_SAMPLES);
  }

  async listSetIcons(
    prefix: string,
    page: { cursor?: string; offset?: number; limit: number },
  ): Promise<Page<IconRecord>> {
    const conditions = [eq(iconSets.prefix, prefix), visible];
    if (page.cursor) conditions.push(gt(icons.name, page.cursor));
    const rows = await this.db
      .select(iconColumns)
      .from(icons)
      .innerJoin(iconSets, eq(iconSets.id, icons.setId))
      .where(and(...conditions))
      .orderBy(asc(icons.name))
      .limit(page.limit + 1)
      .offset(page.offset ?? 0);
    const items = rows.slice(0, page.limit);
    return { items, nextCursor: rows.length > page.limit ? (items.at(-1)?.name ?? null) : null };
  }

  async listCategories(): Promise<CategorySummary[]> {
    const [rows, candidates] = await Promise.all([
      this.db
        .select({ slug: categories.slug, label: categories.label, total: count(icons.id) })
        .from(categories)
        .innerJoin(iconCategories, eq(iconCategories.categoryId, categories.id))
        .innerJoin(icons, and(eq(icons.id, iconCategories.iconId), visible))
        .groupBy(categories.id)
        .orderBy(asc(categories.label)),
      // Up to 16 candidates per category: colorful sets first (they read best when tiny), taking
      // one icon from each set in turn (a stable shuffle within each set) so no single set fills
      // every card. Archived sets are left out.
      this.db.execute<{ slug: string; prefix: string; name: string }>(sql`
        SELECT c.slug, p.prefix, p.name
        FROM categories c
        CROSS JOIN LATERAL (
          SELECT prefix, name
          FROM (
            SELECT s.prefix, i.name, s.is_color,
              row_number() OVER (
                PARTITION BY s.id ORDER BY md5(s.prefix || ':' || i.name)
              ) AS turn
            FROM icon_categories ic
            JOIN icons i ON i.id = ic.icon_id AND NOT i.hidden
            JOIN icon_sets s ON s.id = i.set_id AND s.type <> 'archive'
            WHERE ic.category_id = c.id
          ) ranked
          ORDER BY is_color DESC, turn, md5(prefix)
          LIMIT 16
        ) p`),
    ]);
    const previews = new Map<string, { set: string; name: string }[]>();
    for (const row of candidates) {
      const picked = previews.get(row.slug) ?? [];
      // Four different things, not four variants of one icon ("cat", "cat-outline", …).
      if (picked.length < 4 && !picked.some((p) => iconStem(p.name) === iconStem(row.name)))
        picked.push({ set: row.prefix, name: row.name });
      previews.set(row.slug, picked);
    }
    return rows.map((row) => ({ ...row, preview: previews.get(row.slug) ?? [] }));
  }

  async getIconsByRefs(refs: readonly string[]): Promise<IconListItem[]> {
    const pairs = refs.map((r) => r.split(':') as [string, string]);
    const rows: IconListItem[] = [];
    for (let i = 0; i < pairs.length; i += 200) {
      const chunk = pairs.slice(i, i + 200);
      rows.push(
        ...(await this.db
          .select({
            ...iconColumns,
            setName: iconSets.name,
            tier: iconSets.licenseTier,
            isColor: iconSets.isColor,
          })
          .from(icons)
          .innerJoin(iconSets, eq(iconSets.id, icons.setId))
          .where(
            and(
              visible,
              or(
                ...chunk.map(([set, name]) => and(eq(iconSets.prefix, set), eq(icons.name, name))),
              ),
            ),
          )),
      );
    }
    const byRef = new Map(rows.map((r) => [`${r.set}:${r.name}`, r]));
    return refs.flatMap((r) => byRef.get(r) ?? []);
  }

  async iconExists(id: number): Promise<boolean> {
    const [row] = await this.db
      .select({ id: icons.id })
      .from(icons)
      .where(and(eq(icons.id, id), visible));
    return row !== undefined;
  }

  async createCollection(collection: {
    id: string;
    name: string | null;
    iconIds: readonly number[];
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(collections).values({ id: collection.id, name: collection.name });
      await tx.insert(collectionIcons).values(
        collection.iconIds.map((iconId, position) => ({
          collectionId: collection.id,
          iconId,
          position,
        })),
      );
    });
  }

  async getCollection(id: string): Promise<Collection | null> {
    const [row] = await this.db.select().from(collections).where(eq(collections.id, id));
    if (!row) return null;
    const members = await this.db
      .select({ iconId: collectionIcons.iconId })
      .from(collectionIcons)
      .where(eq(collectionIcons.collectionId, id))
      .orderBy(asc(collectionIcons.position));
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      icons: await this.getIconsByIds(members.map((m) => m.iconId)),
    };
  }

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
