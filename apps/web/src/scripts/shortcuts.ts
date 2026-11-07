/** "/" focuses the search box from anywhere, unless the user is already typing somewhere. */
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  const input = document.querySelector<HTMLInputElement>('[data-search-input]');
  if (!input) return;
  event.preventDefault();
  input.focus();
  input.select();
});

/** Filter forms submit as soon as a filter changes (they also have a submit button for no-JS). */
document.querySelectorAll<HTMLFormElement>('form[data-autosubmit]').forEach((form) => {
  form.addEventListener('change', () => {
    form.requestSubmit();
  });
});
