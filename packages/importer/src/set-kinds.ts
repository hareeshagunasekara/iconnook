import type { SetType } from './types.js';

/**
 * Which kind (set type) a set is listed under. Iconify's category says what a set is for (UI,
 * logos, flags…); interface sets are then split further so no kind is a wall of 100 sets.
 * Rules run in order and the first match wins; see SOURCES.md for the result.
 */
export interface KindInput {
  prefix: string;
  category: string | undefined;
  tags: readonly string[];
  total: number;
}

/** Iconify categories that hold general interface icons (split further below). */
const INTERFACE_CATEGORIES = new Set([
  'Material',
  'UI 24px',
  'UI 16px / 32px',
  'UI Other / Mixed Grid',
]);

/** Iconify's other categories → IconNook kinds. */
const TYPE_BY_CATEGORY: Readonly<Record<string, SetType>> = {
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

/** Google's Material family (the animated Material Line Icons are listed under Animated). */
const MATERIAL = new Set(['material-symbols', 'material-symbols-light', 'ic', 'mdi', 'mdi-light']);

const PIXEL = new Set(['pixelarticons', 'dinkie-icons', 'memory']);

/** Icons from a company's or organization's product design system. */
const DESIGN_SYSTEMS = new Set([
  'fluent', // Microsoft
  'carbon', // IBM
  'tdesign', // Tencent
  'garden', // Zendesk
  'ix', // Siemens
  'clarity', // VMware
  'qlementine-icons', // Qlementine (Qt)
  'ant-design', // Ant Group
  'gravity-ui', // Yandex
  'octicon', // GitHub
  'lsicon', // Lsicon
  'oui', // OpenSearch
  'ooui', // Wikimedia
  'pajamas', // GitLab
  'eos-icons', // SUSE
  'rivet-icons', // Indiana University
]);

/** Icons that ship with a UI framework or component library. */
const FRAMEWORKS = new Set([
  'bi', // Bootstrap
  'heroicons', // Tailwind CSS
  'ion', // Ionic
  'famicons', // Ionicons fork
  'f7', // Framework7
  'flowbite', // Flowbite
  'radix-icons', // Radix UI
  'prime', // PrimeFaces / PrimeVue
  'ep', // Element Plus
  'weui', // WeUI
]);

/** All-purpose libraries this big get their own kind, whatever their style. */
const LIBRARY_MIN_ICONS = 5000;

/**
 * Line vs solid follows Iconify's "Uses Stroke" tag, except where the tag misdescribes how a set
 * looks: many line sets draw their outlines as filled shapes, so they have no strokes. Checked
 * by eye against each set's sample icons; sets that mix both styles go by their default style.
 */
const LINE_OVERRIDES = new Set([
  'mingcute',
  'glyphs',
  'uil', // Unicons (line)
  'uit', // Unicons Thin Line
  'teenyicons',
  'stash',
  'jam',
  'gg', // css.gg
  'lineicons',
  'sidekickicons',
  'system-uicons',
  'bitcoin-icons',
  'circum',
  'cuida',
  'mi', // Mono Icons
  'nimbus',
  'ei', // Evil Icons
  'bx', // BoxIcons v2 (regular)
]);
const SOLID_OVERRIDES = new Set(['icon-park-solid', 'icon-park-twotone', 'duo-icons']);

/** Interface sets whose icons are multicolored. */
const COLOR_OVERRIDES = new Set(['glyphs-poly']);

export function setKindFor({ prefix, category, tags, total }: KindInput): SetType {
  if (category === 'Archive / Unmaintained') return 'archive';
  if (tags.includes('Contains Animations')) return 'animated';
  if (!category || !INTERFACE_CATEGORIES.has(category))
    return (category ? TYPE_BY_CATEGORY[category] : undefined) ?? 'themed';

  if (COLOR_OVERRIDES.has(prefix)) return 'color';
  if (MATERIAL.has(prefix)) return 'material';
  if (PIXEL.has(prefix)) return 'pixel';
  if (DESIGN_SYSTEMS.has(prefix)) return 'design-systems';
  if (FRAMEWORKS.has(prefix)) return 'frameworks';
  if (total >= LIBRARY_MIN_ICONS) return 'libraries';
  if (LINE_OVERRIDES.has(prefix)) return 'line';
  if (SOLID_OVERRIDES.has(prefix)) return 'solid';
  return tags.includes('Uses Stroke') ? 'line' : 'solid';
}
