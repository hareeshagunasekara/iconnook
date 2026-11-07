import { lookupCollections } from '@iconify/json';
import { describe, expect, it } from 'vitest';

import { setKindFor, type KindInput } from './set-kinds.js';

const ui = (prefix: string, more: Partial<KindInput> = {}): KindInput => ({
  prefix,
  category: 'UI 24px',
  tags: [],
  total: 500,
  ...more,
});

describe('setKindFor', () => {
  it('maps non-interface categories straight to their kind; unknown → themed', () => {
    expect(setKindFor({ ...ui('x'), category: 'Logos' })).toBe('logos');
    expect(setKindFor({ ...ui('x'), category: 'UI Multicolor' })).toBe('color');
    expect(setKindFor({ ...ui('x'), category: 'Programming' })).toBe('developer');
    expect(setKindFor({ ...ui('x'), category: 'Something New' })).toBe('themed');
    expect(setKindFor({ ...ui('x'), category: undefined })).toBe('themed');
  });

  it('archive wins over everything, then animation', () => {
    const animated = { tags: ['Contains Animations'] };
    expect(setKindFor(ui('x', { ...animated, category: 'Archive / Unmaintained' }))).toBe(
      'archive',
    );
    expect(setKindFor(ui('x', animated))).toBe('animated');
    expect(setKindFor(ui('x', { ...animated, category: 'UI Multicolor' }))).toBe('animated');
  });

  it('splits interface sets: family, design system, framework, then size, then style', () => {
    expect(setKindFor(ui('mdi', { total: 7447 }))).toBe('material');
    expect(setKindFor(ui('pixelarticons'))).toBe('pixel');
    expect(setKindFor(ui('fluent', { total: 19945 }))).toBe('design-systems');
    expect(setKindFor(ui('bi'))).toBe('frameworks');
    expect(setKindFor(ui('tabler', { total: 6257, tags: ['Uses Stroke'] }))).toBe('libraries');
    expect(setKindFor(ui('some-line', { tags: ['Uses Stroke'] }))).toBe('line');
    expect(setKindFor(ui('some-solid'))).toBe('solid');
  });

  it('corrects sets whose tags misdescribe their look', () => {
    expect(setKindFor(ui('circum'))).toBe('line'); // outlines drawn as fills
    expect(setKindFor(ui('icon-park-solid', { tags: ['Uses Stroke'] }))).toBe('solid');
    expect(setKindFor(ui('glyphs-poly', { tags: ['Uses Stroke'] }))).toBe('color');
  });

  it('puts every bundled Iconify set into a kind, and no interface kind is huge', async () => {
    const counts = new Map<string, number>();
    for (const [prefix, info] of Object.entries(await lookupCollections())) {
      const kind = setKindFor({
        prefix,
        category: info.category,
        tags: info.tags ?? [],
        total: info.total ?? 0,
      });
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    for (const kind of ['libraries', 'line', 'solid', 'design-systems', 'frameworks'])
      expect(counts.get(kind) ?? 0).toBeLessThan(60);
  });
});
