/**
 * Animated icons (spinners, weather) move with SVG SMIL, which the CSS reduced-motion rule in
 * global.css can't stop. When the visitor asks for less motion, pause every SVG animation,
 * including icons added later (the icon dialog, search suggestions). WCAG 2.2.2.
 */
const query = matchMedia('(prefers-reduced-motion: reduce)');

function apply(root: ParentNode): void {
  root.querySelectorAll('svg').forEach((svg) => {
    if (query.matches) {
      svg.pauseAnimations();
      svg.setCurrentTime(0);
    } else {
      svg.unpauseAnimations();
    }
  });
}

apply(document);
query.addEventListener('change', () => {
  apply(document);
});
new MutationObserver((records) => {
  if (!query.matches) return;
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof SVGSVGElement) apply(node.parentNode ?? document);
      else if (node instanceof Element) apply(node);
    }
  }
}).observe(document.body, { childList: true, subtree: true });
