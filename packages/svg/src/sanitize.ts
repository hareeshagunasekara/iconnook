import createDOMPurify, { type Config } from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * SVG sanitizer — the single gate every SVG passes before it is stored (docs/standards/security.md).
 * Allowlist-based (DOMPurify SVG profile) plus IconNook rules; fails closed on anything unexpected.
 */

export const MAX_SVG_BYTES = 512 * 1024;
export const MAX_ELEMENTS = 5_000;

export type SanitizeResult =
  | {
      ok: true;
      /** Sanitized `<svg>` element markup (HTML serialization, for inlining in pages). */
      svg: string;
      /** Same element as standalone XML with proper namespaces (for .svg files and data URIs). */
      xml: string;
      /** Inner markup of the sanitized `<svg>` (what we store). */
      body: string;
      /** How many elements/attributes the sanitizer removed (0 = input was already clean). */
      removed: number;
    }
  | { ok: false; reason: string };

const { window } = new JSDOM('');
const purify = createDOMPurify(window);
const xmlSerializer = new window.XMLSerializer();

/** Removals made by our hooks (DOMPurify only records its own); reset per sanitizeSvg call. */
let hookRemovals = 0;

const ANIMATION_TAGS = ['animate', 'set', 'animateMotion', 'animateTransform'];
const ANIMATION_ATTRS = [
  'attributeName',
  'attributeType',
  'begin',
  'dur',
  'end',
  'repeatCount',
  'repeatDur',
  'restart',
  'values',
  'keyTimes',
  'keySplines',
  'keyPoints',
  'calcMode',
  'from',
  'to',
  'by',
  'additive',
  'accumulate',
  'type',
  'path',
  'rotate',
];

const CONFIG: Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // DOMPurify blocks <use> and SMIL animations by default; real icon sets need them (e.g. line-md,
  // svg-spinners). They are re-allowed here and guarded by the hooks below (#-only refs, safe targets).
  ADD_TAGS: ['use', ...ANIMATION_TAGS],
  ADD_ATTR: ANIMATION_ATTRS,
  // Icons never need links, embedded HTML, raster images or scripts.
  FORBID_TAGS: ['a', 'foreignObject', 'image', 'script', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['xml:base'],
  ALLOW_DATA_ATTR: false,
  RETURN_DOM: true,
};

const ANIMATION_TAG_SET = new Set(ANIMATION_TAGS.map((t) => t.toLowerCase()));
const URL_FUNCTION = /url\(([^)]*)\)?/gi;
const UNSAFE_CSS = /@import|expression\s*\(|javascript:|-moz-binding|behavior\s*:/i;
const UNSAFE_SCHEME = /javascript:|vbscript:|data:/i;

/** True if any url(...) in the value points anywhere other than an in-document #fragment. */
function hasExternalUrl(value: string): boolean {
  for (const [, inner = ''] of value.matchAll(URL_FUNCTION)) {
    const target = inner
      .trim()
      .replace(/^(['"])(.*)\1$/s, '$2')
      .trim();
    if (!target.startsWith('#')) return true;
  }
  return false;
}

function isUnsafeCss(css: string): boolean {
  return UNSAFE_CSS.test(css) || hasExternalUrl(css);
}

purify.addHook('uponSanitizeElement', (node, data) => {
  const tag = data.tagName.toLowerCase();
  const el = node as Element;
  const remove = () => {
    el.parentNode?.removeChild(el);
    hookRemovals++;
  };

  // <style> may only contain plain, self-contained CSS.
  if (tag === 'style' && isUnsafeCss(el.textContent)) {
    remove();
    return;
  }

  // SMIL animations can rewrite href/event attributes to script URLs — only allow harmless ones.
  if (ANIMATION_TAG_SET.has(tag)) {
    const target = (el.getAttribute('attributeName') ?? '').trim().toLowerCase();
    const values = ['values', 'from', 'to', 'by'].map((a) => el.getAttribute(a) ?? '').join(' ');
    if (/(^|:)href$|^on/.test(target) || target === 'style' || UNSAFE_SCHEME.test(values)) remove();
  }
});

purify.addHook('afterSanitizeAttributes', (el) => {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value.trim();
    const isRef = name === 'href' || name === 'xlink:href';

    if (
      (isRef && !value.startsWith('#')) ||
      (name === 'style' && isUnsafeCss(value)) ||
      (!isRef && name !== 'style' && hasExternalUrl(value)) ||
      UNSAFE_SCHEME.test(value)
    ) {
      el.removeAttribute(attr.name);
      hookRemovals++;
    }
  }
});

/** Sanitizes a complete `<svg>…</svg>` document. Never modify the output without sanitizing again. */
export function sanitizeSvg(input: string): SanitizeResult {
  if (Buffer.byteLength(input, 'utf8') > MAX_SVG_BYTES) {
    return { ok: false, reason: `larger than ${String(MAX_SVG_BYTES)} bytes` };
  }
  if (/<!(DOCTYPE|ENTITY)/i.test(input)) {
    return { ok: false, reason: 'DOCTYPE/ENTITY declarations are not allowed' };
  }

  let fragment: Node;
  hookRemovals = 0;
  try {
    fragment = purify.sanitize(input, CONFIG) as unknown as Node;
  } catch (error) {
    return { ok: false, reason: `sanitizer error: ${String(error)}` };
  }

  const root = fragment as Element;
  const svgs = Array.from(root.children);
  const svg = svgs[0];
  if (svgs.length !== 1 || svg?.tagName.toLowerCase() !== 'svg') {
    return { ok: false, reason: 'input must be a single <svg> element' };
  }
  if (svg.getElementsByTagName('*').length > MAX_ELEMENTS) {
    return { ok: false, reason: `more than ${String(MAX_ELEMENTS)} elements` };
  }

  // DOMPurify always reports its own <body> wrapper as removed when returning a DOM; don't count it.
  const removed =
    purify.removed.filter((r) => !('element' in r && r.element.nodeName === 'BODY')).length +
    hookRemovals;
  return {
    ok: true,
    svg: svg.outerHTML,
    xml: xmlSerializer.serializeToString(svg),
    body: svg.innerHTML,
    removed,
  };
}
