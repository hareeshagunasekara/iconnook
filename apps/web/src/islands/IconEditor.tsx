import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import {
  addToCollection,
  announce as announceLive,
  inCollection,
  onCollectionChange,
  removeFromCollection,
} from '../lib/collection';

/**
 * Icon page editor (Preact island). Server-rendered with defaults, so preview, downloads and the SVG
 * code all work without JavaScript; with JS, controls update everything live.
 * The preview is an <img> of the API's sanitized SVG — no client-side innerHTML.
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
  /** Server-fetched SVG code for the default state (shown without JS). */
  initialCode: string;
  /**
   * Server-rendered inline SVG of the uncustomized icon (same sanitized body the icon grids inline).
   * Shown until the user customizes, so the page's largest element needs no extra request.
   */
  initialSvg: string;
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

const announce = announceLive;

export function IconEditor({
  apiUrl,
  set,
  name,
  isColor,
  hasStroke,
  initialCode,
  initialSvg,
  iconId,
}: Props) {
  const ref = `${set}:${name}`;
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
  const [format, setFormat] = useState<Format>('svg');
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const base = `${apiUrl}/v1/icons/${set}/${name}`;
  const custom = { color: color ? color.toLowerCase() : undefined, stroke };
  const preview = canonical(`${base}.svg`, { ...custom, size: 256 });
  const svgDownload = canonical(`${base}.svg`, { ...custom, size, download: 1 });
  const pngDownload = canonical(`${base}.png`, {
    ...custom,
    size: Math.max(16, size),
    download: 1,
  });
  const codeUrl = useMemo(
    () =>
      canonical(`${base}/code`, {
        ...custom,
        format,
        size:
          format === 'svg' || format === 'jsx' || format === 'vue' || format === 'svelte'
            ? size
            : undefined,
      }),
    [base, color, stroke, format, size],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(codeUrl, { signal: controller.signal })
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ code: string }>)
            : Promise.reject(new Error(String(r.status))),
        )
        .then((r) => {
          setCode(r.code);
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [codeUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      announce(`Copied ${FORMATS.find((f) => f.id === format)?.label ?? ''} code`);
      window.setTimeout(() => {
        setCopied(false);
      }, 2_000);
    } catch {
      announce('Copy failed — select the code and copy it manually');
    }
  };

  // ARIA tabs: arrow keys move between tabs (only the selected tab is in the tab order).
  const onTabKey = (event: KeyboardEvent, index: number) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? FORMATS.length - 1
          : (index + (delta ?? 0) + FORMATS.length) % FORMATS.length;
    const target = FORMATS[next];
    if (target) setFormat(target.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div class="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-2">
          <div class="flex aspect-square items-center justify-center rounded-xl bg-white p-6">
            {color === '' && stroke === undefined ? (
              <span
                role="img"
                aria-label={`${name.replaceAll('-', ' ')} icon preview on light background`}
                class="text-[#14161a] [&>svg]:h-32 [&>svg]:w-auto"
                dangerouslySetInnerHTML={{ __html: initialSvg }}
              />
            ) : (
              <img
                src={preview}
                alt={`${name.replaceAll('-', ' ')} icon preview on light background`}
                width={128}
                height={128}
                class="max-h-full w-auto"
              />
            )}
          </div>
          <div class="flex aspect-square items-center justify-center rounded-xl bg-[#111317] p-6">
            {color === '' && stroke === undefined ? (
              <span
                role="img"
                aria-label={`${name.replaceAll('-', ' ')} icon preview on dark background`}
                class="text-[#eceef2] [&>svg]:h-32 [&>svg]:w-auto"
                dangerouslySetInnerHTML={{ __html: initialSvg }}
              />
            ) : (
              <img
                src={canonical(`${base}.svg`, {
                  ...custom,
                  color: color ? color.toLowerCase() : isColor ? undefined : '#eceef2',
                  size: 256,
                })}
                alt={`${name.replaceAll('-', ' ')} icon preview on dark background`}
                width={128}
                height={128}
                class="max-h-full w-auto"
              />
            )}
          </div>
        </div>

        <fieldset class="space-y-3 rounded-xl border border-[var(--color-surface-2)] p-4">
          <legend class="px-1 font-semibold">Customize</legend>
          {isColor ? (
            <p class="text-sm text-[var(--color-text-muted)]">
              This is a multicolor icon, so its colors can't be changed.
            </p>
          ) : (
            <div class="flex items-center gap-2">
              <label for="ed-color" class="w-16 text-sm">
                Color
              </label>
              <input
                id="ed-color"
                type="color"
                value={HEX.test(color) && color.length === 7 ? color : '#000000'}
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  setColor(v);
                  setColorText(v);
                }}
                class="h-11 w-11 cursor-pointer rounded border border-[var(--color-border)] bg-transparent"
              />
              <label for="ed-color-hex" class="sr-only">
                Color as hex code
              </label>
              <input
                id="ed-color-hex"
                type="text"
                inputMode="text"
                placeholder="#000000"
                value={colorText}
                maxLength={7}
                aria-invalid={colorText !== '' && !HEX.test(colorText)}
                aria-describedby="ed-color-help"
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  setColorText(v);
                  if (HEX.test(v)) setColor(v);
                  if (v === '') setColor('');
                }}
                class="min-h-11 w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono"
              />
              <span id="ed-color-help" class="text-xs text-[var(--color-text-muted)]">
                {colorText !== '' && !HEX.test(colorText) ? 'Use #rgb or #rrggbb' : ''}
              </span>
            </div>
          )}
          <div class="flex items-center gap-2">
            <label for="ed-size" class="w-16 text-sm">
              Size
            </label>
            <select
              id="ed-size"
              value={size}
              onChange={(e) => {
                setSize(Number((e.target as HTMLSelectElement).value));
              }}
              class="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2"
            >
              {SIZES.map((s) => (
                <option value={s}>{s} px</option>
              ))}
            </select>
          </div>
          {hasStroke && (
            <div class="flex items-center gap-2">
              <label for="ed-stroke" class="w-16 text-sm">
                Stroke
              </label>
              <input
                id="ed-stroke"
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
              <output for="ed-stroke" class="w-10 text-right font-mono text-sm">
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
            class="min-h-11 rounded-lg border border-[var(--color-border)] px-3 text-sm"
          >
            Reset
          </button>
        </fieldset>

        <div class="flex flex-wrap gap-2">
          <a
            href={svgDownload}
            class="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-accent)] px-4 font-medium text-[var(--color-accent-contrast)]"
            download
            onClick={countDownload}
          >
            Download SVG
          </a>
          <a
            href={pngDownload}
            class="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-border)] px-4 font-medium"
            download
            onClick={countDownload}
          >
            Download PNG ({Math.max(16, size)} px)
          </a>
          <button
            type="button"
            aria-pressed={saved}
            onClick={() => {
              if (saved) {
                removeFromCollection(ref);
                announce(`Removed ${name.replaceAll('-', ' ')} from your collection`);
              } else if (addToCollection([ref])) {
                announce(`Added ${name.replaceAll('-', ' ')} to your collection`);
              } else {
                announce('Your collection is full (500 icons)');
              }
            }}
            class="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-border)] px-4 font-medium"
          >
            {saved ? '✓ In collection' : '+ Add to collection'}
          </button>
        </div>
      </div>

      <div class="min-w-0">
        <div role="tablist" aria-label="Copy as" class="flex flex-wrap gap-1">
          {FORMATS.map((f, i) => (
            <button
              type="button"
              role="tab"
              id={`tab-${f.id}`}
              aria-selected={format === f.id}
              aria-controls="code-panel"
              tabIndex={format === f.id ? 0 : -1}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              onClick={() => {
                setFormat(f.id);
              }}
              onKeyDown={(e) => {
                onTabKey(e, i);
              }}
              class={`min-h-11 rounded-t-lg px-3 text-sm ${format === f.id ? 'bg-[var(--color-surface)] font-semibold' : 'text-[var(--color-text-muted)]'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div
          id="code-panel"
          role="tabpanel"
          aria-labelledby={`tab-${format}`}
          class="rounded-b-xl rounded-tr-xl bg-[var(--color-surface)] p-3"
        >
          <pre
            class="max-h-80 overflow-auto text-xs leading-relaxed whitespace-pre-wrap break-all"
            tabIndex={0}
            aria-label={`${format} code`}
          >
            <code>{code}</code>
          </pre>
          <button
            type="button"
            onClick={() => void copy()}
            class="mt-3 min-h-11 rounded-lg bg-[var(--color-accent)] px-4 font-medium text-[var(--color-accent-contrast)]"
          >
            {copied ? 'Copied ✓' : `Copy ${FORMATS.find((f) => f.id === format)?.label ?? ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
