import { useContext, useEffect, useRef, useState } from 'react';
import { Media } from './Media';
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from 'motion/react';
import { ArrowDown, ArrowUp, Eye, X } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { useReducedMotion } from './MotionKit';
import { SampleScreen } from './DeviceFrame';
import type { CaseStudySection } from './model';

/*
  High-fidelity screens, shown big enough to read. Three components share this engine:
    Focus carousel   — pinned while you scroll; each screen slides to the centre and grows
    Screen story     — a big phone stays pinned; steps scroll beside it and swap the screen
    Screen filmstrip — one big screen with thumbnails to switch
  Spotlights: boxes drawn on a screen. When that screen is up close, everything
  else fades to black and a note points at the feature.
  items: one per screen (title, detail caption, image, spots[{x,y,w,h,note}])
*/

type Item = CaseStudySection['items'][number];
type Spot = NonNullable<Item['spots']>[number];
type Step = { screen: number; spot: number };

/* Jump to a screen / spotlight from the panel or a box on the page. */
type FocusDetail = { sectionId: string; screen: number; spot: number };
export const focusSpot = (detail: FocusDetail) => window.dispatchEvent(new CustomEvent('csb-sc-focus', { detail }));
function useFocusRequest(sectionId: string, handler: (d: FocusDetail) => void) {
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => { const on = (e: Event) => { const d = (e as CustomEvent<FocusDetail>).detail; if (d?.sectionId === sectionId) ref.current(d); }; window.addEventListener('csb-sc-focus', on); return () => window.removeEventListener('csb-sc-focus', on); }, [sectionId]);
}
const scrollerOf = (el: HTMLElement): HTMLElement | null => el.closest('.csb-preview-viewport') as HTMLElement | null;
const scrollToY = (el: HTMLElement, y: number) => { const sc = scrollerOf(el); if (sc) sc.scrollTo({ top: y, behavior: 'smooth' }); else window.scrollTo({ top: y, behavior: 'smooth' }); };
const docTop = (el: HTMLElement) => { const sc = scrollerOf(el); return sc ? sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top : window.scrollY + el.getBoundingClientRect().top; };

const stepsOf = (items: Item[]): Step[] => items.flatMap((item, i) => [{ screen: i, spot: -1 }, ...(item.spots ?? []).map((_, k) => ({ screen: i, spot: k }))]);
const useRatio = (src?: string, fallback = 393 / 852) => {
  const [r, setR] = useState(fallback);
  useEffect(() => { if (!src) { setR(fallback); return; } const img = new Image(); img.onload = () => img.naturalWidth && setR(img.naturalWidth / img.naturalHeight); img.src = src; }, [src, fallback]);
  return r;
};

