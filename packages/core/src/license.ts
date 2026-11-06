/**
 * License tiers from ADR 0002 (docs/adr/0002-license-tiers.md).
 * A: no visible attribution · B: credit required · C: credit + share-alike · X: never import.
 */
export type LicenseTier = 'A' | 'B' | 'C' | 'X';

const TIER_BY_SPDX: Readonly<Record<string, LicenseTier>> = {
  MIT: 'A',
  'Apache-2.0': 'A',
  ISC: 'A',
  'CC0-1.0': 'A',
  Unlicense: 'A',
  'BSD-3-Clause': 'A',
  'OFL-1.1': 'A',
  'MPL-2.0': 'A',
  'CC-BY-3.0': 'B',
  'CC-BY-4.0': 'B',
  'CC-BY-SA-3.0': 'C',
  'CC-BY-SA-4.0': 'C',
};

/** Unknown licenses fall into tier X: a license we haven't reviewed is never imported. */
export function licenseTier(spdx: string): LicenseTier {
  return TIER_BY_SPDX[spdx.trim()] ?? 'X';
}

export type ImportableTier = Exclude<LicenseTier, 'X'>;

export function isImportable(tier: LicenseTier): tier is ImportableTier {
  return tier !== 'X';
}

export function requiresAttribution(tier: LicenseTier): boolean {
  return tier === 'B' || tier === 'C';
}
