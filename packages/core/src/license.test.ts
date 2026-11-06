import { describe, expect, it } from 'vitest';

import { isImportable, licenseTier, requiresAttribution } from './license.js';

describe('licenseTier', () => {
  it.each([
    ['MIT', 'A'],
    ['Apache-2.0', 'A'],
    ['CC0-1.0', 'A'],
    ['OFL-1.1', 'A'],
    ['CC-BY-4.0', 'B'],
    ['CC-BY-SA-4.0', 'C'],
  ] as const)('maps %s to tier %s', (spdx, tier) => {
    expect(licenseTier(spdx)).toBe(tier);
  });

  it.each(['GPL-3.0-or-later', 'GPL-2.0-only', 'CC-BY-NC-SA-4.0'])(
    'rejects copyleft or non-commercial license %s as tier X',
    (spdx) => {
      expect(licenseTier(spdx)).toBe('X');
    },
  );

  it('treats unknown licenses as tier X', () => {
    expect(licenseTier('Some-Custom-License')).toBe('X');
    expect(licenseTier('')).toBe('X');
  });

  it('ignores surrounding whitespace', () => {
    expect(licenseTier(' MIT ')).toBe('A');
  });
});

describe('tier rules', () => {
  it('never imports tier X', () => {
    expect(isImportable('X')).toBe(false);
    expect(isImportable('A')).toBe(true);
  });

  it('requires attribution only for tiers B and C', () => {
    expect(requiresAttribution('A')).toBe(false);
    expect(requiresAttribution('B')).toBe(true);
    expect(requiresAttribution('C')).toBe(true);
  });
});
