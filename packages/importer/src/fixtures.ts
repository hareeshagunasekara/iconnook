import type { IconifyJSON } from '@iconify/types';

import { splitIconifySet, toSourceSet } from './sources/iconify.js';
import type { IconSource, LoadedSet } from './types.js';

/** A small Iconify-format set exercising every case the importer handles. Shapes are original, CC0. */
export function fixtureIconifySet(overrides: Partial<IconifyJSON> = {}): IconifyJSON {
  return {
    prefix: 'fixture-ui',
    info: {
      name: 'Fixture UI',
      total: 4,
      author: { name: 'IconNook', url: 'https://github.com/hareeshagunasekara/iconnook' },
      license: { title: 'MIT', spdx: 'MIT', url: 'https://opensource.org/licenses/MIT' },
      height: 24,
      category: 'UI 24px',
      palette: false,
      // alias → parent, duplicate, hidden and missing samples are all exercised
      samples: ['house', 'arrow-up', 'home', 'legacy', 'does-not-exist'],
    },
    width: 24,
    height: 24,
    icons: {
      home: { body: '<path d="M3 12 12 3l9 9v9H3z"/>' },
      'arrow-up': { body: '<path d="M12 4v16M5 11l7-7 7 7"/>' },
      narrow: { body: '<rect width="25.9" height="24"/>', width: 25.9 },
      offset: { body: '<circle cx="14" cy="14" r="8"/>', left: 2, top: 2, width: 24, height: 24 },
      legacy: { body: '<path d="M0 0h1"/>', hidden: true },
    },
    aliases: {
      house: { parent: 'home' },
      'arrow-down': { parent: 'arrow-up', vFlip: true },
      'old-alias': { parent: 'legacy' },
      'hidden-alias': { parent: 'home', hidden: true },
    },
    categories: {
      Buildings: ['home', 'legacy'],
      Arrows: ['arrow-up', 'arrow-down'],
      Empty: ['legacy'],
    },
    ...overrides,
  };
}

/** In-memory IconSource over Iconify-format sets, for tests. */
export function memorySource(
  sets: IconifyJSON[],
): IconSource & { replace: (set: IconifyJSON) => void } {
  const byPrefix = new Map(sets.map((s) => [s.prefix, s]));
  const load = (prefix: string): LoadedSet => {
    const data = byPrefix.get(prefix);
    if (!data?.info) throw new Error(`unknown fixture set ${prefix}`);
    return splitIconifySet(data, toSourceSet(prefix, data.info));
  };
  return {
    id: 'memory',
    listSets: () =>
      Promise.resolve(
        [...byPrefix.values()].flatMap((s) => (s.info ? [toSourceSet(s.prefix, s.info)] : [])),
      ),
    loadSet: (prefix) => Promise.resolve(load(prefix)),
    replace: (set) => {
      byPrefix.set(set.prefix, set);
    },
  };
}
