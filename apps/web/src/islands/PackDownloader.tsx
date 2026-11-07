import { useRef, useState } from 'preact/hooks';

import { announce } from '../lib/collection';

/**
 * Builds a ZIP or SVG sprite in the background (POST /v1/packs → poll → download). The same icons
 * and options always produce the same pack, so repeat downloads are instant.
 */

interface Props {
  apiUrl: string;
  refs: readonly string[];
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; progress: number; label: string }
  | { kind: 'error'; message: string };

interface PackStatus {
  state: 'queued' | 'active' | 'completed' | 'failed';
  progress: number;
  statusUrl: string;
  downloadUrl: string | null;
}

const PNG_SIZES = [32, 64, 128, 256, 512];

export function PackDownloader({ apiUrl, refs }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [png, setPng] = useState<number | ''>('');
  const cancelled = useRef(false);
  // A function, not a property read: the flag changes asynchronously (Cancel button) during polling.
  const isCancelled = () => cancelled.current;

  const build = async (format: 'zip' | 'sprite') => {
    cancelled.current = false;
    const label = format === 'zip' ? 'ZIP' : 'SVG sprite';
    setPhase({ kind: 'working', progress: 0, label });
    announce(`Preparing ${label} of ${String(refs.length)} icons`);
    try {
      const body = { icons: refs, format, ...(format === 'zip' && png ? { png } : {}) };
      const res = await fetch(`${apiUrl}/v1/packs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 503)
        throw new Error('Downloads are busy right now — please try again in a minute.');
      if (res.status === 429) throw new Error('Too many downloads at once — please wait a minute.');
      if (!res.ok) throw new Error('This download could not be prepared.');
      let status = (await res.json()) as PackStatus;
      while (status.state !== 'completed' && !isCancelled()) {
        if (status.state === 'failed') throw new Error('This download could not be prepared.');
        setPhase({ kind: 'working', progress: status.progress, label });
        await new Promise((r) => setTimeout(r, 800));
        status = (await (await fetch(status.statusUrl)).json()) as PackStatus;
      }
      if (isCancelled() || !status.downloadUrl) return;
      setPhase({ kind: 'idle' });
      announce(`${label} ready, downloading`);
      window.location.assign(status.downloadUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      setPhase({ kind: 'error', message });
      announce(message);
    }
  };

  const busy = phase.kind === 'working';
  return (
    <div class="space-y-3">
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col text-sm">
          PNG files in the ZIP
          <select
            value={png}
            disabled={busy}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              setPng(v === '' ? '' : Number(v));
            }}
            class="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2"
          >
            <option value="">SVG only</option>
            {PNG_SIZES.map((s) => (
              <option value={s}>Also PNG at {s} px</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || refs.length === 0}
          onClick={() => void build('zip')}
          class="min-h-11 rounded-lg bg-[var(--color-accent)] px-4 font-medium text-[var(--color-accent-contrast)] disabled:opacity-60"
        >
          Download ZIP
        </button>
        <button
          type="button"
          disabled={busy || refs.length === 0}
          onClick={() => void build('sprite')}
          class="min-h-11 rounded-lg border border-[var(--color-border)] px-4 font-medium disabled:opacity-60"
        >
          Download SVG sprite
        </button>
      </div>
      {phase.kind === 'working' && (
        <div class="flex items-center gap-3">
          <label for="pack-progress" class="text-sm">
            Preparing {phase.label}…
          </label>
          <progress id="pack-progress" max={100} value={phase.progress} class="h-2 flex-1" />
          <button
            type="button"
            onClick={() => {
              cancelled.current = true;
              setPhase({ kind: 'idle' });
              announce('Download cancelled');
            }}
            class="min-h-11 rounded-lg px-3 text-sm underline"
          >
            Cancel
          </button>
        </div>
      )}
      {phase.kind === 'error' && (
        <p role="alert" class="text-sm">
          {phase.message}
        </p>
      )}
      <p class="text-xs text-[var(--color-text-muted)]">
        Every ZIP includes LICENSES.md with each set's license and any required credit lines.
      </p>
    </div>
  );
}