/* ---------- One screen in a device, with spotlight + drawing ---------- */
export function Screen({ section, index, spot, side = 'right', drawing, onDrawn, slot = true, outlines }: { section: CaseStudySection; index: number; spot: number; side?: 'right' | 'left' | 'below'; drawing?: boolean; onDrawn?: (box: Omit<Spot, 'note'>) => void; slot?: boolean; outlines?: boolean }) {
  const item = section.items[index];
  const browser = section.options?.device === 'browser';
  const ratio = useRatio(item?.image, browser ? 16 / 10 : 393 / 852);
  const reduce = useReducedMotion();
  const s = spot >= 0 ? item?.spots?.[spot] : undefined;
  const [draft, setDraft] = useState<Omit<Spot, 'note'> | null>(null);
  const draw = (event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    const host = event.currentTarget as HTMLElement; const r = host.getBoundingClientRect();
    const sx = (event.clientX - r.left) / r.width, sy = (event.clientY - r.top) / r.height; let box = { x: sx, y: sy, w: 0, h: 0 };
    const move = (e: PointerEvent) => { const ex = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), ey = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); box = { x: Math.min(sx, ex), y: Math.min(sy, ey), w: Math.abs(ex - sx), h: Math.abs(ey - sy) }; setDraft(box); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setDraft(null); if (box.w > .03 && box.h > .015) onDrawn?.(box); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return <div className={`csb-sc-device ${browser ? 'is-browser' : 'is-phone'} ${s ? 'is-spot' : ''}`} style={{ '--sc-ar': ratio } as React.CSSProperties}>
    {browser && <div className="csb-sc-bar" aria-hidden="true"><i /><i /><i /></div>}
    <div className="csb-sc-screen" {...(slot ? { 'data-image-slot': `${section.id}:${index}` } : {})}>
      {item?.image ? <Media src={item.image} alt={item.title || `Screen ${index + 1}`} draggable={false} /> : <SampleScreen phone={!browser} />}
      <AnimatePresence>{s && <motion.svg key={`${index}-${spot}`} className="csb-sc-dim" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .5, ease: [0.22, 1, 0.36, 1] }}>
        <defs><mask id={`sc-m-${section.id}-${index}`}><rect width="100" height="100" fill="#fff" /><rect x={s.x * 100} y={s.y * 100} width={s.w * 100} height={s.h * 100} rx="1.6" ry={1.6 * ratio} fill="#000" /></mask></defs>
        <rect width="100" height="100" fill="#000" fillOpacity=".74" mask={`url(#sc-m-${section.id}-${index})`} />
      </motion.svg>}</AnimatePresence>
      {s && <motion.span key={`ring-${index}-${spot}`} className="csb-sc-ring" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }} initial={reduce ? false : { opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .5, delay: .15 }} />}
      {!s && !drawing && outlines && (item?.spots ?? []).map((sp, k) => <button key={k} type="button" data-no-slot className="csb-sc-outline" title={`Show spotlight ${k + 1}`} aria-label={`Show spotlight ${k + 1}`} style={{ left: `${sp.x * 100}%`, top: `${sp.y * 100}%`, width: `${sp.w * 100}%`, height: `${sp.h * 100}%` }} onClick={e => { e.stopPropagation(); focusSpot({ sectionId: section.id, screen: index, spot: k }); }}><b>{k + 1}</b></button>)}
      {s && outlines && <button type="button" data-no-slot className="csb-sc-unspot" onClick={e => { e.stopPropagation(); focusSpot({ sectionId: section.id, screen: index, spot: -1 }); }}>Back to full screen</button>}
      {drawing && <div className="csb-sc-draw" data-no-slot onPointerDown={draw} onClick={e => e.stopPropagation()}><span>Drag a box around the feature</span>{draft && <i style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} />}</div>}
    </div>
    {s && side !== 'below' && <motion.div key={`note-${index}-${spot}`} className={`csb-sc-note is-${side}`} style={{ top: `calc(${(s.y + s.h / 2) * 100}% + ${browser ? 14 : 0}px)` }} initial={reduce ? false : { opacity: 0, x: side === 'right' ? -8 : 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .5, delay: .25, ease: [0.22, 1, 0.36, 1] }}>
      <span className="csb-sc-leader" aria-hidden="true" />
      <p><EditableText field={`deep:items.${index}.spots.${spot}.note`} value={s.note} /></p>
    </motion.div>}
  </div>;
}

/* Editor helpers shown under a focused screen */
function SpotTools({ section, index, drawing, setDrawing }: { section: CaseStudySection; index: number; drawing: boolean; setDrawing: (v: boolean) => void }) {
  const { edit } = useContext(EditingContext);
  if (!edit) return null;
  return <div className="csb-sc-tools" data-no-slot onClick={e => e.stopPropagation()}>
    <button type="button" aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>{drawing ? 'Cancel' : '+ Spotlight a feature'}</button>
    {(section.items[index]?.spots?.length ?? 0) > 0 && <span>{section.items[index].spots!.length} spotlight{section.items[index].spots!.length > 1 ? 's' : ''}</span>}
  </div>;
}
const addSpot = (section: CaseStudySection, edit: ((f: string, v: string) => void) | undefined, index: number, box: Omit<Spot, 'note'>) =>
  edit?.('json:items', JSON.stringify(section.items.map((it, i) => i === index ? { ...it, spots: [...(it.spots ?? []), { ...box, note: 'What makes this detail matter' }] } : it)));

