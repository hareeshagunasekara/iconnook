import { PUBLIC_API_URL } from 'astro:env/client';

/**
 * Search suggestions for every search box (input[data-search-input]), as an ARIA 1.2 combobox.
 * Empty box: recent and popular searches. While typing (debounced): "Search for …", matching
 * sets and the top icons. Arrow keys move, Enter picks, Escape closes; the form still submits
 * normally without JavaScript or when nothing is picked. Built with DOM APIs (no innerHTML).
 */

interface SetLite {
  prefix: string;
  name: string;
  total: number;
}
interface IconLite {
  set: string;
  name: string;
  setName?: string;
  urls: { svg: string };
}

type Option =
  | { kind: 'query'; text: string; hint?: 'recent' | 'popular' }
  | { kind: 'set'; set: SetLite }
  | { kind: 'icon'; icon: IconLite };

const POPULAR = ['home', 'arrow', 'user', 'settings', 'heart', 'mail', 'calendar', 'star'];
const RECENT_KEY = 'iconnook:recent-searches';
const MAX_RECENT = 5;
const label = (name: string) => name.replaceAll('-', ' ');

function recentSearches(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string') : [];
  } catch {
    return [];
  }
}

function remember(query: string): void {
  const q = query.trim();
  if (!q) return;
  try {
    const next = [q, ...recentSearches().filter((r) => r !== q)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode): just don't remember
  }
}

let setsPromise: Promise<SetLite[]> | null = null;
/** The set list is small and cached by the CDN: load it once per page. */
function allSets(): Promise<SetLite[]> {
  setsPromise ??= fetch(`${PUBLIC_API_URL}/v1/sets`)
    .then((r) => (r.ok ? (r.json() as Promise<SetLite[]>) : []))
    .catch(() => []);
  return setsPromise;
}

async function suggestionsFor(query: string, signal: AbortSignal): Promise<Option[]> {
  const q = query.trim().toLowerCase();
  const [sets, icons] = await Promise.all([
    allSets(),
    fetch(`${PUBLIC_API_URL}/v1/search?${new URLSearchParams({ q, limit: '6' }).toString()}`, {
      signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: IconLite[] }>) : { items: [] }))
      .then((r) => r.items)
      .catch(() => [] as IconLite[]),
  ]);
  // Search-ahead: other searches suggested by the matching icon names.
  const completions = [
    ...new Set(icons.map((i) => label(i.name)).filter((n) => n !== q && n.startsWith(q))),
  ].slice(0, 3);
  // Match at the start of a word, so "hea" finds "Health Icons" but not "Pinhead".
  const startsWord = (text: string) =>
    text
      .toLowerCase()
      .split(/[\s-]+/)
      .some((word) => word.startsWith(q));
  const matchingSets = sets
    .filter((s) => startsWord(s.name) || startsWord(s.prefix))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  return [
    { kind: 'query', text: query.trim() },
    ...completions.map((text): Option => ({ kind: 'query', text })),
    ...matchingSets.map((set): Option => ({ kind: 'set', set })),
    ...icons.map((icon): Option => ({ kind: 'icon', icon })),
  ];
}

function emptySuggestions(): Option[] {
  const recent = recentSearches();
  return [
    ...recent.map((text): Option => ({ kind: 'query', text, hint: 'recent' })),
    ...POPULAR.filter((p) => !recent.includes(p)).map((text): Option => ({
      kind: 'query',
      text,
      hint: 'popular',
    })),
  ];
}

function groupOf(option: Option): string {
  if (option.kind === 'set') return 'Icon sets';
  if (option.kind === 'icon') return 'Icons';
  if (option.hint === 'recent') return 'Recent searches';
  if (option.hint === 'popular') return 'Popular searches';
  return 'Suggested searches';
}

