import { lookupCollection } from '@iconify/json';
import { describe, expect, it } from 'vitest';

import { APPROVED_SETS } from '../approved.js';
import { selectSets } from '../run.js';
import type { SourceSet } from '../types.js';
import { emojiNames, EXTERNAL_SETS, loaderToCurrentColor, renderKawaii } from './external.js';
import { gitBlobSha } from './fetch.js';
import { toSourceSet } from './iconify.js';
import { iconName, svgFileToIcon } from './svg-file.js';

describe('svgFileToIcon', () => {
  it('keeps root presentation attributes on a wrapping group', () => {
    const icon = svgFileToIcon(
      'puff',
      '<!-- by someone --><svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" stroke="#fff"><circle r="1"/></svg>',
    );
    expect(icon).toMatchObject({ name: 'puff', width: 44, height: 44 });
    expect(icon?.body).toBe('<g stroke="#fff"><circle r="1"/></g>');
  });

  it('accepts a lowercase viewbox, or falls back to a size with units', () => {
    expect(
      svgFileToIcon(
        'a',
        '<svg width="64" height="64" viewbox="0 0 64 64"><path d="M0 0h1"/></svg>',
      ),
    ).toMatchObject({ width: 64, height: 64 });
    expect(
      svgFileToIcon(
        'b',
        '<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd"><svg width="128px" height="128px"><path d="M0 0h1"/></svg>',
      ),
    ).toMatchObject({ width: 128, height: 128, body: '<path d="M0 0h1"/>' });
  });

  it('rejects files that are not SVG or have no size', () => {
    expect(svgFileToIcon('x', '<html></html>')).toBeNull();
    expect(svgFileToIcon('x', '<svg><path d="M0 0"/></svg>')).toBeNull();
  });
});

describe('icon names', () => {
  it.each([
    ['Snowy_2', 'snowy-2'],
    ['IceCream', 'ice-cream'],
    ['piñata', 'pinata'],
    ['keycap: #', 'keycap-number-sign'],
    ['keycap: *', 'keycap-asterisk'],
    ['artist medium-dark skin tone', 'artist-medium-dark-skin-tone'],
  ])('%s → %s', (raw, name) => {
    expect(iconName(raw)).toBe(name);
  });

  it('maps emoji code points to CLDR names, ignoring FE0F', () => {
    const names = emojiNames(
      [
        '1F600                                                  ; fully-qualified     # 😀 E1.0 grinning face',
        '0023 FE0F 20E3                                         ; fully-qualified     # #️⃣ E0.6 keycap: #',
        '0023 20E3                                              ; unqualified         # #⃣ E0.6 keycap: #',
      ].join('\n'),
    );
    expect(names.get('1f600')).toBe('grinning face');
    expect(names.get('0023_20e3')).toBe('keycap: #');
  });
});

describe('external sets', () => {
  it('turn SVG Loaders white strokes and fills into currentColor', () => {
    expect(loaderToCurrentColor('<g stroke="#fff"><path fill="#FFFFFF"/></g>')).toBe(
      '<g stroke="currentColor"><path fill="currentColor"/></g>',
    );
  });

  it('render every React Kawaii character in every mood', () => {
    const icons = renderKawaii();
    expect(icons.length).toBeGreaterThanOrEqual(100);
    expect(icons.map((i) => i.name)).toContain('ice-cream-happy');
    expect(new Set(icons.map((i) => i.name)).size).toBe(icons.length);
  });

  it('declare a verified license, credit and kind for every set', () => {
    for (const { set } of EXTERNAL_SETS) {
      expect(set.licenseUrl).toMatch(/^https:\/\//);
      expect(set.authorName).toBeTruthy();
      expect(['A', 'B']).toContain(set.licenseTier);
      if (set.licenseTier !== 'A') expect(APPROVED_SETS).toContain(set.prefix);
    }
  });

  it('verify GitHub files by their git blob id', () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(gitBlobSha(new TextEncoder().encode('hello\n'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a',
    );
  });
});

describe('approved sets', () => {
  const set = (prefix: string, licenseTier: SourceSet['licenseTier']) =>
    ({ prefix, licenseTier }) as SourceSet;

  it('adds reviewed sets to the selected tiers but never Tier X', () => {
    const sets = [set('a', 'A'), set('twemoji', 'B'), set('other-b', 'B'), set('gpl', 'X')];
    const picked = selectSets(sets, { tiers: ['A'], approved: ['twemoji', 'gpl'] });
    expect(picked.map((s) => s.prefix)).toEqual(['a', 'twemoji']);
  });

  it('credits each set the way its licensor asks', async () => {
    const info = (await lookupCollection('streamline-emojis')).info;
    if (!info) throw new Error('no info');
    expect(toSourceSet('streamline-emojis', info)).toMatchObject({
      authorName: 'Streamline',
      authorUrl: 'https://www.streamlinehq.com',
      licenseTier: 'B',
      type: 'emoji',
    });
  });
});
