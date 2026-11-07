import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as kawaii from 'react-kawaii';

import type { IconSource, LoadedSet, SourceIcon, SourceSet } from '../types.js';
import { fetchGithubFiles, fetchPinned, unzip } from './fetch.js';
import { iconName, svgFileToIcon } from './svg-file.js';

/**
 * Icon sets that aren't in @iconify/json. Each license was verified at its official source on
 * 2026-11-07 (see SOURCES.md); every download is pinned to a commit, hash or npm version.
 */
interface ExternalSet {
  set: Omit<SourceSet, 'total'>;
  load(): Promise<SourceIcon[]>;
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const SVG_LOADERS_COMMIT = '561eacac2f46e2b02e48df547324dcea94a6a1c5';
const BLOBMOJI_COMMIT = '7dd14d2b0141693485fd26bc35817bd290352a79';
const AMCHARTS_ZIP = {
  url: 'https://download.amcharts.com/1.0/amcharts_weather_icons_1.0.0.zip',
  sha256: '20b84cabd8402b2e418383b90a9a1382fc890db5c90849a9141a2b63da78e35e',
};

/** SVG Loaders draw in white for dark backgrounds; currentColor makes them follow the text color. */
export function loaderToCurrentColor(body: string): string {
  return body.replace(/(fill|stroke)="#fff(?:fff)?"/gi, '$1="currentColor"');
}

/** emoji-test.txt → code point sequence ("1f469_200d_1f4bb", no FE0F) → CLDR name. */
export function emojiNames(emojiTest: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const line of emojiTest.split('\n')) {
    const match =
      /^([0-9A-F ]+?)\s*;\s*(fully-qualified|component)\s*#\s*\S+\s+E[\d.]+\s+(.+)$/.exec(line);
    if (!match?.[1] || !match[3]) continue;
    const key = match[1]
      .toLowerCase()
      .split(' ')
      .filter((cp) => cp !== 'fe0f')
      .join('_');
    if (!names.has(key)) names.set(key, match[3].trim());
  }
  return names;
}

const KAWAII_CHARACTERS = Object.entries(kawaii).filter(
  (entry): entry is [string, FunctionComponent<kawaii.KawaiiProps>] =>
    /^[A-Z]/.test(entry[0]) && typeof entry[1] === 'function',
);

/** Body colors, one per character in turn (the library draws every character in one green). */
const KAWAII_COLORS = ['#FFC567', '#F9A3C0', '#8FD8AE', '#7FC6F0', '#FB8A7A', '#C6B0F2'];

/** Every React Kawaii character in every mood, rendered to static SVG. */
export function renderKawaii(): SourceIcon[] {
  const icons: SourceIcon[] = [];
  for (const [index, [component, Character]] of KAWAII_CHARACTERS.entries()) {
    const color = KAWAII_COLORS[index % KAWAII_COLORS.length] ?? '#FFC567';
    for (const mood of kawaii.MOODS) {
      const name = `${iconName(component)}-${mood}`;
      const svg = renderToStaticMarkup(createElement(Character, { mood, color, uniqueId: name }));
      const icon = svgFileToIcon(name, svg);
      if (icon) icons.push(icon);
    }
  }
  return icons;
}

