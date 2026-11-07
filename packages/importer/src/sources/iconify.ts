import { lookupCollection, lookupCollections } from '@iconify/json';
import type { IconifyInfo, IconifyJSON } from '@iconify/types';
import { getIconData, iconToSVG } from '@iconify/utils';
import { licenseTier } from '@iconnook/core';

import type { IconSource, LoadedSet, SetType, SourceIcon, SourceSet } from '../types.js';

/** Iconify's set categories → IconNook set types (see SOURCES.md). */
const TYPE_BY_CATEGORY: Readonly<Record<string, SetType>> = {
  Material: 'ui',
  'UI 24px': 'ui',
  'UI 16px / 32px': 'ui',
  'UI Other / Mixed Grid': 'ui',
  'UI Multicolor': 'color',
  'High Detail Multicolor': 'color',
  'Holiday / Seasonal': 'color',
  Apps: 'color',
  Programming: 'developer',
  Logos: 'logos',
  Emoji: 'emoji',
  Location: 'maps',
  Flags: 'flags',
  Thematic: 'themed',
  'High Detail': 'themed',
  'Archive / Unmaintained': 'archive',
};

const TRANSFORM_KEYS = ['rotate', 'hFlip', 'vFlip', 'left', 'top', 'width', 'height'] as const;

export function setTypeFor(category: string | undefined): SetType {
  return (category ? TYPE_BY_CATEGORY[category] : undefined) ?? 'themed';
}

export function toSourceSet(prefix: string, info: IconifyInfo): SourceSet {
  return {
    prefix,
    name: info.name,
    total: info.total ?? 0,
    authorName: info.author.name || null,
    authorUrl: info.author.url ?? null,
    licenseSpdx: info.license.spdx ?? info.license.title,
    licenseTitle: info.license.title,
    licenseUrl: info.license.url ?? null,
    licenseTier: licenseTier(info.license.spdx ?? ''),
    type: setTypeFor(info.category),
    sourceCategory: info.category ?? 'Uncategorized',
    isColor: info.palette ?? false,
    gridSize: typeof info.height === 'number' ? info.height : null,
    version: info.version ?? null,
    samples: info.samples ?? [],
  };
}

/** Resolves an icon (or transforming alias) to a body with viewBox offsets normalized to 0 0. */
export function renderIcon(data: IconifyJSON, name: string): SourceIcon | null {
  const icon = getIconData(data, name);
  if (!icon) return null;
  const built = iconToSVG(icon);
  const [left, top, width, height] = built.viewBox;
  const body =
    left || top
      ? `<g transform="translate(${String(-left)} ${String(-top)})">${built.body}</g>`
      : built.body;
  return { name, body, width, height };
}

/** Splits an Iconify set into icons, synonyms (plain aliases) and categories. Hidden icons are skipped. */
export function splitIconifySet(data: IconifyJSON, set: SourceSet): LoadedSet {
  const icons: SourceIcon[] = [];
  for (const [name, icon] of Object.entries(data.icons)) {
    if (icon.hidden) continue;
    const rendered = renderIcon(data, name);
    if (rendered) icons.push(rendered);
  }

  const visible = new Set(icons.map((i) => i.name));
  const synonyms = new Map<string, string[]>();
  for (const [alias, def] of Object.entries(data.aliases ?? {})) {
    if (def.hidden) continue;
    const transforms = TRANSFORM_KEYS.some((k) => k in def);
    if (transforms) {
      // Rotated/flipped variants look different: they are icons in their own right.
      const rendered = renderIcon(data, alias);
      if (rendered) {
        icons.push(rendered);
        visible.add(alias);
      }
    } else if (visible.has(def.parent)) {
      synonyms.set(def.parent, [...(synonyms.get(def.parent) ?? []), alias]);
    }
  }

  const categories = new Map<string, string[]>();
  for (const [label, names] of Object.entries(data.categories ?? {})) {
    const members = names.filter((n) => visible.has(n));
    if (members.length > 0) categories.set(label, members);
  }

  // Keep samples that exist as imported icons; a plain-alias sample points at its parent icon.
  const samples = [
    ...new Set(
      set.samples.flatMap((name) => {
        if (visible.has(name)) return [name];
        const parent = data.aliases?.[name]?.parent;
        return parent && visible.has(parent) ? [parent] : [];
      }),
    ),
  ];

  return { set: { ...set, samples }, icons, synonyms, categories };
}

export const iconifySource: IconSource = {
  id: 'iconify',
  async listSets() {
    const collections = await lookupCollections();
    return Object.entries(collections)
      .filter(([, info]) => !info.hidden)
      .map(([prefix, info]) => toSourceSet(prefix, info));
  },
  async loadSet(prefix) {
    const data = await lookupCollection(prefix);
    if (!data.info) throw new Error(`Iconify set "${prefix}" has no info block`);
    return splitIconifySet(data, toSourceSet(prefix, data.info));
  },
};
