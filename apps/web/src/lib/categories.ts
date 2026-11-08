import type { Category } from './api';

/**
 * Topics that make a picture on their own (animals, food, weather…) come before interface
 * plumbing (arrows, editing, text) on the categories page.
 */
const DISTINCTIVE =
  /emoji|smil|\bfaces?\b|emotion|animal|pet|nature|food|drink|beverage|fruit|weather|zodiac|constellation|astronom|science|sport|game|gaming|music|instrument|travel|place|holiday|halloween|winter|spring|autumn|flag|people|body|hand|cloth|medic|health|transport|vehicle|building|baby|agricultur|ecology|religion|makeup|photograph|romance|camping|chess|maritime|character|energy|money/i;

/** Distinctive topics first, then categories whose preview fills the card, then the biggest. */
export function orderCategories(categories: readonly Category[]): Category[] {
  const rank = (c: Category) => [
    DISTINCTIVE.test(c.label) ? 0 : 1,
    c.preview.length >= 4 ? 0 : 1,
    -c.total,
  ];
  return [...categories].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) {
      const diff = (ra[i] ?? 0) - (rb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.label.localeCompare(b.label);
  });
}
