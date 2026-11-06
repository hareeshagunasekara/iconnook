export const CODE_FORMATS = ['svg', 'jsx', 'vue', 'svelte', 'datauri', 'css'] as const;
export type CodeFormat = (typeof CODE_FORMATS)[number];

export interface CodeOptions {
  /** e.g. "tabler" + "arrow-left" → component `TablerArrowLeft`, CSS class `icon-tabler-arrow-left`. */
  set: string;
  name: string;
  /** Multicolor icons can't be recolored with a CSS mask, so CSS uses background-image instead. */
  isColor: boolean;
}

const pascal = (s: string) =>
  s
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');

/** Component names must start with a letter (some icon names start with digits, e.g. "123"). */
export const componentName = (set: string, name: string) => {
  const base = pascal(`${set}-${name}`);
  return /^[A-Za-z]/.test(base) ? base : `Icon${base}`;
};

const camel = (attr: string) => attr.replace(/[-:]([a-z])/g, (_, c: string) => c.toUpperCase());

function styleToObject(style: string): string {
  const entries = style
    .split(';')
    .map((d) => d.split(':').map((p) => p.trim()))
    .filter((p): p is [string, string] => p.length === 2 && p[0] !== '' && p[1] !== '')
    .map(([k, v]) => `${camel(k)}: ${JSON.stringify(v)}`);
  return `{{ ${entries.join(', ')} }}`;
}

/** Converts sanitized SVG XML to JSX: camelCase attributes, class → className, style → object. */
export function toJsx(svgXml: string): string {
  return svgXml.replace(/\s([a-zA-Z:-]+)="([^"]*)"/g, (_, attr: string, value: string) => {
    if (attr === 'xmlns' || attr.startsWith('xmlns:'))
      return ` ${attr === 'xmlns' ? attr : camel(attr)}="${value}"`;
    if (attr === 'class') return ` className="${value}"`;
    if (attr === 'style') return ` style=${styleToObject(value)}`;
    return ` ${attr.includes('-') || attr.includes(':') ? camel(attr) : attr}="${value}"`;
  });
}

export const toDataUri = (svgXml: string) => `data:image/svg+xml,${encodeURIComponent(svgXml)}`;

/** Code snippet for an already-customized, sanitized standalone SVG. */
export function toCode(format: CodeFormat, svgXml: string, opts: CodeOptions): string {
  const component = componentName(opts.set, opts.name);
  switch (format) {
    case 'svg':
      return svgXml;
    case 'jsx': {
      const jsx = toJsx(svgXml).replace(/^<svg /, '<svg {...props} ');
      return `export function ${component}(props) {\n  return (\n    ${jsx}\n  );\n}\n`;
    }
    case 'vue':
      return `<template>\n  ${svgXml}\n</template>\n`;
    case 'svelte':
      return `<script>\n  let props = $props();\n</script>\n\n${svgXml.replace(/^<svg /, '<svg {...props} ')}\n`;
    case 'datauri':
      return toDataUri(svgXml);
    case 'css': {
      const uri = toDataUri(svgXml);
      const cls = `.icon-${opts.set}-${opts.name}`;
      return opts.isColor
        ? `${cls} {\n  display: inline-block;\n  width: 1em;\n  height: 1em;\n  background: url("${uri}") no-repeat center / contain;\n}\n`
        : `${cls} {\n  display: inline-block;\n  width: 1em;\n  height: 1em;\n  background-color: currentColor;\n  mask: url("${uri}") no-repeat center / contain;\n}\n`;
    }
  }
}
