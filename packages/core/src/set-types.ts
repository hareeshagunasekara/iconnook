/**
 * The kinds of icon set IconNook lists (URL slugs in /sets?type=…). The importer decides which kind
 * each set gets (packages/importer/src/set-kinds.ts); the order here is the display order.
 */
export const SET_TYPES = [
  'libraries',
  'line',
  'solid',
  'material',
  'design-systems',
  'frameworks',
  'pixel',
  'animated',
  'cute',
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

export type SetType = (typeof SET_TYPES)[number];
