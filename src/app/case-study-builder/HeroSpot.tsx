import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EditingContext } from './EditableText';
import type { BuilderStudy } from './model';

/*
  Spotlight: one part of the hero screen (say, a comment nudge) lifted out and shown larger,
  floating over the screen. Optionally the screen dims a little and a soft ring marks where
  that part lives, joined to the card by a hairline.
  In the editor: drag the card or the ring to move them, drag a corner to resize, click the card to add its image.
*/
export type Spot = NonNullable<BuilderStudy['heroSpot']>;
export const SPOT_DEFAULT: Spot = { on: true, x: 72, y: 46, w: 34, dim: true, ring: false, rx: 62, ry: 44, rw: 18, rh: 16 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
// After a drag, the browser still sends a click; don't let it open the image picker.
const eatNextClick = () => { const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); }; window.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', stop, true), 400); };

export function HeroSpot({ spot }: { spot: Spot }) {
  const { edit } = useContext(EditingContext);
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // Line up with the actual screen inside the device (or the plain hero image), not the whole mockup.
  const [area, setArea] = useState<{ left: number; top: number; width: number; height: number; radius: string } | null>(null);
  useLayoutEffect(() => {
    const host = box.current?.parentElement; if (!host) return;
    const measure = () => {
      const scr = host.querySelector<HTMLElement>('[data-image-slot="hero"]'); if (!scr) { setArea(null); return; }
      const a = host.getBoundingClientRect(), b = scr.getBoundingClientRect();
      const k = a.width ? host.offsetWidth / a.width : 1;   // undo any scale on the host itself
      const next = { left: (b.left - a.left) * k, top: (b.top - a.top) * k, width: b.width * k, height: b.height * k, radius: getComputedStyle(scr).borderRadius };
      setArea(prev => prev && Math.abs(prev.left - next.left) < .5 && Math.abs(prev.top - next.top) < .5 && Math.abs(prev.width - next.width) < .5 && Math.abs(prev.height - next.height) < .5 ? prev : next);
    };
    // Headers animate and scale their device in, which a ResizeObserver can't see: re-measure every frame
    // for the first few seconds, then whenever the page scrolls or resizes.
    let raf = 0, until = performance.now() + 3500, queued = 0;
    const loop = () => { measure(); if (performance.now() < until) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const soon = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; measure(); }); };
    const ro = new ResizeObserver(soon); ro.observe(host); const scr = host.querySelector('[data-image-slot="hero"]'); if (scr) ro.observe(scr);
    document.addEventListener('scroll', soon, { capture: true, passive: true }); window.addEventListener('resize', soon);
    host.addEventListener('load', () => { until = performance.now() + 800; raf = requestAnimationFrame(loop); }, true);
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(queued); ro.disconnect(); document.removeEventListener('scroll', soon, true); window.removeEventListener('resize', soon); };
  }, []);
  const s = { ...SPOT_DEFAULT, ...spot };
  const save = (p: Partial<Spot>) => edit?.('json:heroSpot', JSON.stringify({ ...s, ...p }));

  // One drag helper for moving and resizing either the card or the ring (all in % of the screen area).
  const drag = (e: React.PointerEvent, apply: (dx: number, dy: number) => Partial<Spot>) => {
    if (!edit || !box.current) return;
    e.stopPropagation();
    const r = box.current.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY; let moved = false; let last: Partial<Spot> = {};
    const el = e.currentTarget as HTMLElement; el.setPointerCapture?.(e.pointerId);
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / r.width * 100, dy = (ev.clientY - sy) / r.height * 100;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; moved = true;
      last = apply(dx, dy); box.current?.style.setProperty('--spot-live', '1');
      // Move live with CSS variables; save once at the end.
      const v = { ...s, ...last }; const st = box.current!.style;
      st.setProperty('--sx', `${v.x}%`); st.setProperty('--sy', `${v.y}%`); st.setProperty('--sw', `${v.w}%`);
      st.setProperty('--rx', `${v.rx}%`); st.setProperty('--ry', `${v.ry}%`); st.setProperty('--rw', `${v.rw}%`); st.setProperty('--rh', `${v.rh}%`);
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) { eatNextClick(); save(last); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  // The card may hang off the mockup, but never off the page (it would be cut off, or scroll sideways).
  const cardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const c = cardRef.current, page = c?.closest('.csb-canvas, .csb-hx, .csb-cover') as HTMLElement | null; if (!c || !page) return;
      c.style.setProperty('--spot-fx', '0px'); c.style.setProperty('--spot-fy', '0px');
      const r = c.getBoundingClientRect(), P = page.getBoundingClientRect(), g = 12;
      const fx = r.right > P.right - g ? P.right - g - r.right : r.left < P.left + g ? P.left + g - r.left : 0;
      const k = r.width ? c.offsetWidth / r.width : 1;   // the editor preview is scaled down
      c.style.setProperty('--spot-fx', `${fx * k}px`);
    };
    fit(); const t = setInterval(fit, 500); window.addEventListener('resize', fit);
    return () => { clearInterval(t); window.removeEventListener('resize', fit); };
  });
  const vars = { '--sx': `${s.x}%`, '--sy': `${s.y}%`, '--sw': `${s.w}%`, '--rx': `${s.rx}%`, '--ry': `${s.ry}%`, '--rw': `${s.rw}%`, '--rh': `${s.rh}%` } as React.CSSProperties;
  const enter = (delay: number, y = 18) => reduce
    ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, transition: { duration: .4, delay } }
    : { initial: { opacity: 0, y, scale: .95 }, whileInView: { opacity: 1, y: 0, scale: 1 }, transition: { type: 'spring' as const, stiffness: 160, damping: 22, delay } };
  const view = { once: true, amount: .4 };
  return <div ref={box} className={`csb-spot ${edit ? 'is-editing' : ''}`} style={{ ...vars, ...(area ? { inset: 'auto', left: area.left, top: area.top, width: area.width, height: area.height, borderRadius: area.radius } : {}) }}>
    {s.dim && <motion.i className="csb-spot-dim" aria-hidden="true" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={view} transition={{ duration: .6, delay: .2 }} />}
    {s.ring && <>
      <svg className="csb-spot-line" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100"><motion.line x1={s.rx + s.rw / 2} y1={s.ry + s.rh / 2} x2={s.x} y2={s.y} vectorEffect="non-scaling-stroke"
        initial={{ pathLength: reduce ? 1 : 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={view} transition={{ duration: .5, delay: .45 }} /></svg>
      <motion.div className="csb-spot-ring" data-no-slot onPointerDown={e => drag(e, (dx, dy) => ({ rx: clamp(s.rx + dx, 0, 100 - s.rw), ry: clamp(s.ry + dy, 0, 100 - s.rh) }))}
        initial={{ opacity: 0, scale: reduce ? 1 : 1.15 }} whileInView={{ opacity: 1, scale: 1 }} viewport={view} transition={{ duration: .45, delay: .3 }}>
        {edit && <b className="csb-spot-handle" onPointerDown={e => drag(e, (dx, dy) => ({ rw: clamp(s.rw + dx, 4, 100 - s.rx), rh: clamp(s.rh + dy, 4, 100 - s.ry) }))} />}
      </motion.div>
    </>}
    <motion.div ref={cardRef} className={`csb-spot-card ${s.image ? 'has-image' : ''} ${s.round ? 'is-round' : ''}`} data-image-slot="heroSpot" {...enter(.55)} viewport={view}
      onPointerDown={e => drag(e, (dx, dy) => ({ x: clamp(s.x + dx, -15, 115), y: clamp(s.y + dy, -15, 115) }))}>
      {s.image ? <img src={s.image} alt={s.alt || 'Highlighted part of the screen'} draggable={false} /> : edit ? <span className="csb-spot-empty"><strong>Spotlight</strong>Click to add the part you want to highlight. Paste a Figma frame or upload an image.</span> : null}
      {edit && <b className="csb-spot-handle" data-no-slot onPointerDown={e => drag(e, dx => ({ w: clamp(s.w + dx * 2, 12, 80) }))} />}
    </motion.div>
  </div>;
}
