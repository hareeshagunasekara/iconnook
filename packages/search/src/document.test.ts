import { describe, expect, it } from 'vitest';

import { buildFilter } from './document.js';

describe('buildFilter', () => {
  it('builds filters from validated values', () => {
    expect(
      buildFilter({
        set: 'tabler',
        type: 'ui',
        tier: 'A',
        color: false,
        category: 'audio-and-video',
      }),
    ).toEqual([
      'set = "tabler"',
      'type = "ui"',
      'categorySlugs = "audio-and-video"',
      'tier = "A"',
      'color = false',
    ]);
    expect(buildFilter({})).toEqual([]);
  });

  it.each([
    [{ set: 'tabler" OR set = "x' }],
    [{ type: 'ui OR 1=1' }],
    [{ category: 'Audio & Video' }],
    [{ tier: 'X' }],
    [{ tier: 'A" OR tier = "X' }],
  ])('rejects values that could inject filter syntax: %o', (filters) => {
    expect(() => buildFilter(filters)).toThrow(RangeError);
  });
});
