import { describe, expect, it } from 'vitest';

import { renderCatalog } from './catalog.js';
import { fixtureIconifySet } from './fixtures.js';
import { prepareIcons } from './prepare.js';
import { selectSets } from './run.js';
import { splitIconifySet, toSourceSet } from './sources/iconify.js';
import { slugify } from './sync.js';
import type { SourceSet } from './types.js';

const fixture = fixtureIconifySet();
const info = fixture.info;
if (!info) throw new Error('fixture has no info');
const loaded = splitIconifySet(fixture, toSourceSet(fixture.prefix, info));
const byName = new Map(loaded.icons.map((i) => [i.name, i]));

describe('Iconify adapter', () => {
  it('assigns license tiers from the SPDX id', () => {
    expect(toSourceSet('x', info).licenseTier).toBe('A');
    const gpl = { ...info, license: { title: 'GPL', spdx: 'GPL-3.0-only' } };
    expect(toSourceSet('x', gpl).licenseTier).toBe('X');
    const unknown = { ...info, license: { title: 'Custom license' } };
    expect(toSourceSet('x', unknown).licenseTier).toBe('X');
  });

  it('skips hidden icons and hidden aliases', () => {
    expect(byName.has('legacy')).toBe(false);
    expect(byName.has('hidden-alias')).toBe(false);
  });

  it('turns plain aliases into synonyms of visible icons only', () => {
    expect(loaded.synonyms.get('home')).toEqual(['house']);
    expect([...loaded.synonyms.values()].flat()).not.toContain('old-alias');
  });

  it('imports transforming aliases as their own icons', () => {
    expect(byName.get('arrow-down')?.body).toMatch(/transform=/);
  });

  it('keeps fractional sizes and normalizes viewBox offsets to 0 0', () => {
    expect(byName.get('narrow')).toMatchObject({ width: 25.9, height: 24 });
    expect(byName.get('offset')?.body).toBe(
      '<g transform="translate(-2 -2)"><circle cx="14" cy="14" r="8"/></g>',
    );
  });

  it('keeps samples that exist, resolving aliases and dropping hidden or missing ones', () => {
    expect(loaded.set.samples).toEqual(['home', 'arrow-up']);
  });

  it('keeps only categories with visible members', () => {
    expect(Object.fromEntries(loaded.categories)).toEqual({
      Buildings: ['home'],
      Arrows: ['arrow-up', 'arrow-down'],
    });
  });
});

describe('prepareIcons', () => {
  it('sanitizes, counts changes, and rejects what cannot be made safe', () => {
    const result = prepareIcons([
      { name: 'ok', body: '<path d="M0 0h24"/>', width: 24, height: 24 },
      { name: 'evil', body: '<path d="M0 0" onclick="alert(1)"/>', width: 24, height: 24 },
      { name: 'Bad Name', body: '<path/>', width: 24, height: 24 },
      { name: 'flat', body: '<path/>', width: 0, height: 0 },
      { name: 'huge', body: `<path d="${'M0 0'.repeat(200_000)}"/>`, width: 24, height: 24 },
      // A color pasted into path data (seen in upstream Blobmoji skin-tone files).
      { name: 'broken', body: '<path d="M1 2.#232020.8z"/>', width: 24, height: 24 },
    ]);

    expect(result.icons.map((i) => i.name)).toEqual(['ok', 'evil']);
    expect(result.icons[1]?.body).not.toContain('onclick');
    expect(result.modified).toEqual(['evil']);
    expect(result.rejected.map((r) => r.name)).toEqual(['Bad Name', 'flat', 'huge', 'broken']);
  });
});

describe('selectSets', () => {
  const set = (prefix: string, licenseTier: SourceSet['licenseTier']) =>
    ({ ...toSourceSet(prefix, info), licenseTier }) satisfies SourceSet;
  const sets = [set('a', 'A'), set('b', 'B'), set('x', 'X')];

  it('filters by tier and never selects tier X', () => {
    expect(selectSets(sets, { tiers: ['A'] }).map((s) => s.prefix)).toEqual(['a']);
    expect(selectSets(sets, { tiers: ['A', 'B', 'C'] }).map((s) => s.prefix)).toEqual(['a', 'b']);
  });

  it('filters by prefix', () => {
    expect(selectSets(sets, { tiers: ['A', 'B'], prefixes: ['b'] }).map((s) => s.prefix)).toEqual([
      'b',
    ]);
  });
});

describe('slugify', () => {
  it('makes kebab-case slugs from category labels', () => {
    expect(slugify('Audio & Video')).toBe('audio-and-video');
    expect(slugify('  UI / UX  ')).toBe('ui-ux');
  });
});

describe('renderCatalog', () => {
  it('totals tiers, groups by type and escapes table cells', () => {
    const sets = [
      { ...toSourceSet('a', info), total: 10 },
      { ...toSourceSet('l', { ...info, name: 'Pipe | Set', category: 'Logos' }), total: 5 },
      {
        ...toSourceSet('x', { ...info, license: { title: 'GPL', spdx: 'GPL-3.0-only' } }),
        total: 2,
      },
    ];
    const md = renderCatalog(sets, { iconifyVersion: '1.0.0', date: '2026-01-01' });

    expect(md).toContain('| **A** | MIT, Apache-2.0');
    expect(md).toMatch(/\| \*\*A\*\* .*\| 15 \|/);
    expect(md).toMatch(/\| \*\*X\*\* .*\| 2 \|/);
    expect(md).toContain('## Logos & brands — 1 sets, 5 icons');
    expect(md).toContain('Pipe \\| Set');
    expect(md).toContain('## Sources outside Iconify');
  });
});
