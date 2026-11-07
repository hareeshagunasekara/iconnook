/**
 * Roving tabindex for icon grids (docs/standards/ui-ux.md): the grid is one tab stop; arrow keys move
 * between icons (columns are measured from the live layout, so it works at any width), Home/End jump
 * to the ends, Enter follows the link. Without JS every icon is simply a normal link.
 */
function setup(grid: HTMLElement): void {
  const links = Array.from(grid.querySelectorAll<HTMLAnchorElement>(':scope > li > a'));
  if (links.length === 0) return;
  links.forEach((link, i) => {
    link.tabIndex = i === 0 ? 0 : -1;
  });

  const columns = () => {
    const top = links[0]?.getBoundingClientRect().top ?? 0;
    return Math.max(
      1,
      links.filter((l) => Math.abs(l.getBoundingClientRect().top - top) < 2).length,
    );
  };

  const move = (from: number, to: number) => {
    const target = links[Math.min(links.length - 1, Math.max(0, to))];
    const current = links[from];
    if (!target || !current || target === current) return;
    current.tabIndex = -1;
    target.tabIndex = 0;
    target.focus();
  };

  grid.addEventListener('keydown', (event) => {
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index === -1) return;
    const offsets: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns(),
      ArrowUp: -columns(),
    };
    if (event.key in offsets) {
      move(index, index + (offsets[event.key] ?? 0));
    } else if (event.key === 'Home') {
      move(index, 0);
    } else if (event.key === 'End') {
      move(index, links.length - 1);
    } else {
      return;
    }
    event.preventDefault();
  });

  // Clicking/tabbing into a non-current item makes it the current one.
  grid.addEventListener('focusin', (event) => {
    const link = event.target as HTMLAnchorElement;
    if (!links.includes(link)) return;
    for (const l of links) l.tabIndex = l === link ? 0 : -1;
  });
}

document.querySelectorAll<HTMLElement>('[data-icon-grid]').forEach(setup);
