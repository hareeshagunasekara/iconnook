import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';

/**
 * A themed confirmation dialog, used instead of window.confirm (whose "localhost says" box can't
 * be styled). Native <dialog>: focus is trapped, Escape cancels, focus returns to the opener.
 * The safe choice (Cancel) gets focus first.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ComponentChildren;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      cancel.current?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      class="confirm-dialog"
      onClose={() => {
        if (open) onCancel(); // Escape or any other native close
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onCancel(); // a click on the backdrop
      }}
    >
      <div class="p-6">
        <h2 id={titleId} class="font-display text-xl font-extrabold">
          {title}
        </h2>
        {children && <div class="mt-2 text-text-muted">{children}</div>}
        <div class="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={cancel}
            type="button"
            onClick={onCancel}
            class="inline-flex min-h-11 items-center rounded-[var(--radius-button)] border-2 border-ink bg-surface px-4 font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            class="inline-flex min-h-11 items-center rounded-[var(--radius-button)] border-2 border-ink bg-coral px-4 font-semibold text-ink"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
