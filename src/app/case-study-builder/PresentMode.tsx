import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/*
  Presentation mode for a case study: full screen, one section per screen,
  arrow keys / space / click to move, Esc to leave. Works inside the Studio's
  preview (scroller = the preview viewport) and on the published page
  (scroller = the window).
*/

const SLIDES = '.csb-canvas > .csb-hx, .csb-doc-main > .csb-reveal-header, .csb-doc-main > .csb-hero, .csb-doc-main > .csb-story-section, .csb-doc-main .csb-phase-step > .csb-story-section, .csb-doc-main > .csb-canvas-end';

export function PresentMode({ scroller, onExit }: { scroller: () => HTMLElement | null; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [idle, setIdle] = useState(false);
  const timer = useRef<number | null>(null);

  const slides = () => Array.from((scroller() ?? document).querySelectorAll<HTMLElement>(SLIDES));
  const go = (next: number) => { const list = slides(); const target = list[Math.max(0, Math.min(list.length - 1, next))]; target?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  useEffect(() => {
    document.documentElement.classList.add('csb-presenting');
    // Scale the page up to fill the screen: the content column (about 1100px) grows to ~92% of the width, capped so a section still fits the height.
    const fit = () => { const z = Math.max(1, Math.min(window.innerWidth * .92 / 1100, window.innerHeight / 700, 2.4)); document.documentElement.style.setProperty('--present-zoom', z.toFixed(3)); const canvas = (scroller() ?? document).querySelector('.csb-canvas'); const bg = canvas ? getComputedStyle(canvas).backgroundColor : ''; if (bg && bg !== 'rgba(0, 0, 0, 0)') document.documentElement.style.setProperty('--present-bg', bg); };
    // The header is one screen in Present mode: shrink its mockup until the title, image and details all fit.
    const fitHeader = () => {
      const root = scroller() ?? document; const view = (scroller() && scroller() !== document.scrollingElement ? scroller()!.clientHeight : window.innerHeight);
      for (const [hSel, vSel] of [['.csb-doc-main > .csb-hero', '.csb-hero-visual'], ['.csb-canvas > .csb-hx', '.csb-hx-media']] as const) {
        const header = root.querySelector<HTMLElement>(hSel); const visual = header?.querySelector<HTMLElement>(vSel); if (!header || !visual) continue;
        visual.style.zoom = ''; header.style.justifyContent = '';
        const over = header.scrollHeight * (header.getBoundingClientRect().height / (header.offsetHeight || 1)) - view;
        if (over <= 0) continue;
        const vh = visual.getBoundingClientRect().height; if (!vh) continue;
        visual.style.zoom = String(Math.max(.4, (vh - over - view * .05) / vh).toFixed(3));
      }
    };
    const fitAll = () => { fit(); fitHeader(); };
    fitAll(); window.addEventListener('resize', fitAll);
    const later = [250, 900, 2000].map(ms => window.setTimeout(fitHeader, ms));
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    const list = slides(); setCount(list.length);
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { const i = slides().indexOf(entry.target as HTMLElement); if (i >= 0) setIndex(i); }
    }, { root: scroller() === document.scrollingElement ? null : scroller(), threshold: .55 });
    list.forEach(el => io.observe(el));
    const wake = () => { setIdle(false); if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setIdle(true), 2200); };
    wake();
    const onKey = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const current = slides().findIndex(el => { const r = el.getBoundingClientRect(); return r.top > -window.innerHeight * .45 && r.top < window.innerHeight * .55; });
      const at = current >= 0 ? current : index;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); go(at + 1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); go(at - 1); }
      else if (event.key === 'Home') { event.preventDefault(); go(0); }
      else if (event.key === 'End') { event.preventDefault(); go(slides().length - 1); }
      else if (event.key === 'Escape') onExit();
      wake();
    };
    const onFullscreen = () => { if (!document.fullscreenElement) onExit(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', wake);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.setTimeout(() => go(0), 50);
    return () => {
      document.documentElement.classList.remove('csb-presenting');
      window.removeEventListener('resize', fitAll); later.forEach(clearTimeout); (scroller() ?? document).querySelectorAll<HTMLElement>('.csb-hero-visual, .csb-hx-media').forEach(el => { el.style.zoom = ''; }); document.documentElement.style.removeProperty('--present-zoom'); document.documentElement.style.removeProperty('--present-bg');
      io.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', wake);
      document.removeEventListener('fullscreenchange', onFullscreen);
      if (timer.current) window.clearTimeout(timer.current);
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  const page = (scroller() ?? document).querySelector('.csb-canvas');
  const accent = page ? getComputedStyle(page).getPropertyValue('--csb-accent').trim() : '';
  return <>
    <div className="csb-present-progress" aria-hidden="true" style={accent ? { '--csb-accent': accent } as React.CSSProperties : undefined}><i style={{ width: `${count > 1 ? index / (count - 1) * 100 : 0}%` }} /></div>
    <div className={`csb-present-hud ${idle ? 'is-idle' : ''}`} role="toolbar" aria-label="Presentation">
      <button type="button" aria-label="Previous section" onClick={() => go(index - 1)} disabled={index === 0}><ChevronLeft size={16} /></button>
      <span aria-live="polite">{index + 1} / {count || 1}</span>
      <button type="button" aria-label="Next section" onClick={() => go(index + 1)} disabled={index >= count - 1}><ChevronRight size={16} /></button>
      <span className="csb-present-sep" />
      <button type="button" onClick={onExit}><X size={14} /> Exit</button>
    </div>
  </>;
}
