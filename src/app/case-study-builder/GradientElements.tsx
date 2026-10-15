import { useEffect, useLayoutEffect, type RefObject } from 'react';

/*
  Turn the gradient off (or back on) for single elements on the page.
  Every element that can carry the accent gradient matches GRAD_EL. Each one gets a key:
  "<section id>|<n>" where n is its order among gradient elements in that section.
  study.gradOffEls lists the keys that should stay solid; the canvas marks them with
  data-solid, and CSS swaps the gradient for the plain accent there.
*/
export const GRAD_EL = [
  '.csb-bar[style*="accent-grad"] .csb-bar-col i', '.csb-survey-bar-fill', '.csb-apple-pictogram i.is-filled', '.csb-apple-survey-track span', '.csb-apple-persona-day i',
  '.csb-persona-meter i', '.csb-metric-bar', '.csb-ab-bar.is-b', '.csb-sv-track i', '.csb-sv-col i.is-top',
  '.csb-tsr.is-accent .csb-tsr-arc', '.csb-survey-arc-fill', '.csb-radar-fill', '.csb-journey-line', '.csb-flow-line',
  '.csb-proto-play', '.csb-annot-pin', '.csb-ss-marker', '.csb-detail li:first-child i', '.csb-detail-solo i',
  '.csb-type-glyph', '.csb-type-bar-top span', '.csb-ps-mark.is-acc', '.csb-wt-sweep b', '.csb-dev-sample em',
].join(',');

const keysIn = (root: HTMLElement) => {
  const out: Array<[Element, string]> = [];
  root.querySelectorAll<HTMLElement>('[id^="builder-section-"]').forEach(sec => {
    const id = sec.id.replace('builder-section-', '');
    sec.querySelectorAll(GRAD_EL).forEach((el, n) => out.push([el, `${id}|${n}`]));
  });
  return out;
};

/* Keep data-solid on the right elements, also after charts re-render or animate in. */
export function useSolidElements(root: RefObject<HTMLElement | null>, off: string[] | undefined, active: boolean) {
  const sig = (off ?? []).join(',');
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const set = new Set(active ? off ?? [] : []);
    let frame = 0;
    const apply = () => { frame = 0; for (const [node, key] of keysIn(el)) { const want = set.has(key); if (want !== node.hasAttribute('data-solid')) want ? node.setAttribute('data-solid', '') : node.removeAttribute('data-solid'); } };
    apply();
    const mo = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(apply); });
    mo.observe(el, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [sig, active]);
}

/* Picking mode in the editor: outline every gradient element; a click toggles it. */
export function GradientPicker({ on, off, onChange, onDone }: { on: boolean; off: string[]; onChange: (next: string[]) => void; onDone: () => void }) {
  useEffect(() => {
    if (!on) return;
    const root = document.querySelector<HTMLElement>('.csb-preview-viewport .csb-canvas'); if (!root) return;
    root.classList.add('is-gradpick');
    const click = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.(GRAD_EL); if (!t || !root.contains(t)) return;
      e.preventDefault(); e.stopPropagation();
      const hit = keysIn(root).find(([node]) => node === t); if (!hit) return;
      const key = hit[1]; onChange(off.includes(key) ? off.filter(k => k !== key) : [...off, key]);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); };
    root.addEventListener('click', click, true); window.addEventListener('keydown', esc);
    return () => { root.classList.remove('is-gradpick'); root.removeEventListener('click', click, true); window.removeEventListener('keydown', esc); };
  }, [on, off.join(',')]);
  if (!on) return null;
  return <div className="csb-gradpick-bar" role="status">
    <span>Click any coloured element to switch its gradient off or back on.</span>
    <b>{off.length ? `${off.length} solid` : 'All gradient'}</b>
    {off.length > 0 && <button type="button" onClick={() => onChange([])}>Reset</button>}
    <button type="button" className="is-done" onClick={onDone}>Done</button>
  </div>;
}