export const EXTERNAL_SETS: readonly ExternalSet[] = [
  {
    set: {
      prefix: 'svg-loaders',
      name: 'SVG Loaders',
      authorName: 'Sam Herbert',
      authorUrl: 'https://github.com/SamHerbert/SVG-Loaders',
      licenseSpdx: 'MIT',
      licenseTitle: 'MIT',
      licenseUrl: `https://github.com/SamHerbert/SVG-Loaders/blob/${SVG_LOADERS_COMMIT}/LICENSE.md`,
      licenseTier: 'A',
      type: 'animated',
      sourceCategory: 'Animated',
      isColor: false,
      gridSize: null,
      version: SVG_LOADERS_COMMIT.slice(0, 7),
      samples: ['tail-spin', 'three-dots', 'puff', 'oval', 'bars', 'rings'],
    },
    async load() {
      const files = await fetchGithubFiles('SamHerbert/SVG-Loaders', SVG_LOADERS_COMMIT, (p) =>
        /^svg-loaders\/[^/]+\.svg$/.test(p),
      );
      return files.flatMap(({ path, bytes }) => {
        const icon = svgFileToIcon(iconName(path.slice('svg-loaders/'.length, -4)), decode(bytes));
        return icon ? [{ ...icon, body: loaderToCurrentColor(icon.body) }] : [];
      });
    },
  },
  {
    set: {
      prefix: 'amcharts-weather',
      name: 'amCharts Animated Weather',
      authorName: 'amCharts',
      authorUrl: 'https://www.amcharts.com/free-animated-svg-weather-icons/',
      licenseSpdx: 'CC-BY-4.0',
      licenseTitle: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      licenseTier: 'B',
      type: 'animated',
      sourceCategory: 'Animated',
      isColor: true,
      gridSize: 64,
      version: '1.0.0',
      samples: ['day', 'cloudy-day-1', 'rainy-1', 'snowy-1', 'thunder', 'night'],
    },
    async load() {
      const files = unzip(await fetchPinned(AMCHARTS_ZIP.url, AMCHARTS_ZIP.sha256));
      return [...files].flatMap(([path, bytes]) => {
        // The animated variants; the sprite sheet bundles all of them and isn't an icon.
        const match = /^animated\/([^/]+)\.svg$/.exec(path);
        if (!match?.[1] || match[1] === 'weather-sprite') return [];
        const icon = svgFileToIcon(iconName(match[1]), decode(bytes));
        return icon ? [icon] : [];
      });
    },
  },
  {
    set: {
      prefix: 'blobmoji',
      name: 'Blobmoji',
      authorName: 'Google and the Blobmoji contributors',
      authorUrl: 'https://github.com/C1710/blobmoji',
      licenseSpdx: 'Apache-2.0',
      licenseTitle: 'Apache License 2.0',
      licenseUrl: `https://github.com/C1710/blobmoji/blob/${BLOBMOJI_COMMIT}/LICENSE`,
      licenseTier: 'A',
      type: 'emoji',
      sourceCategory: 'Emoji',
      isColor: true,
      gridSize: 128,
      version: BLOBMOJI_COMMIT.slice(0, 7),
      samples: [
        'grinning-face',
        'smiling-face-with-heart-eyes',
        'thinking-face',
        'pleading-face',
        'party-popper',
        'red-heart',
      ],
    },
    async load() {
      const files = await fetchGithubFiles(
        'C1710/blobmoji',
        BLOBMOJI_COMMIT,
        (p) => p === 'emoji-test.txt' || /^svg(15)?\/[^/]+\.svg$/.test(p),
      );
      const test = files.find((f) => f.path === 'emoji-test.txt');
      if (!test) throw new Error('blobmoji: emoji-test.txt missing');
      const names = emojiNames(decode(test.bytes));
      const icons = new Map<string, SourceIcon>();
      for (const { path, bytes } of files) {
        const file = /^svg(15)?\/(.+)\.svg$/.exec(path)?.[2];
        if (!file) continue;
        // Files are named either by code points ("emoji_u1f600") or by their emoji name.
        const codepoints = /^emoji_u([0-9a-f_]+)$/.exec(file)?.[1];
        const label = codepoints
          ? names.get(
              codepoints
                .split('_')
                .filter((cp) => cp !== 'fe0f')
                .join('_'),
            )
          : file;
        if (!label) continue; // not a standard emoji (e.g. an internal glyph)
        const icon = svgFileToIcon(iconName(label), decode(bytes));
        if (icon) icons.set(icon.name, icon);
      }
      return [...icons.values()];
    },
  },
  {
    set: {
      prefix: 'react-kawaii',
      name: 'React Kawaii',
      authorName: 'Miuki Miu',
      authorUrl: 'https://github.com/elizabetdev/react-kawaii',
      licenseSpdx: 'MIT',
      licenseTitle: 'MIT',
      licenseUrl: 'https://github.com/elizabetdev/react-kawaii/blob/main/LICENSE.md',
      licenseTier: 'A',
      type: 'cute',
      sourceCategory: 'Cute',
      isColor: true,
      gridSize: null,
      version: '1.6.0',
      samples: [
        'cat-blissful',
        'ice-cream-happy',
        'ghost-lovestruck',
        'planet-excited',
        'mug-happy',
        'backpack-blissful',
      ],
    },
    load: () => Promise.resolve(renderKawaii()),
  },
];

export const externalSource: IconSource = {
  id: 'external',
  listSets() {
    return Promise.resolve(EXTERNAL_SETS.map(({ set }) => ({ ...set, total: 0 })));
  },
  async loadSet(prefix): Promise<LoadedSet> {
    const entry = EXTERNAL_SETS.find((e) => e.set.prefix === prefix);
    if (!entry) throw new Error(`Unknown external set "${prefix}"`);
    const icons = (await entry.load()).sort((a, b) => a.name.localeCompare(b.name));
    const names = new Set(icons.map((i) => i.name));
    return {
      set: {
        ...entry.set,
        total: icons.length,
        samples: entry.set.samples.filter((s) => names.has(s)),
      },
      icons,
      synonyms: new Map(),
      categories: new Map(),
    };
  },
};