function enhance(input: HTMLInputElement): void {
  const form = input.form;
  const anchor = input.parentElement;
  if (!form || !anchor) return;
  const listId = `${input.id}-suggestions`;
  const list = document.createElement('ul');
  list.id = listId;
  list.className = 'suggest';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Search suggestions');
  list.hidden = true;
  anchor.append(list);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-expanded', 'false');

  let options: Option[] = [];
  let active = -1;
  let timer: number | undefined;
  let controller: AbortController | null = null;

  const optionId = (i: number) => `${listId}-${String(i)}`;

  const setActive = (index: number) => {
    active = index;
    list.querySelectorAll('[role="option"]').forEach((el, i) => {
      el.setAttribute('aria-selected', String(i === index));
    });
    if (index >= 0) {
      input.setAttribute('aria-activedescendant', optionId(index));
      document.getElementById(optionId(index))?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  };

  const pick = (option: Option) => {
    close();
    if (option.kind === 'query') {
      input.value = option.text;
      remember(option.text);
      form.requestSubmit();
    } else if (option.kind === 'set') {
      location.href = `/sets/${option.set.prefix}`;
    } else if (document.documentElement.dataset.iconModalReady) {
      document.dispatchEvent(
        new CustomEvent('iconnook:open-icon', {
          detail: { set: option.icon.set, name: option.icon.name },
        }),
      );
    } else {
      location.href = `/icons/${option.icon.set}/${option.icon.name}`;
    }
  };

  const render = (next: Option[]) => {
    options = next;
    list.replaceChildren();
    let group = '';
    next.forEach((option, i) => {
      const name = groupOf(option);
      if (name !== group && !(option.kind === 'query' && !option.hint && i === 0)) {
        group = name;
        const heading = document.createElement('li');
        heading.setAttribute('role', 'presentation');
        heading.className = 'suggest-group';
        heading.textContent = name;
        list.append(heading);
      }
      const li = document.createElement('li');
      li.id = optionId(i);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.className = 'suggest-option';
      if (option.kind === 'icon') {
        const img = document.createElement('img');
        img.src = option.icon.urls.svg;
        img.alt = '';
        img.width = 24;
        img.height = 24;
        const text = document.createElement('span');
        text.textContent = label(option.icon.name);
        const meta = document.createElement('span');
        meta.className = 'suggest-meta';
        meta.textContent = option.icon.setName ?? option.icon.set;
        li.append(img, text, meta);
      } else if (option.kind === 'set') {
        const text = document.createElement('span');
        text.textContent = option.set.name;
        const meta = document.createElement('span');
        meta.className = 'suggest-meta';
        meta.textContent = `${option.set.total.toLocaleString('en')} icons`;
        li.append(text, meta);
      } else {
        li.textContent = i === 0 && !option.hint ? `Search for “${option.text}”` : option.text;
      }
      // mousedown: pick before the input's blur closes the list.
      li.addEventListener('mousedown', (event) => {
        event.preventDefault();
        pick(option);
      });
      list.append(li);
    });
    list.hidden = next.length === 0;
    input.setAttribute('aria-expanded', String(next.length > 0));
    setActive(-1);
  };

  const update = () => {
    window.clearTimeout(timer);
    controller?.abort();
    const query = input.value.trim();
    if (!query) {
      render(emptySuggestions());
      return;
    }
    timer = window.setTimeout(() => {
      controller = new AbortController();
      const signal = controller.signal;
      suggestionsFor(query, signal)
        .then((next) => {
          if (!signal.aborted && document.activeElement === input) render(next);
        })
        .catch(() => undefined);
    }, 150);
  };

  input.addEventListener('focus', update);
  input.addEventListener('click', () => {
    if (list.hidden) update();
  });
  input.addEventListener('input', update);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) {
        update();
        return;
      }
      // Cycle through the options and back to the text box (-1).
      let next = active + (event.key === 'ArrowDown' ? 1 : -1);
      if (next < -1) next = options.length - 1;
      if (next >= options.length) next = -1;
      setActive(next);
    } else if (event.key === 'Enter' && !list.hidden && active >= 0) {
      const option = options[active];
      if (option) {
        event.preventDefault();
        pick(option);
      }
    } else if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      close();
    }
  });
  form.addEventListener('submit', () => {
    remember(input.value);
  });
}

document.querySelectorAll<HTMLInputElement>('input[data-search-input]').forEach(enhance);
