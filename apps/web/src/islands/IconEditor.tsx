import { useEffect, useId, useState } from 'preact/hooks';

import {
  addToCollection,
  announce,
  inCollection,
  onCollectionChange,
  removeFromCollection,
} from '../lib/collection';
import { UiIcon } from './UiIcon';

/**
 * Icon editor (Preact island), on the icon page and in the icon modal: live preview, customizing,
 * one-click copy in each code format, downloads and the collection. Server-rendered with defaults,
 * so preview and downloads work without JavaScript. The preview is an <img> of the API's sanitized
 * SVG, or the server-sanitized inline body; never client-built innerHTML.
 */

const FORMATS = [
  { id: 'svg', label: 'SVG' },
  { id: 'jsx', label: 'JSX' },
  { id: 'vue', label: 'Vue' },
  { id: 'svelte', label: 'Svelte' },
  { id: 'datauri', label: 'Data URI' },
  { id: 'css', label: 'CSS' },
] as const;
type Format = (typeof FORMATS)[number]['id'];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

interface Props {
  apiUrl: string;
  set: string;
  name: string;
  /** Multicolor icons can't be recolored. */
  isColor: boolean;
  /** Stroke-based icons can change stroke width. */
  hasStroke: boolean;
  /**
   * Server-rendered inline SVG of the uncustomized icon (same sanitized body the icon grids inline),
   * shown until the user customizes so the page's largest element needs no extra request. Empty in
   * the modal, which shows the API's SVG instead.
   */
  initialSvg?: string;
  /** For the anonymous download counter. */
  iconId: number;
}

function canonical(base: string, params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value !== undefined && value !== '') q.set(key, String(value));
  }
  const query = q.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * Copies text that is still being fetched. ClipboardItem accepts a promise, so Safari keeps the
 * click's permission while the code loads; elsewhere fall back to writeText after the fetch.
 */
async function copyFetched(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && 'write' in navigator.clipboard) {
    const blob = text.then((t) => new Blob([t], { type: 'text/plain' }));
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}

const BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--radius-button)] border-2 border-ink bg-surface px-3 font-semibold';

