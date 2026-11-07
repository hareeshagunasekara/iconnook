import type { UiIconName } from './ui-icons';

/** Set kinds with their labels and pill styling; safe to import from islands (no server env). */
export const SET_TYPES = [
  { value: 'libraries', label: 'Big all-purpose libraries', icon: 'library-big', color: 'purple' },
  { value: 'line', label: 'Line icons', icon: 'pen-line', color: 'mustard' },
  { value: 'solid', label: 'Solid & glyph icons', icon: 'shapes', color: 'coral' },
  { value: 'material', label: 'Material & Google', icon: 'component', color: 'blue' },
  { value: 'design-systems', label: 'Company design systems', icon: 'building', color: 'green' },
  { value: 'frameworks', label: 'Framework icons', icon: 'blocks', color: 'pink' },
  { value: 'pixel', label: 'Pixel & retro', icon: 'gamepad-2', color: 'purple' },
  { value: 'animated', label: 'Animated', icon: 'loader', color: 'mustard' },
  { value: 'cute', label: 'Cute & kawaii', icon: 'cat', color: 'pink' },
  { value: 'color', label: 'Color icons', icon: 'palette', color: 'pink' },
  { value: 'developer', label: 'Developer & tech', icon: 'code-xml', color: 'green' },
  { value: 'logos', label: 'Logos & brands', icon: 'tag', color: 'blue' },
  { value: 'emoji', label: 'Emoji', icon: 'smile', color: 'purple' },
  { value: 'flags', label: 'Flags', icon: 'flag', color: 'coral' },
  { value: 'maps', label: 'Maps & location', icon: 'map-pin', color: 'mustard' },
  { value: 'themed', label: 'Themed', icon: 'layers', color: 'pink' },
  { value: 'archive', label: 'Archive', icon: 'archive', color: 'blue' },
] as const satisfies readonly { value: string; label: string; icon: UiIconName; color: string }[];

export const typeLabel = (type: string) => SET_TYPES.find((t) => t.value === type)?.label ?? type;
