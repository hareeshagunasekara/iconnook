import { UI_ICONS, type UiIconName } from '../lib/ui-icons';

/** Preact twin of UiIcon.astro, for islands: a decorative Lucide icon drawn with currentColor. */
export function UiIcon({
  name,
  class: className = 'size-5',
}: {
  name: UiIconName;
  class?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={2}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      class={className}
      dangerouslySetInnerHTML={{ __html: UI_ICONS[name] }}
    />
  );
}
