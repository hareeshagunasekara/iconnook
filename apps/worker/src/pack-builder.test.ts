import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { buildSprite, buildZip, licensesMarkdown, type PackIcon } from './pack-builder.js';

const icon = (overrides: Partial<PackIcon> = {}): PackIcon => ({
  set: 'tabler',
  name: 'home',
  body: '<path fill="none" stroke="currentColor" stroke-width="2" d="M5 12h14"/>',
  width: 24,
  height: 24,
  setName: 'Tabler Icons',
  author: 'Paweł Kuna',
  licenseSpdx: 'MIT',
  licenseUrl: 'https://opensource.org/licenses/MIT',
  tier: 'A',
  ...overrides,
});

const fakePng = (svg: string, width: number) =>
  Promise.resolve(new TextEncoder().encode(`PNG:${String(width)}:${String(svg.length)}`));

describe('buildZip', () => {
  it('contains every icon as SVG plus LICENSES.md', async () => {
    const icons = [
      icon(),
      icon({ name: 'star' }),
      icon({
        set: 'mdi',
        name: 'home',
        setName: 'Material Design Icons',
        licenseSpdx: 'Apache-2.0',
      }),
    ];
    const pack = await buildZip(icons, [], { icons: [], format: 'zip' } as never, fakePng);
    const files = unzipSync(pack.bytes);

    expect(Object.keys(files).sort()).toEqual([
      'LICENSES.md',
      'svg/mdi/home.svg',
      'svg/tabler/home.svg',
      'svg/tabler/star.svg',
    ]);
    expect(pack.contentType).toBe('application/zip');
    expect(strFromU8(files['svg/tabler/home.svg'] ?? new Uint8Array())).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/,
    );
  });

  it('applies color and stroke, and adds PNGs at the requested size (longer side)', async () => {
    const tall = icon({ name: 'tall', width: 12, height: 24 });
    const pack = await buildZip(
      [icon(), tall],
      [],
      { icons: [], format: 'zip', color: '#ff0000', stroke: 1.5, png: 64 } as never,
      fakePng,
    );
    const files = unzipSync(pack.bytes);
    const svg = strFromU8(files['svg/tabler/home.svg'] ?? new Uint8Array());

    expect(svg).toContain('color="#ff0000"');
    expect(svg).toContain('stroke-width="1.5"');
    expect(strFromU8(files['png/tabler/home.png'] ?? new Uint8Array())).toMatch(/^PNG:64:/);
    expect(strFromU8(files['png/tabler/tall.png'] ?? new Uint8Array())).toMatch(/^PNG:32:/);
  });

  it('reports progress', async () => {
    const seen: number[] = [];
    await buildZip(
      Array.from({ length: 60 }, (_, i) => icon({ name: `i${String(i)}` })),
      [],
      { icons: [], format: 'zip' } as never,
      fakePng,
      (f) => {
        seen.push(f);
        return Promise.resolve();
      },
    );
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every((f) => f >= 0 && f < 1)).toBe(true);
  });
});

describe('licensesMarkdown', () => {
  it('lists each set once, with credit lines only where the license requires them', () => {
    const md = licensesMarkdown(
      [
        icon(),
        icon({ name: 'star' }),
        icon({
          set: 'game-icons',
          name: 'sword',
          setName: 'Game Icons',
          author: 'Lorc',
          licenseSpdx: 'CC-BY-3.0',
          tier: 'B',
        }),
        icon({
          set: 'openmoji',
          name: 'smile',
          setName: 'OpenMoji',
          author: 'OpenMoji',
          licenseSpdx: 'CC-BY-SA-4.0',
          tier: 'C',
        }),
      ],
      ['tabler:removed-icon'],
    );

    expect(md.match(/## Tabler Icons/g)).toHaveLength(1);
    expect(md).toContain('- Icons in this pack: 2');
    expect(md).toMatch(/## Tabler Icons[\s\S]*No attribution required/);
    expect(md).toMatch(
      /## Game Icons[\s\S]*Attribution required[\s\S]*Icons from Game Icons by Lorc, licensed under CC-BY-3.0/,
    );
    expect(md).toMatch(/## OpenMoji[\s\S]*same license/);
    expect(md).toContain('- tabler:removed-icon');
  });
});

describe('buildSprite', () => {
  it('makes one <symbol> per icon with ids "set-name" and unique inner ids', () => {
    const gradient = '<defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M0 0h24"/>';
    const pack = buildSprite([icon({ body: gradient }), icon({ set: 'mdi', body: gradient })], {
      icons: [],
      format: 'sprite',
    } as never);
    const sprite = strFromU8(pack.bytes);

    expect(pack.contentType).toBe('image/svg+xml');
    expect(sprite.match(/<symbol /g)).toHaveLength(2);
    expect(sprite).toContain('<symbol id="tabler-home" viewBox="0 0 24 24">');
    expect(sprite).toContain('<symbol id="mdi-home" viewBox="0 0 24 24">');
    const ids = [...sprite.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2); // the two icons' gradients can't collide
  });

  it('re-sanitizes every symbol', () => {
    const pack = buildSprite([icon({ body: '<path onclick="alert(1)" d="M0 0"/>' })], {
      icons: [],
      format: 'sprite',
    } as never);
    expect(strFromU8(pack.bytes)).not.toContain('onclick');
  });
});
