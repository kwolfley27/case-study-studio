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
      setArea({ left: b.left - a.left, top: b.top - a.top, width: b.width, height: b.height, radius: getComputedStyle(scr).borderRadius });
    };
    measure(); const ro = new ResizeObserver(measure); ro.observe(host); const scr = host.querySelector('[data-image-slot="hero"]'); if (scr) ro.observe(scr);
    return () => ro.disconnect();
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
    <motion.div className={`csb-spot-card ${s.image ? 'has-image' : ''}`} data-image-slot="heroSpot" {...enter(.55)} viewport={view}
      onPointerDown={e => drag(e, (dx, dy) => ({ x: clamp(s.x + dx, 5, 95), y: clamp(s.y + dy, 5, 95) }))}>
      {s.image ? <img src={s.image} alt={s.alt || 'Highlighted part of the screen'} draggable={false} /> : edit ? <span className="csb-spot-empty"><strong>Spotlight</strong>Click to add the part you want to highlight. Paste a Figma frame or upload an image.</span> : null}
      {edit && <b className="csb-spot-handle" data-no-slot onPointerDown={e => drag(e, dx => ({ w: clamp(s.w + dx * 2, 12, 80) }))} />}
    </motion.div>
  </div>;
}
