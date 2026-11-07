/**
 * The visitor's collection, kept in their browser only (no account). Stored as "set:name" refs.
 * Every access is guarded: storage can be unavailable (private mode, blocked site data).
 */
const KEY = 'iconnook:collection';
export const COLLECTION_EVENT = 'iconnook:collection';
export const MAX_COLLECTION = 500;
const REF = /^[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*$/;

export function getCollection(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((r): r is string => typeof r === 'string' && REF.test(r))
      : [];
  } catch {
    return [];
  }
}

function save(refs: string[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(refs.slice(0, MAX_COLLECTION)));
    window.dispatchEvent(new CustomEvent(COLLECTION_EVENT));
    return true;
  } catch {
    return false;
  }
}

export const inCollection = (ref: string) => getCollection().includes(ref);

/** Returns false if the collection is full or storage is unavailable. */
export function addToCollection(refs: readonly string[]): boolean {
  const current = getCollection();
  const next = [...current, ...refs.filter((r) => REF.test(r) && !current.includes(r))];
  if (next.length > MAX_COLLECTION) return false;
  return save(next);
}

export const removeFromCollection = (ref: string) => save(getCollection().filter((r) => r !== ref));
export const clearCollection = () => save([]);

/** Calls back whenever the collection changes in this tab or another one. */
export function onCollectionChange(callback: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) callback();
  };
  window.addEventListener(COLLECTION_EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(COLLECTION_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}

export function announce(message: string): void {
  const el = document.getElementById('announcer');
  if (!el) return;
  el.textContent = '';
  window.setTimeout(() => {
    el.textContent = message;
  }, 50);
}