/* Pinned scroll progress: 0 when the block's top reaches the top of the screen, 1 when its bottom reaches the bottom. */
function usePinnedProgress(ref: React.RefObject<HTMLElement | null>): MotionValue<number> {
  const p = useMotionValue(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const scroller: HTMLElement | Window = (el.closest('.csb-preview-viewport') as HTMLElement | null) ?? window;
    let raf = 0;
    const measure = () => { raf = 0; const r = el.getBoundingClientRect(); const box = scroller instanceof Window ? { top: 0, height: window.innerHeight } : scroller.getBoundingClientRect(); p.set(Math.min(1, Math.max(0, (box.top - r.top) / Math.max(1, r.height - box.height)))); };
    const on = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure(); scroller.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    return () => { scroller.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [ref, p]);
  return p;
}

/* ---------- Focus carousel ---------- */
function CarouselCard({ section, index, pos, active, spot, drawing, onDrawn, editing }: { section: CaseStudySection; index: number; pos: MotionValue<number>; active: boolean; spot: number; drawing: boolean; onDrawn: (b: Omit<Spot, 'note'>) => void; editing: boolean }) {
  const reduce = useReducedMotion();
  const d = useTransform(pos, v => index - v);
  const x = useTransform(d, v => `calc(-50% + ${v * 74}%)`);
  const scale = useTransform(d, v => 1 - Math.min(Math.abs(v), 2) * .2);
  const opacity = useTransform(d, v => Math.abs(v) > 2.6 ? 0 : 1 - Math.min(Math.abs(v), 2) * .3);
  const rotateY = useTransform(d, v => reduce ? 0 : Math.max(-1, Math.min(1, v)) * -14);
  const zIndex = useTransform(d, v => 10 - Math.round(Math.abs(v) * 2));
  return <motion.div className={`csb-sc-card ${active ? 'is-active' : ''}`} style={{ x, scale, opacity, rotateY, zIndex }}>
    <Screen section={section} index={index} spot={active ? spot : -1} side="right" drawing={active && drawing} onDrawn={onDrawn} outlines={active && editing} />
  </motion.div>;
}

export function FocusCarousel({ section }: { section: CaseStudySection }) {
  const { edit } = useContext(EditingContext);
  const items = section.items;
  const steps = stepsOf(items);
  const ref = useRef<HTMLDivElement>(null);
  const progress = usePinnedProgress(ref);
  const [step, setStep] = useState(0);
  const [drawing, setDrawing] = useState(false);
  // Continuous screen position: moves between screens, holds still while that screen's spotlights play.
  const pos = useTransform(progress, v => {
    const f = v * Math.max(0, steps.length - 1); const a = Math.floor(f), b = Math.min(steps.length - 1, a + 1); const t = f - a;
    const ease = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return (steps[a]?.screen ?? 0) + ((steps[b]?.screen ?? 0) - (steps[a]?.screen ?? 0)) * ease;
  });
  useMotionValueEvent(progress, 'change', v => { const k = Math.round(v * Math.max(0, steps.length - 1)); setStep(prev => prev === k ? prev : k); });
  const cur = steps[step] ?? { screen: 0, spot: -1 };
  const item = items[cur.screen];
  useFocusRequest(section.id, d => {
    const el = ref.current; if (!el) return;
    const k = steps.findIndex(st => st.screen === d.screen && st.spot === d.spot); if (k < 0) return;
    const sc = scrollerOf(el); const h = sc ? sc.clientHeight : window.innerHeight;
    scrollToY(el, docTop(el) + (el.offsetHeight - h) * (k / Math.max(1, steps.length - 1)) + 2);
  });
  // The stage pins for the height of the visible window (the editor's preview, or the browser).
  const [vh, setVh] = useState(800);
  useEffect(() => { const el = ref.current; if (!el) return; const sc = el.closest('.csb-preview-viewport') as HTMLElement | null; const m = () => setVh(sc ? sc.clientHeight : window.innerHeight); m(); window.addEventListener('resize', m); return () => window.removeEventListener('resize', m); }, []);
  return <div ref={ref} className="csb-sc-pin" style={{ height: Math.max(2, steps.length) * vh * .6 + vh, '--sc-h': `${vh}px` } as React.CSSProperties}>
    <div className={`csb-sc-stage ${cur.spot >= 0 ? 'is-spot' : ''}`}>
      <div className="csb-sc-track">{items.map((_, i) => <CarouselCard key={i} section={section} index={i} pos={pos} active={i === cur.screen} spot={cur.spot} drawing={drawing} editing={!!edit} onDrawn={box => { addSpot(section, edit, i, box); setDrawing(false); }} />)}</div>
      <div className="csb-sc-caption">
        <AnimatePresence mode="wait"><motion.div key={cur.screen} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .3 }}>
          <strong><EditableText field={`items.${cur.screen}.title`} value={item?.title || ''} /></strong>
          <span><EditableText field={`items.${cur.screen}.detail`} value={item?.detail || ''} /></span>
        </motion.div></AnimatePresence>
        <div className="csb-sc-progress" aria-label={`Screen ${cur.screen + 1} of ${items.length}`}><b>{cur.screen + 1}</b> / {items.length}<span>{items.map((_, i) => <i key={i} className={i === cur.screen ? 'is-on' : ''} />)}</span></div>
        <SpotTools section={section} index={cur.screen} drawing={drawing} setDrawing={setDrawing} />
      </div>
    </div>
  </div>;
}

