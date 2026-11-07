import { useState } from 'preact/hooks';

import { addToCollection, announce, MAX_COLLECTION } from '../lib/collection';

/** "Save to my collection" on a shared collection page. */
export function SaveCollection({ refs }: { refs: readonly string[] }) {
  const [state, setState] = useState<'idle' | 'saved' | 'full'>('idle');
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          const ok = addToCollection(refs);
          setState(ok ? 'saved' : 'full');
          announce(
            ok
              ? `Saved ${String(refs.length)} icons to your collection`
              : 'Your collection is full',
          );
        }}
        class="min-h-11 rounded-lg border border-[var(--color-border)] px-4 font-medium"
      >
        {state === 'saved' ? 'Saved ✓' : 'Save to my collection'}
      </button>
      {state === 'saved' && (
        <a class="link ml-3 text-sm" href="/collection">
          Open my collection
        </a>
      )}
      {state === 'full' && (
        <p role="alert" class="mt-2 text-sm">
          Your collection can hold up to {MAX_COLLECTION} icons. Remove some first.
        </p>
      )}
    </div>
  );
}
