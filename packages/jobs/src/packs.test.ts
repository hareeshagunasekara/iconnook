import { describe, expect, it } from 'vitest';

import { packId, packKey, PackRequest } from './packs.js';

describe('PackRequest', () => {
  it('accepts a valid request', () => {
    expect(
      PackRequest.safeParse({ icons: ['tabler:home', 'mdi:home'], format: 'zip', png: 64 }).success,
    ).toBe(true);
  });

  it.each([
    [{ icons: [], format: 'zip' }, 'empty'],
    [{ icons: ['tabler:home', 'tabler:home'], format: 'zip' }, 'duplicates'],
    [{ icons: ['Tabler:Home'], format: 'zip' }, 'bad ref'],
    [{ icons: ['tabler/home'], format: 'zip' }, 'bad separator'],
    [
      { icons: Array.from({ length: 501 }, (_, i) => `s:i${String(i)}`), format: 'zip' },
      'too many',
    ],
    [{ icons: ['tabler:home'], format: 'sprite', png: 64 }, 'png on sprite'],
    [{ icons: ['tabler:home'], format: 'zip', color: 'red' }, 'bad color'],
    [{ icons: ['tabler:home'], format: 'tar' }, 'bad format'],
  ])('rejects %o (%s)', (input, _reason) => {
    expect(PackRequest.safeParse(input).success).toBe(false);
  });
});

describe('packId', () => {
  const base = { icons: ['tabler:home', 'mdi:home'], format: 'zip' as const };

  it('is stable regardless of icon order and color case', () => {
    expect(packId(base)).toBe(packId({ ...base, icons: ['mdi:home', 'tabler:home'] }));
    expect(packId({ ...base, color: '#FF0000' })).toBe(packId({ ...base, color: '#ff0000' }));
    expect(packId(base)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('changes when the output would change', () => {
    expect(packId(base)).not.toBe(packId({ ...base, format: 'sprite' }));
    expect(packId(base)).not.toBe(packId({ ...base, png: 64 }));
    expect(packId(base)).not.toBe(packId({ ...base, stroke: 1.5 }));
  });

  it('maps to a storage key per format', () => {
    expect(packKey('abc', 'zip')).toBe('packs/abc.zip');
    expect(packKey('abc', 'sprite')).toBe('packs/abc.svg');
  });
});
