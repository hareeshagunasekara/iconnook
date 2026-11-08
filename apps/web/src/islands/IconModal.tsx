import { useEffect, useId, useRef, useState } from 'preact/hooks';

import type { Attribution, IconDetail, SearchResult } from '../lib/api';
import { IconEditor } from './IconEditor';
import { IconInfo } from './IconInfo';
import { UiIcon } from './UiIcon';

/**
 * Opens icons in a dialog instead of navigating: clicking any icon tile (a[data-icon-link]) or an
 * icon suggestion shows the editor, license and similar icons in place. The URL follows the
 * icon (so it can be shared and Back closes the dialog); the icon page stays for direct visits,
 * new tabs and browsers without JavaScript.
 */

export const OPEN_ICON_EVENT = 'iconnook:open-icon';

interface Loaded {
  icon: IconDetail;
  attribution: Attribution | null;
  similar: SearchResult['items'];
}

type State =
  | { status: 'closed' }
  | { status: 'loading'; set: string; name: string }
  | { status: 'error'; set: string; name: string }
  | ({ status: 'ready' } & Loaded);

const label = (name: string) => name.replaceAll('-', ' ');

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${String(res.status)} for ${url}`);
  return (await res.json()) as T;
}

export function IconModal({ apiUrl }: { apiUrl: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: 'closed' });
  const titleId = useId();
  /** Where focus returns, the page URL/title to restore, and whether we added history entries. */
  const origin = useRef<{ focus: HTMLElement | null; url: string; title: string; pushed: number }>({
    focus: null,
    url: '',
    title: '',
    pushed: 0,
  });
  const request = useRef<AbortController | null>(null);
  /** True while we close the dialog ourselves (so its close event isn't handled twice). */
  const closing = useRef(false);

  const load = (set: string, name: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'loading', set, name });
    const base = `${apiUrl}/v1/icons/${set}/${name}`;
    Promise.all([
      getJson<IconDetail>(base, controller.signal),
      getJson<Attribution>(`${base}/attribution`, controller.signal).catch(() => null),
      getJson<SearchResult>(
        `${apiUrl}/v1/search?${new URLSearchParams({ q: label(name), limit: '13' }).toString()}`,
        controller.signal,
      ).catch(() => null),
    ])
      .then(([icon, attribution, search]) => {
        const similar = (search?.items ?? [])
          .filter((i) => !(i.set === set && i.name === name))
          .slice(0, 12);
        setState({ status: 'ready', icon, attribution, similar });
        document.title = `${label(name)} icon from ${icon.setInfo.name} · IconNook`;
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error', set, name });
      });
  };

  const open = (set: string, name: string, push: boolean) => {
    const el = dialog.current;
    if (!el) return;
    if (!el.open) {
      origin.current = {
        focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        url: location.href,
        title: document.title,
        pushed: 0,
      };
      el.showModal();
    }
    if (push) {
      history.pushState({ iconModal: { set, name } }, '', `/icons/${set}/${name}`);
      origin.current.pushed += 1;
    }
    load(set, name);
  };

  /** Closes the dialog and puts the page back as it was. */
  const finish = () => {
    request.current?.abort();
    closing.current = true;
    dialog.current?.close();
    closing.current = false;
    setState({ status: 'closed' });
    document.title = origin.current.title;
    origin.current.focus?.focus();
  };

  const close = () => {
    const { pushed, url } = origin.current;
    if (pushed > 0) {
      // Go back to the page the dialog was opened from; popstate then finishes closing.
      origin.current.pushed = 0;
      history.go(-pushed);
    } else {
      if (location.href !== url) history.replaceState(history.state, '', url);
      finish();
    }
  };

  useEffect(() => {
    document.documentElement.dataset.iconModalReady = 'true';
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        'a[data-icon-link]',
      );
      const { set, name } = link?.dataset ?? {};
      if (!set || !name) return;
      event.preventDefault();
      open(set, name, true);
    };
    const onOpenEvent = (event: Event) => {
      const { set, name } = (event as CustomEvent<{ set: string; name: string }>).detail;
      open(set, name, true);
    };
    const onPopState = (event: PopStateEvent) => {
      const target = (event.state as { iconModal?: { set: string; name: string } } | null)
        ?.iconModal;
      if (target) {
        open(target.set, target.name, false);
      } else if (dialog.current?.open) {
        origin.current.pushed = 0;
        finish();
      }
    };
    document.addEventListener('click', onClick);
    document.addEventListener(OPEN_ICON_EVENT, onOpenEvent);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener(OPEN_ICON_EVENT, onOpenEvent);
      window.removeEventListener('popstate', onPopState);
      delete document.documentElement.dataset.iconModalReady;
    };
  }, []);

  const current =
    state.status === 'ready'
      ? { set: state.icon.set, name: state.icon.name }
      : state.status === 'closed'
        ? null
        : { set: state.set, name: state.name };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      class="icon-modal"
      onClose={() => {
        // Escape (or any other native close) ends up here: tidy up history like the X button.
        if (!closing.current) close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close(); // a click on the backdrop
      }}
    >
      <div class="relative p-5 sm:p-7">
        <button
          type="button"
          class="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-[var(--radius-button)] border-2 border-ink bg-surface hover:bg-mustard-soft"
          aria-label="Close"
          onClick={close}
        >
          <UiIcon name="x" class="size-5" />
        </button>

        <header class="pr-14">
          <h2 id={titleId} class="text-2xl font-extrabold sm:text-3xl">
            {current ? label(current.name) : 'Icon'}
          </h2>
          {state.status === 'ready' && (
            <p class="mt-1 text-sm text-text-muted">
              from{' '}
              <a class="link" href={`/sets/${state.icon.set}`}>
                {state.icon.setInfo.name}
              </a>
              {' · '}
              <a class="link" href={`/icons/${state.icon.set}/${state.icon.name}`}>
                Open icon page
              </a>
            </p>
          )}
        </header>

        {state.status === 'loading' && (
          <p class="mt-8 text-text-muted" role="status">
            Loading…
          </p>
        )}
        {state.status === 'error' && (
          <p class="mt-8" role="alert">
            This icon couldn't be loaded.{' '}
            <a class="link" href={`/icons/${state.set}/${state.name}`}>
              Open the icon page
            </a>
          </p>
        )}
        {state.status === 'ready' && (
          <div class="mt-6 space-y-6">
            <IconEditor
              key={`${state.icon.set}:${state.icon.name}`}
              apiUrl={apiUrl}
              set={state.icon.set}
              name={state.icon.name}
              isColor={state.icon.setInfo.isColor}
              hasStroke={state.icon.body.includes('stroke-width')}
              iconId={state.icon.id}
            />
            <IconInfo icon={state.icon} attribution={state.attribution} />
            {state.similar.length > 0 && (
              <section aria-label="Similar icons">
                <h3 class="font-display text-lg font-bold">Similar icons</h3>
                <ul class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {state.similar.map((i) => (
                    <li>
                      <a
                        href={`/icons/${i.set}/${i.name}`}
                        data-icon-link
                        data-set={i.set}
                        data-name={i.name}
                        class="flex h-full min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-transparent bg-surface p-2 text-center hover:border-ink"
                      >
                        <img src={i.urls.svg} alt="" width={28} height={28} class="size-7" />
                        <span class="line-clamp-2 text-xs [overflow-wrap:anywhere]">
                          {label(i.name)}
                        </span>
                        <span class="line-clamp-1 text-[0.7rem] text-text-muted">
                          {i.setName ?? i.set}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
