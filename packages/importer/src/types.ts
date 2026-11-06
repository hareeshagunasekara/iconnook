import type { LicenseTier } from '@iconnook/core';
import type { schema } from '@iconnook/db';

export type SetType = (typeof schema.setType.enumValues)[number];

/** Set-level metadata, independent of where it came from. */
export interface SourceSet {
  prefix: string;
  name: string;
  total: number;
  authorName: string | null;
  authorUrl: string | null;
  licenseSpdx: string;
  licenseTitle: string;
  licenseUrl: string | null;
  licenseTier: LicenseTier;
  type: SetType;
  /** Upstream grouping (e.g. Iconify's "UI 24px"), kept for the catalog. */
  sourceCategory: string;
  isColor: boolean;
  gridSize: number | null;
  version: string | null;
}

/** A raw icon from a source, before sanitization. */
export interface SourceIcon {
  name: string;
  /** Inner SVG markup with any source transformations (rotate/flip/offset) already applied. */
  body: string;
  width: number;
  height: number;
}

export interface LoadedSet {
  set: SourceSet;
  icons: SourceIcon[];
  /** Alternative names per icon (become search synonyms). */
  synonyms: Map<string, string[]>;
  /** Category label → icon names. */
  categories: Map<string, string[]>;
}

/** Adapter interface: add a new source by implementing this (docs/standards/code-principles.md, O in SOLID). */
export interface IconSource {
  readonly id: string;
  listSets(): Promise<SourceSet[]>;
  loadSet(prefix: string): Promise<LoadedSet>;
}
