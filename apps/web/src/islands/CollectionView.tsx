import { useEffect, useState } from 'preact/hooks';

import {
  announce,
  clearCollection,
  getCollection,
  onCollectionChange,
  removeFromCollection,
} from '../lib/collection';
import { PackDownloader } from './PackDownloader';

/** The visitor's own collection (browser storage): browse, remove, download, share. */

interface Item {
  set: string;
  name: string;
  setName: string;
  urls: { svg: string; page: string };
}

export function CollectionView({ apiUrl }: { apiUrl: string }) {
  const [refs, setRefs] = useState<string[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [share, setShare] = useState<{ url: string } | { error: string } | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const load = () => {
      setRefs(getCollection());
    };
    load();
    return onCollectionChange(load);
  }, []);

  useEffect(() => {
    if (!refs || refs.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    fetch(`${apiUrl}/v1/icons?names=${encodeURIComponent(refs.join(','))}`, {
      signal: controller.signal,
    })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ items: Item[] }>)
          : Promise.reject(new Error(String(r.status))),
      )
      .then((r) => {
        setItems(r.items);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [apiUrl, refs]);

  const createShareLink = async () => {
    if (!refs?.length) return;
    setSharing(true);
    try {
      const res = await fetch(`${apiUrl}/v1/collections`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ icons: refs }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { url: string };
      setShare({ url: body.url });
      announce('Share link created');
    } catch {
      setShare({ error: 'The share link could not be created. Please try again.' });
    } finally {
      setSharing(false);
    }
  };

  if (refs === null) return <p class="text-[var(--color-text-muted)]">Loading your collection…</p>;

  if (refs.length === 0) {
    return (
      <section class="rounded-xl bg-[var(--color-surface)] p-8 text-center">
        <h2 class="text-xl font-semibold">Your collection is empty</h2>
        <p class="mt-2 text-[var(--color-text-muted)]">
          Open any icon and choose <strong>Add to collection</strong>. Collections are saved in this
          browser — no account needed.
        </p>
        <p class="mt-4">
          <a class="link" href="/sets">
            Browse icon sets
          </a>
        </p>
      </section>
    );
  }

  return (
    <div class="space-y-8">
      <section aria-labelledby="dl" class="rounded-xl border border-[var(--color-surface-2)] p-5">
        <h2 id="dl" class="mb-3 text-lg font-semibold">
          Download all {refs.length} icons
        </h2>
        <PackDownloader apiUrl={apiUrl} refs={refs} />
      </section>

      <section
        aria-labelledby="share"
        class="rounded-xl border border-[var(--color-surface-2)] p-5"
      >
        <h2 id="share" class="text-lg font-semibold">
          Share
        </h2>
        <p class="mt-1 text-sm text-[var(--color-text-muted)]">
          Creates a link to a snapshot of this collection. Anyone with the link can view and
          download it.
        </p>
        {share && 'url' in share ? (
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <label for="share-url" class="sr-only">
              Share link
            </label>
            <input
              id="share-url"
              readOnly
              value={share.url}
              class="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-mono text-sm"
              onFocus={(e) => {
                (e.target as HTMLInputElement).select();
              }}
            />
            <button
              type="button"
              class="min-h-11 rounded-lg border border-[var(--color-border)] px-4"
              onClick={() => {
                void navigator.clipboard.writeText(share.url).then(() => {
                  announce('Share link copied');
                });
              }}
            >
              Copy link
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={sharing}
            onClick={() => void createShareLink()}
            class="mt-3 min-h-11 rounded-lg border border-[var(--color-border)] px-4 disabled:opacity-60"
          >
            {sharing ? 'Creating link…' : 'Create share link'}
          </button>
        )}
        {share && 'error' in share && (
          <p role="alert" class="mt-2 text-sm">
            {share.error}
          </p>
        )}
      </section>

      <section aria-labelledby="icons">
        <div class="flex items-baseline justify-between gap-4">
          <h2 id="icons" class="text-lg font-semibold">
            Icons
          </h2>
          <button
            type="button"
            class="min-h-11 text-sm underline"
            onClick={() => {
              if (window.confirm('Remove all icons from your collection?')) {
                clearCollection();
                announce('Collection cleared');
              }
            }}
          >
            Clear collection
          </button>
        </div>
        <ul
          class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2"
          aria-label="Icons in your collection"
        >
          {items.map((icon) => (
            <li class="flex flex-col items-center gap-2 rounded-lg bg-[var(--color-surface)] p-3 text-center">
              <a href={icon.urls.page} class="flex flex-col items-center gap-2">
                <img
                  src={icon.urls.svg}
                  alt=""
                  width={32}
                  height={32}
                  loading="lazy"
                  class="h-10 w-10 rounded bg-white p-1"
                />
                <span class="text-xs break-all">{icon.name.replaceAll('-', ' ')}</span>
                <span class="sr-only">, {icon.setName}</span>
              </a>
              <button
                type="button"
                class="min-h-8 text-xs underline"
                aria-label={`Remove ${icon.name.replaceAll('-', ' ')} (${icon.setName}) from collection`}
                onClick={() => {
                  removeFromCollection(`${icon.set}:${icon.name}`);
                  announce(`Removed ${icon.name.replaceAll('-', ' ')}`);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