/* ---------- Screen story ---------- */
function StoryStep({ section, step }: { section: CaseStudySection; step: Step }) {
  const item = section.items[step.screen];
  const isSpot = step.spot >= 0;
  return <div data-step className={`csb-sc-step ${isSpot ? 'is-spot' : ''}`}>
    {isSpot
      ? <><small>Detail</small><p className="csb-sc-step-note"><EditableText field={`deep:items.${step.screen}.spots.${step.spot}.note`} value={item.spots![step.spot].note} /></p></>
      : <><small>{String(step.screen + 1).padStart(2, '0')}</small><h3><EditableText field={`items.${step.screen}.title`} value={item?.title || ''} /></h3><p><EditableText field={`items.${step.screen}.detail`} value={item?.detail || ''} /></p></>}
  </div>;
}

export function ScreenStory({ section }: { section: CaseStudySection }) {
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion();
  const steps = stepsOf(section.items);
  const [active, setActive] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const cur = steps[active] ?? { screen: 0, spot: -1 };
  const list = useRef<HTMLDivElement>(null);
  useFocusRequest(section.id, d => {
    const el = list.current; if (!el) return;
    const k = steps.findIndex(st => st.screen === d.screen && st.spot === d.spot); const node = el.querySelectorAll<HTMLElement>('[data-step]')[k]; if (!node) return;
    const sc = scrollerOf(node); const h = sc ? sc.clientHeight : window.innerHeight;
    scrollToY(node, docTop(node) - h / 2 + node.offsetHeight / 2);
  });
  useEffect(() => {
    const el = list.current; if (!el) return;
    const scroller: HTMLElement | Window = (el.closest('.csb-preview-viewport') as HTMLElement | null) ?? window;
    let raf = 0;
    const pick = () => { raf = 0; const box = scroller instanceof Window ? { top: 0, height: window.innerHeight } : scroller.getBoundingClientRect(); const mid = box.top + box.height / 2; let best = 0, dist = Infinity;
      el.querySelectorAll<HTMLElement>('[data-step]').forEach((node, i) => { const r = node.getBoundingClientRect(); const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0; if (d < dist) { dist = d; best = i; } });
      setActive(a => a === best ? a : best); };
    const on = () => { if (!raf) raf = requestAnimationFrame(pick); };
    pick(); scroller.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on);
    return () => { scroller.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [steps.length]);
  return <div className="csb-sc-story">
    <div className="csb-sc-steps" ref={list}>{steps.map(s => <StoryStep key={`${s.screen}-${s.spot}`} section={section} step={s} />)}</div>
    <div className="csb-sc-sticky">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={cur.screen} className="csb-sc-story-screen" initial={reduce ? false : { opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .98 }} transition={{ duration: .45, ease: [0.22, 1, 0.36, 1] }}>
          <Screen section={section} index={cur.screen} spot={cur.spot} side="below" drawing={drawing} outlines={!!edit} onDrawn={box => { addSpot(section, edit, cur.screen, box); setDrawing(false); }} />
        </motion.div>
      </AnimatePresence>
      <SpotTools section={section} index={cur.screen} drawing={drawing} setDrawing={setDrawing} />
    </div>
  </div>;
}

/* ---------- Screen filmstrip ---------- */
export function ScreenFilmstrip({ section }: { section: CaseStudySection }) {
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState(-1);
  const [drawing, setDrawing] = useState(false);
  const items = section.items; const i = Math.min(index, items.length - 1); const item = items[i];
  const go = (n: number) => { setIndex((n + items.length) % items.length); setSpot(-1); setDrawing(false); };
  const stripRef = useRef<HTMLDivElement>(null);
  useFocusRequest(section.id, d => { setIndex(d.screen); setSpot(d.spot); setDrawing(false); const el = stripRef.current; if (el) { const sc = scrollerOf(el); const h = sc ? sc.clientHeight : window.innerHeight; const r = el.getBoundingClientRect(); const box = sc ? sc.getBoundingClientRect() : { top: 0 }; if (r.top < box.top || r.top > box.top + h * .5) scrollToY(el, docTop(el) - 40); } });
  return <div ref={stripRef} className="csb-sc-strip">
    <div className="csb-sc-strip-main">
      <button type="button" className="csb-sc-nav" aria-label="Previous screen" onClick={e => { e.stopPropagation(); go(i - 1); }}>‹</button>
      <AnimatePresence mode="wait" initial={false}><motion.div key={i} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}>
        <Screen section={section} index={i} spot={spot} side="right" drawing={drawing} outlines={!!edit} onDrawn={box => { addSpot(section, edit, i, box); setDrawing(false); }} />
      </motion.div></AnimatePresence>
      <button type="button" className="csb-sc-nav" aria-label="Next screen" onClick={e => { e.stopPropagation(); go(i + 1); }}>›</button>
    </div>
    <div className="csb-sc-caption">
      <strong><EditableText field={`items.${i}.title`} value={item?.title || ''} /></strong>
      <span><EditableText field={`items.${i}.detail`} value={item?.detail || ''} /></span>
      {(item?.spots?.length ?? 0) > 0 && <div className="csb-sc-spots" role="group" aria-label="Highlights">{item.spots!.map((_, k) => <button key={k} type="button" aria-pressed={spot === k} onClick={e => { e.stopPropagation(); setSpot(spot === k ? -1 : k); }}>Highlight {k + 1}</button>)}</div>}
      <SpotTools section={section} index={i} drawing={drawing} setDrawing={setDrawing} />
    </div>
    <div className="csb-sc-thumbs" role="group" aria-label="Screens">{items.map((it, k) => <button key={k} type="button" aria-pressed={k === i} aria-label={it.title || `Screen ${k + 1}`} onClick={e => { e.stopPropagation(); go(k); }}>{it.image ? <Media src={it.image} alt="" /> : <span />}</button>)}</div>
  </div>;
}

