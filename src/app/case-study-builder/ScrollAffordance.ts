import { useEffect, type RefObject } from 'react';

/*
  Sections that scroll sideways on narrow screens (flow comparisons, tables, journey maps, roadmaps…)
  get three things, found automatically rather than wired into each section:
  - a soft fade on the edge that has more content, so it's clear there's more to see;
  - keyboard access: the area can take focus and scroll with the arrow keys;
  - a name for screen readers ("<section title>, scrolls sideways").
*/
const tracked = new WeakSet<HTMLElement>();

function update(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth;
  const more = max > 4;
  el.toggleAttribute('data-hscroll', more);
  el.toggleAttribute('data-more-left', more && el.scrollLeft > 4);
  el.toggleAttribute('data-more-right', more && el.scrollLeft < max - 4);
  if (more) {
    if (!el.hasAttribute('tabindex')) { el.tabIndex = 0; el.dataset.hscrollOwned = '1'; }
    if (!el.getAttribute('role')) { el.setAttribute('role', 'region'); el.dataset.hscrollRole = '1'; }
    if (!el.getAttribute('aria-label')) { const t = el.closest('[id^="builder-section-"]')?.querySelector('h2')?.textContent?.trim(); el.setAttribute('aria-label', `${t || 'Content'}, scrolls sideways`); el.dataset.hscrollLabel = '1'; }
  } else if (el.dataset.hscrollOwned) {
    el.removeAttribute('tabindex'); delete el.dataset.hscrollOwned;
    if (el.dataset.hscrollRole) { el.removeAttribute('role'); delete el.dataset.hscrollRole; }
    if (el.dataset.hscrollLabel) { el.removeAttribute('aria-label'); delete el.dataset.hscrollLabel; }
  }
}

export function useScrollAffordance(root: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const el = root.current; if (!el || !active) return;
    let frame = 0;
    const scan = () => {
      frame = 0;
      el.querySelectorAll<HTMLElement>('[id^="builder-section-"] *').forEach(n => {
        const ox = getComputedStyle(n).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && n.clientWidth > 0) {
          if (!tracked.has(n)) { tracked.add(n); n.addEventListener('scroll', () => update(n), { passive: true }); }
          update(n);
        }
      });
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(scan); };
    const t = setTimeout(scan, 600);
    const ro = new ResizeObserver(later); ro.observe(el);
    const mo = new MutationObserver(() => { clearTimeout(idle); idle = setTimeout(later, 400); }); let idle = 0 as unknown as ReturnType<typeof setTimeout>;
    mo.observe(el, { childList: true, subtree: true });
    return () => { clearTimeout(t); clearTimeout(idle); ro.disconnect(); mo.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [active]);
}
