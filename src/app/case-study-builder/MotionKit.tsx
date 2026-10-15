import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useInView, useMotionValue, useReducedMotion as useSystemReducedMotion, type MotionValue } from 'motion/react';

/* Motion preferences for the page.
   level: 'expressive' (default) adds scroll-driven, data-rich motion; 'calm' keeps gentle fades.
   force: the editor's Preview can play motion even when the computer has Reduce Motion on.
   Published pages always respect a visitor's Reduce Motion setting. */
export const MotionPrefs = createContext<{ force?: boolean; level?: 'calm' | 'expressive' }>({});
export function useReducedMotion() { const system = useSystemReducedMotion(); const { force } = useContext(MotionPrefs); return force ? false : !!system; }
export function useExpressive() { const { level } = useContext(MotionPrefs); return !useReducedMotion() && level !== 'calm'; }

/* 0 → 1 as an element travels through the viewport, from when its top reaches
   `start` (fraction of the viewport height) until its bottom reaches `end`.
   Works inside the editor's scrolling preview and on the published page. */
export function useScrollProgress(ref: React.RefObject<HTMLElement | SVGElement | null>, start = 0.85, end = 0.45): MotionValue<number> {
  const progress = useMotionValue(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const scroller: HTMLElement | Window = (el as HTMLElement).closest?.('.csb-preview-viewport') as HTMLElement | null ?? window;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const box = scroller instanceof Window ? { top: 0, height: window.innerHeight } : (scroller as HTMLElement).getBoundingClientRect();
      const from = box.top + box.height * start; const to = box.top + box.height * end;
      const total = (from - to) + rect.height;
      progress.set(Math.min(1, Math.max(0, (from - rect.top) / (total || 1))));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    scroller.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { scroller.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [ref, start, end, progress]);
  return progress;
}

/* Counts a number up from 0 when it scrolls into view. Keeps any prefix or
   suffix ("$140K", "92%"). Shows the final value immediately for people who
   prefer reduced motion. */
export function CountUp({ value, duration = 1200, delay = 0 }: { value: string; duration?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true, amount: .6 });
  const reduce = useReducedMotion();
  const match = value.match(/^([^\d]*)(\d+(?:\.\d+)?)(.*)$/);
  const [shown, setShown] = useState(reduce || !match ? match?.[2] ?? value : '0');
  useEffect(() => {
    if (!visible || !match || reduce) { if (match) setShown(match[2]); return; }
    const target = Number(match[2]);
    const decimals = (match[2].split('.')[1] ?? '').length;
    let frame = 0; let started = 0;
    const tick = (now: number) => {
      if (!started) started = now + delay;
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      setShown((target * (1 - Math.pow(1 - progress, 4))).toFixed(decimals));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, value, reduce]);
  return <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>{match ? <>{match[1]}{shown}{match[3]}</> : value}</span>;
}

export const easeOut = [0.22, 1, 0.36, 1] as const;

/* 0 → 1 while a sticky child is pinned inside `scene` (pinned `top` = fraction of the viewport).
   Works in the editor's scrolling preview and on the published page. */
export function usePinProgress(scene: React.RefObject<HTMLElement | null>, stick: React.RefObject<HTMLElement | null>, top = .3): MotionValue<number> {
  const p = useMotionValue(0);
  useEffect(() => {
    const el = scene.current; if (!el) return;
    const scroller: HTMLElement | Window = el.closest('.csb-preview-viewport') as HTMLElement | null ?? window;
    let frame = 0;
    const measure = () => { frame = 0; const r = el.getBoundingClientRect(); const box = scroller instanceof Window ? { top: 0, height: window.innerHeight } : scroller.getBoundingClientRect();
      const pin = box.top + box.height * top; const travel = r.height - (stick.current?.offsetHeight ?? 0);
      p.set(Math.min(1, Math.max(0, (pin - r.top) / (travel || 1)))); };
    const on = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure(); scroller.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    return () => { scroller.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (frame) cancelAnimationFrame(frame); };
  }, [p, top]);
  return p;
}