export function IconEditor({
  apiUrl,
  set,
  name,
  isColor,
  hasStroke,
  initialSvg = '',
  iconId,
}: Props) {
  const id = useId();
  const ref = `${set}:${name}`;
  const label = name.replaceAll('-', ' ');
  // false on the server and first render (no storage there), then synced from this browser.
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const sync = () => {
      setSaved(inCollection(ref));
    };
    sync();
    return onCollectionChange(sync);
  }, [ref]);
  /** Counts the download without delaying it (keepalive survives the navigation). */
  const countDownload = () => {
    void fetch(`${apiUrl}/v1/downloads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ iconId }),
      keepalive: true,
    }).catch(() => undefined);
  };
  const [color, setColor] = useState('');
  const [colorText, setColorText] = useState('');
  const [size, setSize] = useState(48);
  const [stroke, setStroke] = useState<number | undefined>(undefined);
  const [copied, setCopied] = useState<Format | null>(null);

  const base = `${apiUrl}/v1/icons/${set}/${name}`;
  const custom = { color: color ? color.toLowerCase() : undefined, stroke };
  const customized = color !== '' || stroke !== undefined;
  const svgDownload = canonical(`${base}.svg`, { ...custom, size, download: 1 });
  const pngDownload = canonical(`${base}.png`, {
    ...custom,
    size: Math.max(16, size),
    download: 1,
  });

  const copy = async (format: Format) => {
    const sized = format === 'svg' || format === 'jsx' || format === 'vue' || format === 'svelte';
    const url = canonical(`${base}/code`, { ...custom, format, size: sized ? size : undefined });
    const text = fetch(url)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ code: string }>)
          : Promise.reject(new Error(String(r.status))),
      )
      .then((r) => r.code);
    const formatLabel = FORMATS.find((f) => f.id === format)?.label ?? '';
    try {
      await copyFetched(text);
      setCopied(format);
      announce(`Copied ${formatLabel} code`);
      window.setTimeout(() => {
        setCopied((current) => (current === format ? null : current));
      }, 2_000);
    } catch {
      announce(`Copy failed. Download the SVG instead, or try again.`);
    }
  };

  const preview = (dark: boolean) =>
    !customized && initialSvg ? (
      <span
        role="img"
        aria-label={`${label} icon preview on ${dark ? 'dark' : 'light'} background`}
        class={`${dark ? 'text-[#eceef2]' : 'text-ink'} [&>svg]:h-28 [&>svg]:w-auto`}
        dangerouslySetInnerHTML={{ __html: initialSvg }}
      />
    ) : (
      <img
        src={canonical(`${base}.svg`, {
          ...custom,
          color: color ? color.toLowerCase() : dark && !isColor ? '#eceef2' : undefined,
          size: 256,
        })}
        alt={`${label} icon preview on ${dark ? 'dark' : 'light'} background`}
        width={112}
        height={112}
        class="max-h-full w-auto"
      />
    );

  return (
    <div class="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr]">
      <div class="grid grid-cols-2 content-start gap-2 md:grid-cols-1">
        <div class="flex aspect-square items-center justify-center rounded-[var(--radius-card)] border-2 border-ink bg-white p-6">
          {preview(false)}
        </div>
        <div class="flex aspect-square items-center justify-center rounded-[var(--radius-card)] border-2 border-ink bg-[#111317] p-6">
          {preview(true)}
        </div>
      </div>

      <div class="min-w-0 space-y-5">
        <fieldset class="space-y-3 rounded-[var(--radius-card)] border-2 border-ink/15 p-4">
          <legend class="px-1 font-display font-bold">Customize</legend>
          {isColor ? (
            <p class="text-sm text-text-muted">
              This is a multicolor icon, so its colors can't be changed.
            </p>
          ) : (
            <div class="flex flex-wrap items-center gap-2">
              <label for={`${id}-color`} class="w-16 text-sm">
                Color
              </label>
              <input
                id={`${id}-color`}
                type="color"
                value={HEX.test(color) && color.length === 7 ? color : '#000000'}
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  setColor(v);
                  setColorText(v);
                }}
                class="h-11 w-11 cursor-pointer rounded border border-border bg-transparent"
              />
              <label for={`${id}-hex`} class="sr-only">
                Color as hex code
              </label>
              <input
                id={`${id}-hex`}
                type="text"
                inputMode="text"
                placeholder="#000000"
                value={colorText}
                maxLength={7}
                aria-invalid={colorText !== '' && !HEX.test(colorText)}
                aria-describedby={`${id}-color-help`}
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  setColorText(v);
                  if (HEX.test(v)) setColor(v);
                  if (v === '') setColor('');
                }}
                class="min-h-11 w-28 rounded-lg border border-border bg-surface px-2 font-mono"
              />
              <span id={`${id}-color-help`} class="text-xs text-text-muted">
                {colorText !== '' && !HEX.test(colorText) ? 'Use #rgb or #rrggbb' : ''}
              </span>
            </div>
          )}
          <div class="flex items-center gap-2">
            <label for={`${id}-size`} class="w-16 text-sm">
              Size
            </label>
            <select
              id={`${id}-size`}
              value={size}
              onChange={(e) => {
                setSize(Number((e.target as HTMLSelectElement).value));
              }}
              class="min-h-11 rounded-lg border border-border bg-surface px-2"
            >
              {SIZES.map((s) => (
                <option value={s}>{s} px</option>
              ))}
            </select>
          </div>
          {hasStroke && (
            <div class="flex items-center gap-2">
              <label for={`${id}-stroke`} class="w-16 text-sm">
                Stroke
              </label>
              <input
                id={`${id}-stroke`}
                type="range"
                min={0.5}
                max={3}
                step={0.25}
                value={stroke ?? 2}
                onInput={(e) => {
                  setStroke(Number((e.target as HTMLInputElement).value));
                }}
                class="flex-1"
              />
              <output for={`${id}-stroke`} class="w-10 text-right font-mono text-sm">
                {stroke ?? 'auto'}
              </output>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setColor('');
              setColorText('');
              setSize(48);
              setStroke(undefined);
              announce('Customization reset');
            }}
            class="min-h-11 rounded-lg border border-border px-3 text-sm"
          >
            Reset
          </button>
        </fieldset>

        <div>
          <p id={`${id}-copy`} class="font-display font-bold">
            Copy code
          </p>
          <div role="group" aria-labelledby={`${id}-copy`} class="mt-2 flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button
                type="button"
                aria-label={copied === f.id ? `Copied ${f.label}` : `Copy as ${f.label}`}
                onClick={() => void copy(f.id)}
                class={BUTTON}
              >
                <UiIcon name={copied === f.id ? 'check' : 'copy'} class="size-4" />
                {copied === f.id ? 'Copied' : f.label}
              </button>
            ))}
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <a href={svgDownload} class="btn-primary gap-1.5" download onClick={countDownload}>
            <UiIcon name="download" class="size-4" />
            Download SVG
          </a>
          <a href={pngDownload} class={BUTTON} download onClick={countDownload}>
            Download PNG ({Math.max(16, size)} px)
          </a>
          <button
            type="button"
            aria-pressed={saved}
            onClick={() => {
              if (saved) {
                removeFromCollection(ref);
                announce(`Removed ${label} from your collection`);
              } else if (addToCollection([ref])) {
                announce(`Added ${label} to your collection`);
              } else {
                announce('Your collection is full (500 icons)');
              }
            }}
            class={BUTTON}
          >
            {saved ? '✓ In collection' : '+ Add to collection'}
          </button>
        </div>
      </div>
    </div>
  );
}
