/** Mobile menu disclosure: the button toggles the main navigation; Escape closes it. */
const button = document.querySelector<HTMLButtonElement>('[data-menu-button]');
const menu = document.querySelector<HTMLElement>('[data-menu]');

if (button && menu) {
  const setOpen = (open: boolean) => {
    button.setAttribute('aria-expanded', String(open));
    menu.toggleAttribute('data-open', open);
  };
  button.addEventListener('click', () => {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || button.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    button.focus();
  });
}
