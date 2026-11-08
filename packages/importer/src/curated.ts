import { BRAND_ICONS } from './approved.js';
import type { LoadedSet } from './types.js';

/** Brand logos in sets that aren't logo sets; the icon page shows a trademark notice for them. */
export const BRANDS_CATEGORY = 'Brands';
/** Loading indicators from every set, gathered on one category page. */
export const LOADING_CATEGORY = 'Loading & spinners';

/** Sets made only of loading indicators. */
const LOADING_SETS = new Set(['svg-spinners', 'svg-loaders']);
/** A loading word as a whole part of the name: "loader-2", "bubble-loading", "spinner-gap-bold". */
const LOADING_NAME = /(^|-)(loader|loading|spinner|throbber)s?\d*(-|$)/;
/** Things that load or spin but aren't indicators: "front-loader", "truck-loading", "salad-spinner". */
const NOT_LOADING = /(^|-)(front|wheel|backhoe|truck|shipping|dock|zone|fidget|game|salad)(-|$)/;

/** Adds our own cross-set categories to a loaded set, from any source. */
export function addCuratedCategories(loaded: LoadedSet): LoadedSet {
  const { prefix } = loaded.set;
  const categories = new Map(loaded.categories);
  const add = (label: string, names: string[]) => {
    const merged = new Set([...(categories.get(label) ?? []), ...names]);
    if (merged.size > 0) categories.set(label, [...merged]);
  };
  const names = loaded.icons.map((i) => i.name);
  const brand = BRAND_ICONS[prefix];
  if (brand)
    add(
      BRANDS_CATEGORY,
      names.filter((n) => brand.test(n)),
    );
  add(
    LOADING_CATEGORY,
    LOADING_SETS.has(prefix)
      ? names
      : names.filter((n) => LOADING_NAME.test(n) && !NOT_LOADING.test(n)),
  );
  return { ...loaded, categories };
}
