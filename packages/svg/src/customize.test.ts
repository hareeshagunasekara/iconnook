import { describe, expect, it } from 'vitest';

import { componentName, toCode, toJsx } from './code.js';
import { customizeSvg } from './customize.js';

const icon = {
  body: '<path fill="none" stroke="currentColor" stroke-width="2" d="M5 12h14"/>',
  width: 24,
  height: 24,
};

describe('customizeSvg', () => {
  it('returns a standalone, namespaced SVG with no options', () => {
    expect(customizeSvg(icon)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M5 12h14"/></svg>',
    );
  });

  it('applies color, size and stroke width', () => {
    const out = customizeSvg(icon, { color: '#FF0000', size: 48, strokeWidth: 1.5 });
    expect(out).toContain('width="48" height="48"');
    expect(out).toContain('color="#FF0000"');
    expect(out).toContain('stroke-width="1.5"');
  });

  it('keeps the aspect ratio for non-square icons', () => {
    expect(customizeSvg({ ...icon, width: 32, height: 16 }, { size: 64 })).toContain(
      'width="64" height="32"',
    );
    expect(customizeSvg({ ...icon, width: 25.9, height: 24 }, { size: 24 })).toContain(
      'width="24" height="22.239"',
    );
    expect(customizeSvg({ ...icon, width: 16, height: 32 }, { size: 64 })).toContain(
      'width="32" height="64"',
    );
  });

  it.each([
    [{ color: 'red' }, /color/],
    [{ color: '#12345' }, /color/],
    [{ color: '" onload="alert(1)' }, /color/],
    [{ size: 4 }, /size/],
    [{ size: 99_999 }, /size/],
    [{ size: Number.NaN }, /size/],
    [{ strokeWidth: 10 }, /strokeWidth/],
    [{ strokeWidth: 0 }, /strokeWidth/],
  ])('rejects invalid customization %o', (c, message) => {
    expect(() => customizeSvg(icon, c)).toThrow(message);
  });

  it('re-sanitizes: a malicious stored body cannot leak through customization', () => {
    const out = customizeSvg(
      { ...icon, body: '<path onclick="alert(1)" d="M0 0"/>' },
      { size: 24 },
    );
    expect(out).not.toContain('onclick');
  });

  it('fails closed if the customized SVG cannot be sanitized', () => {
    expect(() => customizeSvg({ ...icon, body: '<g/>'.repeat(6_000) })).toThrow(/sanitization/);
  });
});

describe('code formats', () => {
  const svg = customizeSvg(icon);
  const opts = { set: 'tabler', name: 'arrow-left', isColor: false };

  it('names components in PascalCase and never starts with a digit', () => {
    expect(componentName('tabler', 'arrow-left')).toBe('TablerArrowLeft');
    expect(componentName('fluent-emoji', '123')).toBe('FluentEmoji123');
    expect(componentName('1', 'x')).toBe('Icon1X');
  });

  it('converts attributes to JSX', () => {
    const jsx = toJsx(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path class="a" fill-rule="evenodd" xlink:href="#b" style="stop-color: red; opacity:0.5"/></svg>',
    );
    expect(jsx).toContain('className="a"');
    expect(jsx).toContain('fillRule="evenodd"');
    expect(jsx).toContain('xlinkHref="#b"');
    expect(jsx).toContain('xmlnsXlink=');
    expect(jsx).toContain('style={{ "stopColor": "red", "opacity": "0.5" }}');
  });

  describe('never turns icon content into code (security review finding)', () => {
    // Passes the SVG sanitizer unchanged (braces and text are harmless in SVG/HTML) …
    const evil = customizeSvg({
      body:
        '<path style="[alert(document.domain)]:x;fill:red" d="M0 0h24"/><text>{alert(1)}</text>' +
        '<title>{{ \'\'.constructor.constructor(\'alert(2)\')() }}</title><path fill="{alert(3)}" d="M1 1"/>',
      width: 24,
      height: 24,
    });
    const body = (code: string) => code.slice(code.indexOf('<svg'));

    it('JSX: no expressions or computed keys from the icon', () => {
      const out = body(toCode('jsx', evil, opts));
      expect(out).not.toContain('{alert');
      expect(out).not.toContain('[alert');
      expect(out).toContain('&#123;alert(1)&#125;');
      expect(out).toContain('style={{ "fill": "red" }}'); // valid properties kept, quoted
    });

    it('Svelte: braces in text and attributes are inert', () => {
      const out = body(toCode('svelte', evil, opts));
      expect(out).not.toMatch(/\{(?!\.\.\.props\})/); // only the props spread is a real expression
      expect(out).toContain('fill="&#123;alert(3)&#125;"');
    });

    it('Vue: no mustache expressions, and the icon is not compiled at all', () => {
      const out = toCode('vue', evil, opts);
      expect(out).not.toContain('{{');
      expect(out).toContain('<svg v-pre ');
    });
  });

  it('produces every format', () => {
    expect(toCode('svg', svg, opts)).toBe(svg);
    expect(toCode('jsx', svg, opts)).toMatch(
      /^export function TablerArrowLeft\(props\)[\s\S]*<svg \{\.\.\.props\} /,
    );
    expect(toCode('jsx', svg, opts)).toContain('strokeWidth="2"');
    expect(toCode('vue', svg, opts)).toMatch(/^<template>\n {2}<svg /);
    expect(toCode('svelte', svg, opts)).toContain('<svg {...props} ');
    expect(toCode('datauri', svg, opts)).toMatch(/^data:image\/svg\+xml,%3Csvg/);
    expect(toCode('css', svg, opts)).toContain('mask: url("data:image/svg+xml,');
    expect(toCode('css', svg, { ...opts, isColor: true })).toContain(
      'background: url("data:image/svg+xml,',
    );
  });
});