/* ---------- Inspector (shared) ---------- */
export function ScreensControls({ section, onChange }: { section: CaseStudySection; onChange: (patch: Partial<CaseStudySection>) => void }) {
  const items = section.items;
  const setItems = (next: Item[]) => onChange({ items: next });
  const move = (i: number, j: number) => { const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; setItems(n); };
  const setSpot = (i: number, k: number, note: string) => setItems(items.map((x, n) => n === i ? { ...x, spots: x.spots!.map((y, m) => m === k ? { ...y, note } : y) } : x));
  const dropSpot = (i: number, k: number) => setItems(items.map((x, n) => n === i ? { ...x, spots: x.spots!.filter((_, m) => m !== k) } : x));
  const browser = section.options?.device === 'browser';
  return <div className="csb-items csb-sc-ctl">
    <div className="csb-field"><span className="csb-field-label">Device</span><div className="csb-segment" role="group" aria-label="Device">
      {([['phone', 'Phone'], ['browser', 'Browser']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={(section.options?.device ?? 'phone') === v} onClick={() => onChange({ options: { ...(section.options ?? {}), device: v } })}>{l}</button>)}
    </div></div>
    <p className="csb-panel-kicker">Screens · {items.length}</p>
    <ol>{items.map((it, i) => <li key={i} className="csb-sc-ctl-row">
      <span className={`csb-sc-ctl-thumb ${browser ? 'is-wide' : ''}`}>{it.image ? <Media src={it.image} alt="" /> : null}</span>
      <span className="csb-sc-ctl-name"><button type="button" className="csb-sc-ctl-show" title="Show this screen on the page" onClick={() => focusSpot({ sectionId: section.id, screen: i, spot: -1 })}><strong>{it.title || `Screen ${i + 1}`}</strong></button><small>{(it.spots?.length ?? 0) ? `${it.spots!.length} spotlight${it.spots!.length > 1 ? 's' : ''}` : it.image ? 'No spotlights' : 'No image yet'}</small></span>
      <button type="button" aria-label={`Move ${it.title || 'screen'} up`} title="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></button>
      <button type="button" aria-label={`Move ${it.title || 'screen'} down`} title="Move down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></button>
      <button type="button" aria-label={`Remove ${it.title || 'screen'}`} title="Remove screen" disabled={items.length <= 1} onClick={() => setItems(items.filter((_, k) => k !== i))}><X size={13} /></button>
      {(it.spots ?? []).map((sp, k) => <div key={k} className="csb-sc-ctl-spot">
        <div className="csb-sc-ctl-spot-head"><label htmlFor={`sc-spot-${section.id}-${i}-${k}`}>Spotlight {k + 1}</label><button type="button" className="csb-sc-ctl-showbtn" onClick={() => focusSpot({ sectionId: section.id, screen: i, spot: k })}><Eye size={12} /> Show</button></div>
        <textarea id={`sc-spot-${section.id}-${i}-${k}`} rows={2} value={sp.note} onChange={e => setSpot(i, k, e.target.value)} />
        <button type="button" aria-label={`Remove spotlight ${k + 1}`} title="Remove spotlight" onClick={() => dropSpot(i, k)}><X size={13} /></button>
      </div>)}
    </li>)}</ol>
    <button type="button" className="csb-items-add" onClick={() => setItems([...items, { title: `Screen ${items.length + 1}`, detail: 'What this screen does.', image: '', spots: [] }])}>+ Add screen</button>
    <p className="csb-field-note">On the page: click a screen to add its image, and use “+ Spotlight a feature” under the screen in focus to box a detail.</p>
  </div>;
}
