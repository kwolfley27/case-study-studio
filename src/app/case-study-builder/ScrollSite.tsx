import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Columns3, Crosshair, Eye, EyeOff, MousePointer2, Plus, Trash2 } from 'lucide-react';
import { HoldIt } from './HoldIt';
import { EditableText, EditingContext } from './EditableText';
import { useExpressive } from './MotionKit';

/* Rect in the page's own units, undoing any CSS zoom on an ancestor (present mode zooms the page). */
const zoomOf = (el: HTMLElement) => { const w = el.getBoundingClientRect().width; return el.offsetWidth && w ? w / el.offsetWidth : 1; };
const zr = (el: Element, z: number) => { const r = el.getBoundingClientRect(); return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z }; };
import type { CaseStudySection } from './model';

/*
  Scrolling site: the long frames work like a Figma prototype you can scroll (not click).
  Scroll inside the MacBook or the iPhone; each note is attached to a spot on its frame
  (a small numbered marker), and only the note whose spot is on screen is shown.

  items[0] = desktop frame (image / figmaUrl), items[1] = mobile frame,
  items[2..] = notes: title, detail, point = where on the frame (0–100, top to bottom), value = 'desktop' | 'mobile'.
  options.show = 'both' | 'desktop' | 'mobile'. Layout grid options: see the controls.

  Two stages (options.compare): items[0..1] = first stage (e.g. wireframe), items[2..3] = second stage
  (e.g. high fidelity), notes from items[4..] with when = 'a' | 'b' (default 'b').
  One click switches the frames in place and keeps your place on the page.
  options.stageA / stageB = the two names.
*/
type Stage = 'a' | 'b';
export const stageBase = (section: CaseStudySection) => section.options?.compare ? 4 : 2;
type Device = 'desktop' | 'mobile';
type Note = { title: string; detail: string; at: number; device: Device; i: number; when?: string; side?: string; box?: string };
type View = { top: number; bottom: number };
type Grid = { cols: number; margin: number; gutter: number } | null;

/*
  A frame that holds several phone screenshots side by side (e.g. the old site captured in 3 screens)
  is shown as one long page: the screens are found automatically (columns that differ from the
  background colour) and stacked top to bottom, so it scrolls like the real thing.
*/
type Seg = { x: number; y: number; w: number; h: number };
export function useScreens(image: string | undefined, on: boolean) {
  const [segs, setSegs] = useState<{ W: number; H: number; list: Seg[] } | null>(null);
  useEffect(() => {
    setSegs(null); if (!image || !on) return;
    let dead = false; const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (dead) return;
      const W = img.naturalWidth, H = img.naturalHeight; const k = Math.min(1, 800 / W);
      const w = Math.round(W * k), h = Math.round(H * k);
      try {
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.drawImage(img, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data; const bg = [d[0], d[1], d[2]];
        const diff = (x: number, y: number) => { const i = (y * w + x) * 4; return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 24; };
        const col = (x: number) => { let n = 0; for (let y = 0; y < h; y += 2) if (diff(x, y)) n++; return n / (h / 2) > .02; };
        const runs: Array<[number, number]> = []; let start = -1;
        for (let x = 0; x <= w; x++) { const on = x < w && col(x); if (on && start < 0) start = x; if (!on && start >= 0) { if (x - start > w * .06) runs.push([start, x]); start = -1; } }
        if (runs.length < 2) { setSegs(null); return; }
        const list = runs.map(([x0, x1]) => { let y0 = 0, y1 = h; const row = (y: number) => { let n = 0; for (let x = x0; x < x1; x += 2) if (diff(x, y)) n++; return n > 0; };
          while (y0 < h && !row(y0)) y0++; while (y1 > y0 && !row(y1 - 1)) y1--;
          return { x: x0 / k, y: y0 / k, w: (x1 - x0) / k, h: (y1 - y0) / k }; });
        setSegs({ W, H, list });
      } catch { setSegs(null); }
    };
    img.src = image; return () => { dead = true; };
  }, [image, on]);
  return segs;
}

/** Last view of each section's screens, so the inspector can place a note "where I am now". */
export const lastView = new Map<string, { device: Device; center: number }>();

const parseBox = (b?: string) => { const v = String(b ?? '').split(',').map(Number); return v.length === 4 && v.every(Number.isFinite) ? v : null; };

function Screen({ image, slot, label, grid, notes, activeI, onView, scrollRef, editorMode, onMoveNote, takeRestore, stack, onBox }: {
  image?: string; slot: string; label: string; grid?: Grid; notes: Note[]; activeI: number | null; takeRestore?: () => number | null; stack?: boolean;
  onView: (v: View, byUser?: boolean) => void; scrollRef: (el: HTMLDivElement | null) => void; editorMode?: boolean; onMoveNote: (i: number, at: number) => void; onBox?: (i: number, box: string, center: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const silent = useRef(false);
  const segs = useScreens(image, !!stack);
  useEffect(() => { report(); }, [segs]);
  const report = (byUser = false) => { const el = scroller.current; if (!el || !el.scrollHeight) return; onView({ top: el.scrollTop / el.scrollHeight, bottom: (el.scrollTop + el.clientHeight) / el.scrollHeight }, byUser); };
  useLayoutEffect(() => { report(); const ro = new ResizeObserver(() => report()); if (scroller.current) ro.observe(scroller.current); return () => ro.disconnect(); }, [image]);
  const drag = (n: Note) => (e: React.PointerEvent) => {
    if (!editorMode) return; e.preventDefault(); e.stopPropagation();
    const at = (ev: { clientY: number }) => { const r = content.current!.getBoundingClientRect(); return Math.round(Math.min(100, Math.max(0, (ev.clientY - r.top) / r.height * 100)) * 10) / 10; };
    const t = e.currentTarget as HTMLElement; t.setPointerCapture(e.pointerId); let last = at(e);
    const move = (ev: PointerEvent) => { last = at(ev); t.style.top = `${last}%`; };
    const up = () => { t.removeEventListener('pointermove', move); t.removeEventListener('pointerup', up); onMoveNote(n.i, last); };
    t.addEventListener('pointermove', move); t.addEventListener('pointerup', up);
  };
  // Resize / move a note's highlight (editor). Saved as "x,y,w,h" in % of the frame; the note's spot follows its centre.
  const boxDrag = (n: Note, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
    if (!editorMode || !content.current) return; e.preventDefault(); e.stopPropagation();
    const band = (e.currentTarget as HTMLElement).closest('.csb-ss-band') as HTMLElement; const R0 = content.current.getBoundingClientRect(), B = band.getBoundingClientRect();
    const st = { x: (B.left - R0.left) / R0.width * 100, y: (B.top - R0.top) / R0.height * 100, w: B.width / R0.width * 100, h: B.height / R0.height * 100 };
    const minH = 20 / R0.height * 100, sx = e.clientX, sy = e.clientY; let nb = { ...st };
    const t = e.currentTarget as HTMLElement; t.setPointerCapture(e.pointerId);
    const apply = () => { band.classList.add('has-box'); band.style.removeProperty('top'); band.style.setProperty('--bx', `${nb.x}%`); band.style.setProperty('--by', `${nb.y}%`); band.style.setProperty('--bw', `${nb.w}%`); band.style.setProperty('--bh', `${nb.h}%`); };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / R0.width * 100, dy = (ev.clientY - sy) / R0.height * 100; let { x, y, w, h } = st;
      if (mode === 'move') { x += dx; y += dy; }
      if (mode === 'nw' || mode === 'sw') { x += dx; w -= dx; } if (mode === 'ne' || mode === 'se') w += dx;
      if (mode === 'nw' || mode === 'ne') { y += dy; h -= dy; } if (mode === 'sw' || mode === 'se') h += dy;
      w = Math.max(6, w); h = Math.max(minH, h); x = Math.min(100 - w, Math.max(0, x)); y = Math.min(100 - h, Math.max(0, y));
      nb = { x, y, w, h }; apply();
    };
    const up = () => { t.removeEventListener('pointermove', move); t.removeEventListener('pointerup', up); const r = (v: number) => Math.round(v * 100) / 100; onBox?.(n.i, [nb.x, nb.y, nb.w, nb.h].map(r).join(','), r(nb.y + nb.h / 2)); };
    t.addEventListener('pointermove', move); t.addEventListener('pointerup', up);
  };
  return <div className={`csb-ss-screen ${editorMode ? 'is-editing' : ''}`} data-image-slot={slot}>
    {image ? <div className="csb-ss-scroll" ref={el => { scroller.current = el; scrollRef(el); }} tabIndex={0} aria-label={`${label}: scroll to explore`} onScroll={() => { if (silent.current) { silent.current = false; report(); return; } if (!scrolled) setScrolled(true); report(true); }}>
      <div className="csb-ss-content" ref={content}>
        {segs ? <div className="csb-ss-frame csb-ss-stack" role="img" aria-label={label}>{segs.list.map((sg, k) => <div key={k} style={{ aspectRatio: `${sg.w} / ${sg.h}`, backgroundImage: `url("${image}")`, backgroundSize: `${(segs.W / sg.w) * 100}% auto`, backgroundPosition: `${segs.W === sg.w ? 0 : (sg.x / (segs.W - sg.w)) * 100}% ${segs.H === sg.h ? 0 : (sg.y / (segs.H - sg.h)) * 100}%` }} />)}</div>
          : <img key={image} className="csb-ss-frame" src={image} alt={label} draggable={false} onLoad={() => { const el = scroller.current; const r = takeRestore?.(); if (el && r != null) { silent.current = true; el.scrollTop = r * el.scrollHeight; } report(); }} />}
        <AnimatePresence>{notes.filter(n => n.i === activeI).map(n => { const bx = parseBox(n.box);
          return <motion.span key={`band-${n.i}`} data-i={n.i} className={`csb-ss-band ${bx ? 'has-box' : ''} ${editorMode ? 'is-edit' : ''}`} style={bx ? { ['--bx' as string]: `${bx[0]}%`, ['--by' as string]: `${bx[1]}%`, ['--bw' as string]: `${bx[2]}%`, ['--bh' as string]: `${bx[3]}%` } : { top: `${n.at * 100}%` }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }} aria-hidden={editorMode ? undefined : true}
            onPointerDown={editorMode ? boxDrag(n, 'move') : undefined} data-no-slot title={editorMode ? 'Drag to move the highlight; drag a corner to resize it' : undefined}>
            {editorMode && (['nw', 'ne', 'sw', 'se'] as const).map(c => <i key={c} className={`csb-ss-handle is-${c}`} onPointerDown={boxDrag(n, c)} />)}
          </motion.span>; })}</AnimatePresence>
        {notes.map((n, k) => <span key={n.i} data-i={n.i} className={`csb-ss-marker ${activeI === n.i ? 'is-on' : ''} ${n.box ? 'has-box' : ''}`} style={{ top: `${n.at * 100}%` }} onPointerDown={drag(n)} data-no-slot title={editorMode ? `Drag to move “${n.title}” on the frame` : undefined} aria-hidden={editorMode ? undefined : true} />)}
      </div>
    </div> : <div className="csb-ss-empty"><strong>{label}</strong><span>Paste a Figma frame link, or copy the frame as PNG in Figma (⌘⇧C) and paste it here</span></div>}
    <AnimatePresence>{grid && image && <motion.div key="grid" className="csb-ss-grid" aria-hidden="true" style={{ paddingLeft: `${grid.margin}%`, paddingRight: `${grid.margin}%`, columnGap: `${grid.gutter}%`, gridTemplateColumns: `repeat(${grid.cols}, 1fr)` }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
      {Array.from({ length: grid.cols }, (_, i) => <i key={i} />)}
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{image && !scrolled && <motion.span className="csb-ss-hint" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><MousePointer2 size={11} strokeWidth={2} />Scroll</motion.span>}</AnimatePresence>
  </div>;
}

/* Two screens at once, scrolling together, each with its own notes (left screen's notes on the left,
   right screen's on the right) so a highlight never hides behind the other device.
   Used for laptop + phone, and for two stages side by side (e.g. old site and new design). */
type Pane = { st: 'a' | 'b'; d: Device; label?: string; grid?: Grid };
function TwoScreens({ section, panes, editorMode, annotate, scrollersRef, takeRestore, kind }: {
  section: CaseStudySection; panes: [Pane, Pane]; editorMode?: boolean; annotate: boolean; kind: 'mixed' | 'stages';
  scrollersRef: React.MutableRefObject<Array<HTMLDivElement | null>>; takeRestore: (p: number) => number | null;
}) {
  const expressive = useExpressive();
  const { edit } = useContext(EditingContext);
  const compare = section.options?.compare === true; const base = compare ? 4 : 2;
  const slotOf = (pn: Pane) => (compare && pn.st === 'b' ? 2 : 0) + (pn.d === 'desktop' ? 0 : 1);
  const sides = ['left', 'right'] as const;
  const notesOf = (pn: Pane): Note[] => !annotate ? [] : section.items.slice(base).map((n, j) => ({ title: n.title, detail: n.detail, at: Math.min(100, Math.max(0, Number(n.point) || 0)) / 100, device: (n.value === 'mobile' ? 'mobile' : 'desktop') as Device, i: j + base, when: n.when, box: n.box }))
    .filter(n => n.device === pn.d && (!compare || (n.when === 'a' ? 'a' : n.when === 'both' ? pn.st : 'b') === pn.st)).sort((a, b) => a.at - b.at);
  const [views, setViews] = useState<View[]>([{ top: 0, bottom: .2 }, { top: 0, bottom: .2 }]);
  const [last, setLast] = useState(0);
  const scrollers = scrollersRef;
  const echo = useRef<{ p: number; top: number } | null>(null);
  const sync = section.options?.syncScroll !== false;
  const onView = (p: number) => (v: View, byUser?: boolean) => {
    const el = scrollers.current[p];
    if (byUser && echo.current?.p === p && el && Math.abs(el.scrollTop - echo.current.top) < 3) { echo.current = null; byUser = false; }
    if (byUser && el && sync) { const other = scrollers.current[1 - p]; if (other) { const f = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight); const top = Math.round(f * Math.max(0, other.scrollHeight - other.clientHeight)); if (Math.abs(other.scrollTop - top) >= 1) { echo.current = { p: 1 - p, top }; other.scrollTop = top; } } }
    if (byUser) { setLast(p); lastView.set(section.id, { device: panes[p].d, center: (v.top + v.bottom) / 2 }); }
    setViews(prev => prev.map((x, j) => j === p ? v : x));
  };
  const imageOf = (pn: Pane) => section.items[slotOf(pn)]?.image;
  const active = panes.map((pn, p) => { const v = views[p]; const pad = (v.bottom - v.top) * .12; const mid = (v.top + v.bottom) / 2; return imageOf(pn) ? notesOf(pn).filter(n => n.at >= Math.max(0, v.top + (v.top > .001 ? pad : -1)) && n.at <= Math.min(1, v.bottom - (v.bottom < .999 ? pad : -1))).sort((a, b) => Math.abs(a.at - mid) - Math.abs(b.at - mid))[0] ?? null : null; });
  const stageEl = useRef<HTMLDivElement>(null);
  const cols = useRef<Array<HTMLDivElement | null>>([null, null]); const poss = useRef<Array<HTMLDivElement | null>>([null, null]); const heads = useRef<Array<HTMLHeadingElement | null>>([null, null]);
  const [geo, setGeo] = useState<Array<{ y: number; d: string }>>([{ y: 0, d: '' }, { y: 0, d: '' }]);
  useLayoutEffect(() => {
    const st = stageEl.current; if (!st) return;
    const next = panes.map((_, p) => {
      const note = active[p]; const col = cols.current[p], pos = poss.current[p], h = heads.current[p];
      const paneEl = st.querySelector(`.csb-ss-sbs-pane.is-p${p}`);
      const m = note && paneEl ? paneEl.querySelector<HTMLElement>(`.csb-ss-band[data-i="${note.i}"]`) ?? paneEl.querySelector<HTMLElement>(`.csb-ss-marker[data-i="${note.i}"]`) : null;
      const scr = m?.closest('.csb-ss-screen'); const dev = m?.closest('.csb-ss-mac, .csb-ss-phone');
      if (!note || !m || !scr || !dev || !col || !pos || !h) return { y: 0, d: '' };
      const z = zoomOf(st); const S = zr(st, z), M = zr(m, z), C = zr(scr, z), D = zr(dev, z), K = zr(col, z), H = zr(h, z), PR = zr(pos, z);
      const my = Math.min(C.bottom - 4, Math.max(C.top + 4, M.top + M.height / 2)) - S.top;
      const headOff = H.top - PR.top + Math.min(16, H.height / 2);
      const y = Math.round(Math.max(-pos.offsetTop, Math.min(K.height - pos.offsetTop - pos.offsetHeight, (my + S.top - K.top) - pos.offsetTop - headOff)));
      const ey = K.top - S.top + pos.offsetTop + y + headOff; const L = sides[p] === 'left';
      const x0 = (L ? Math.max(C.left, M.left) : Math.min(C.right, M.right)) - S.left, xm = (L ? D.left - 18 : D.right + 18) - S.left, ex = (L ? H.right + 16 : H.left - 16) - S.left;
      return { y, d: Math.abs(ey - my) < 1.5 ? `M${x0.toFixed(1)},${my.toFixed(1)} H${ex.toFixed(1)}` : `M${x0.toFixed(1)},${my.toFixed(1)} H${xm.toFixed(1)} V${ey.toFixed(1)} H${ex.toFixed(1)}` };
    });
    if (next.some((g, p) => g.y !== geo[p].y || g.d !== geo[p].d)) setGeo(next);
  });
  const nameOf = (pn: Pane) => pn.label ?? (pn.d === 'desktop' ? 'Desktop' : 'Mobile');
  const noteCol = (p: number) => { const note = active[p]; const pn = panes[p]; const list = notesOf(pn);
    return <div className={`csb-ss-notes is-${sides[p]}`} ref={el => { cols.current[p] = el; }} aria-live="polite">
      <div className={`csb-ss-note-pos is-${sides[p]}`} ref={el => { poss.current[p] = el; }} style={{ transform: note ? `translateY(${geo[p].y}px)` : undefined }}><AnimatePresence mode="wait">
        {note && <motion.div key={note.i} className={`csb-ss-note ${note.title.length > 48 ? 'is-long' : ''}`} initial={expressive ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} exit={expressive ? { opacity: 0, y: -8 } : undefined} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }}>
          <small>{nameOf(pn)} · {list.findIndex(n => n.i === note.i) + 1} of {list.length}</small>
          <h3 ref={el => { heads.current[p] = el; }}><EditableText field={`items.${note.i}.title`} value={note.title} /></h3>
          <p><EditableText field={`items.${note.i}.detail`} value={note.detail} /></p>
        </motion.div>}
      </AnimatePresence></div>
    </div>; };
  const device = (p: number) => { const pn = panes[p]; const it = section.items[slotOf(pn)];
    const sc = <Screen stack={section.options?.[pn.d === 'desktop' ? 'stackDesk' : 'stackMob'] === true} takeRestore={() => takeRestore(p)} image={it?.image} slot={`${section.id}:${slotOf(pn)}`} label={it?.title || `${nameOf(pn)} frame`} grid={pn.grid} notes={notesOf(pn)} activeI={active[p]?.i ?? null} onView={onView(p)} scrollRef={el => { scrollers.current[p] = el; }} editorMode={editorMode} onMoveNote={(i, at) => edit?.(`items.${i}.point`, String(at))} onBox={(i, b, c) => { edit?.(`items.${i}.box`, b); edit?.(`items.${i}.point`, String(c)); }} />;
    return <div className={`csb-ss-sbs-pane is-p${p} is-${pn.d}`}>{kind === 'stages' && <p className="csb-ss-sbs-label">{pn.label}</p>}
      {pn.d === 'desktop' ? <div className="csb-ss-mac"><div className="csb-ss-lid"><span className="csb-ss-notch" aria-hidden="true" />{sc}</div><div className="csb-ss-base" aria-hidden="true"><i /></div></div>
        : <div className="csb-ss-phone"><span className="csb-ss-island" aria-hidden="true" />{sc}</div>}
    </div>; };
  const addHere = () => { if (!edit) return; const pn = panes[last]; const v = views[last]; const items = [...section.items]; items.push({ title: 'New note', detail: 'What this part of the page does.', point: String(Math.round((v.top + v.bottom) / 2 * 1000) / 10), value: pn.d, ...(compare ? { when: pn.st } : {}) }); edit('json:items', JSON.stringify(items)); };
  return <>
    <div className={`csb-ss-sbs is-${kind} ${annotate ? '' : 'is-plain'} ${panes[0].d === panes[1].d ? `is-${panes[0].d}` : ''}`} ref={stageEl}>
      {annotate && <svg className="csb-ss-lines" aria-hidden="true">{geo.map((g, p) => g.d && active[p] && <motion.path key={`${p}-${active[p]!.i}`} d={g.d} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }} />)}</svg>}
      {annotate && noteCol(0)}{device(0)}{device(1)}{annotate && noteCol(1)}
    </div>
    {annotate && editorMode && (imageOf(panes[0]) || imageOf(panes[1])) && <div className="csb-ss-foot"><button type="button" className="csb-ss-addhere" onClick={addHere}><Crosshair size={13} /> Add a note at this spot ({nameOf(panes[last]).toLowerCase()})</button></div>}
  </>;
}

export function ScrollSite({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const expressive = useExpressive();
  const { edit } = useContext(EditingContext);
  const [held, setHeldRaw] = useState(false);
  const [heldBox, setHeldBox] = useState<React.CSSProperties | undefined>();
  const show = held ? 'mobile' : (section.options?.show as 'both' | 'desktop' | 'mobile' | undefined) ?? 'both';
  const compare = section.options?.compare === true; const base = stageBase(section);
  const [stage, setStageRaw] = useState<Stage>('a');
  const [both, setBoth] = useState(false);
  const annotate = section.options?.annotate !== false;
  const paneScrollers = useRef<Array<HTMLDivElement | null>>([null, null]);
  const panePending = useRef<Array<number | null>>([null, null]);
  // Keep your place on the page when switching stage: remember where each screen was, restore once the new frame loads.
  const pending = useRef<Record<Device, number | null>>({ desktop: null, mobile: null });
  const off = compare && stage === 'b' ? 2 : 0;
  const desk = section.items[off], mob = section.items[off + 1];
  const nameA = String(section.options?.stageA || 'Wireframe'), nameB = String(section.options?.stageB || 'High fidelity');
  // Layout grid, entered the way Figma does (count, margin, gutter in px of the frame); a layer you switch on with the eye.
  const g = section.options ?? {};
  const pct = (px: unknown, w: unknown, d: number) => (Number(px ?? d) / (Number(w) || 1)) * 100;
  const hasGrid = (Number(g.gridDesk) > 0 && !!desk?.image) || (Number(g.gridMob) > 0 && !!mob?.image);
  const [gridOn, setGridOn] = useState(g.gridOn === true);
  const layerToggle = hasGrid ? <button type="button" className="csb-ss-gridtoggle" aria-pressed={gridOn} title={gridOn ? 'Hide the layout grid layer' : 'Show the layout grid layer'} onClick={() => setGridOn(v => !v)}><Columns3 size={13} strokeWidth={1.7} color="#e5484d" aria-hidden="true" /><span>Layout grid</span>{gridOn ? <Eye className="is-eye" size={13} strokeWidth={1.7} aria-hidden="true" /> : <EyeOff className="is-eye" size={13} strokeWidth={1.7} aria-hidden="true" />}</button> : null;
  const deskGrid: Grid = gridOn && Number(g.gridDesk) > 0 ? { cols: Number(g.gridDesk), margin: pct(g.gridDeskMarginPx, g.gridDeskW ?? 1440, 80), gutter: pct(g.gridDeskGutterPx, g.gridDeskW ?? 1440, 20) } : null;
  const mobGrid: Grid = gridOn && Number(g.gridMob) > 0 ? { cols: Number(g.gridMob), margin: pct(g.gridMobMarginPx, g.gridMobW ?? 390, 20), gutter: pct(g.gridMobGutterPx, g.gridMobW ?? 390, 16) } : null;

  const all: Note[] = section.items.slice(base).map((n, k) => ({ title: n.title, detail: n.detail, at: Math.min(100, Math.max(0, Number(n.point) || 0)) / 100, device: (n.value === 'mobile' ? 'mobile' : 'desktop') as Device, i: k + base, when: n.when, side: n.side, box: n.box }))
    .filter(n => !compare || (n.when === 'a' ? 'a' : n.when === 'both' ? stage : 'b') === stage);
  const notesFor = (d: Device) => !annotate ? [] : all.filter(n => n.device === d).sort((a, b) => a.at - b.at);
  const [views, setViews] = useState<Record<Device, View>>({ desktop: { top: 0, bottom: .2 }, mobile: { top: 0, bottom: .2 } });
  const [device, setDevice] = useState<Device>(show === 'mobile' ? 'mobile' : 'desktop');
  const scrollers = useRef<Record<Device, HTMLDivElement | null>>({ desktop: null, mobile: null });
  const setStage = (st: Stage) => { if (st === stage) return; const w = wrap.current; if (w) { w.removeAttribute('data-swap'); void w.offsetWidth; w.setAttribute('data-swap', st === 'b' ? 'next' : 'back'); window.setTimeout(() => w.removeAttribute('data-swap'), 700); } paneScrollers.current.forEach((el, p) => { panePending.current[p] = el && el.scrollHeight ? el.scrollTop / el.scrollHeight : null; }); (['desktop', 'mobile'] as Device[]).forEach(d => { const el = scrollers.current[d]; pending.current[d] = el && el.scrollHeight ? el.scrollTop / el.scrollHeight : null; }); setStageRaw(st); };
  // Both screens scroll together (same distance through the page), so you see desktop and mobile side by side at the same point.
  const echo = useRef<{ d: Device; top: number } | null>(null);
  const sync = section.options?.syncScroll !== false && show === 'both';
  const onView = (d: Device) => (v: View, byUser?: boolean) => {
    const el = scrollers.current[d];
    if (byUser && echo.current?.d === d && el && Math.abs(el.scrollTop - echo.current.top) < 3) { echo.current = null; byUser = false; }
    if (byUser && sync && el) { const o: Device = d === 'desktop' ? 'mobile' : 'desktop'; const other = scrollers.current[o];
      if (other) { const f = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight); const top = Math.round(f * Math.max(0, other.scrollHeight - other.clientHeight)); if (Math.abs(other.scrollTop - top) >= 1) { echo.current = { d: o, top }; other.scrollTop = top; } } }
    setViews(prev => ({ ...prev, [d]: v })); if (byUser) setDevice(d); lastView.set(section.id, { device: d, center: (v.top + v.bottom) / 2 }); };
  // The note shown: the one on the frame you're scrolling whose spot is on screen, nearest the middle.
  const hasImage = !!(device === 'desktop' ? desk?.image : mob?.image);
  const v = views[device]; const mid = (v.top + v.bottom) / 2;
  const pad = (v.bottom - v.top) * .12; // a note shows once its spot is well inside the screen, not clipped at an edge
  const visible = notesFor(device).filter(n => n.at >= Math.max(0, v.top + (v.top > .001 ? pad : -1)) && n.at <= Math.min(1, v.bottom - (v.bottom < .999 ? pad : -1))).sort((a, b) => Math.abs(a.at - mid) - Math.abs(b.at - mid));
  const note = hasImage ? visible[0] ?? null : null;
  const list = notesFor(device);
  const jump = (n: Note) => { const el = scrollers.current[n.device]; if (!el) return; el.scrollTo({ top: n.at * el.scrollHeight - el.clientHeight / 2, behavior: 'smooth' }); };
  const moveNote = (i: number, at: number) => edit?.(`items.${i}.point`, String(at));
  const addHere = () => { if (!edit) return; const items = [...section.items]; while (items.length < 2) items.push({ title: '', detail: '' }); items.push({ title: 'New note', detail: 'What this part of the page does.', point: String(Math.round(mid * 1000) / 10), value: device, ...(compare ? { when: stage } : {}) }); edit('json:items', JSON.stringify(items)); };

  // Keep the devices one screen tall at most (the preview pane, or the window).
  const wrap = useRef<HTMLDivElement>(null);
  // A hairline drawn from the highlighted spot on the screen to its note, redrawn as the page scrolls.
  const stageEl = useRef<HTMLDivElement>(null); const head = useRef<HTMLHeadingElement>(null);
  const [line, setLine] = useState('');
  // The note sits level with the part of the screen it describes and moves with it; a straight hairline joins them.
  const col = useRef<HTMLDivElement>(null); const pos = useRef<HTMLDivElement>(null);
  const [noteY, setNoteY] = useState(0);
  // Phone on its own: the phone sits in the middle and notes alternate left and right (or the side you pick).
  // One device on its own (phone or laptop) sits in the middle with notes on either side.
  const centered = show === 'mobile' || show === 'desktop';
  const noteSide = !centered || !note ? 'right' : note.side === 'left' || note.side === 'right' ? note.side : (list.findIndex(n => n.i === note.i) % 2 === 0 ? 'left' : 'right');
  useLayoutEffect(() => {
    const st = stageEl.current; if (!st || !note) { setLine(''); return; }
    const m = st.querySelector<HTMLElement>(`.csb-ss-band[data-i="${note.i}"]`) ?? st.querySelector<HTMLElement>(`.csb-ss-marker[data-i="${note.i}"]`); const h = head.current;
    const scr = m?.closest('.csb-ss-screen'); const dev = m?.closest('.csb-ss-mac, .csb-ss-phone');
    if (!m || !h || !scr || !dev || !col.current || !pos.current) { setLine(''); return; }
    const z = zoomOf(st); const S = zr(st, z), M = zr(m, z), C = zr(scr, z), D = zr(dev, z), K = zr(col.current, z);
    const P = pos.current, H = zr(h, z), PR = zr(P, z);
    const my = Math.min(C.bottom - 4, Math.max(C.top + 4, M.top + M.height / 2)) - S.top;
    const headOff = H.top - PR.top + Math.min(16, H.height / 2);
    const want = (my + S.top - K.top) - P.offsetTop - headOff;
    const y = Math.round(Math.max(-P.offsetTop, Math.min(K.height - P.offsetTop - P.offsetHeight, want)));
    setNoteY(y);
    const ey = K.top - S.top + P.offsetTop + y + headOff;
    const L = noteSide === 'left';
    const x0 = (L ? Math.max(C.left, M.left) : Math.min(C.right, M.right)) - S.left, xm = (L ? Math.min(D.left, C.left) - 20 : Math.max(D.right, C.right) + 20) - S.left, ex = (L ? H.right + 16 : H.left - 16) - S.left;
    setLine(Math.abs(ey - my) < 1.5 ? `M${x0.toFixed(1)},${my.toFixed(1)} H${ex.toFixed(1)}` : `M${x0.toFixed(1)},${my.toFixed(1)} H${xm.toFixed(1)} V${ey.toFixed(1)} H${ex.toFixed(1)}`);
  });
  // Full screen while someone is scrolling on their phone: lift the section out of the page (undo transforms on the way up, and scale back from any page zoom).
  const setHeld = (on: boolean) => {
    const w = wrap.current; if (!w) return;
    document.querySelectorAll('[data-hold-anc]').forEach(a => a.removeAttribute('data-hold-anc'));
    if (on) {
      for (let a = w.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none' || /paint|layout|strict|content/.test(cs.contain) || cs.willChange.includes('transform')) a.setAttribute('data-hold-anc', ''); }
      const z = w.getBoundingClientRect().width / (w.offsetWidth || 1) || 1;
      setHeldBox({ position: 'fixed', left: 0, top: 0, width: innerWidth / z, height: innerHeight / z, ['--ss-vh' as string]: `${innerHeight / z}px` });
      document.documentElement.classList.add('csb-holding');
    } else { setHeldBox(undefined); document.documentElement.classList.remove('csb-holding'); }
    setHeldRaw(on);
  };
  useEffect(() => () => { document.querySelectorAll('[data-hold-anc]').forEach(a => a.removeAttribute('data-hold-anc')); document.documentElement.classList.remove('csb-holding'); }, []);
  const [vh, setVh] = useState(800);
  useLayoutEffect(() => { const measure = () => { const sc = wrap.current?.closest('.csb-preview-viewport') as HTMLElement | null; setVh(sc ? sc.clientHeight : window.innerHeight); }; measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, []);
  const ticks = hasImage && list.length > 0 ? <div className="csb-ss-ticks" aria-label={`${device === 'mobile' ? 'Mobile' : 'Desktop'} notes`}>{list.map((n, k) => <button key={n.i} type="button" className={note?.i === n.i ? 'is-on' : ''} title={n.title} aria-label={`Go to note ${k + 1}: ${n.title}`} onClick={() => jump(n)} />)}</div> : null;
  const noteBlock = <div className={`csb-ss-note-pos is-${noteSide}`} ref={pos} style={{ transform: note ? `translateY(${noteY}px)` : undefined }}><AnimatePresence mode="wait">
    {note && <motion.div key={note.i} className={`csb-ss-note ${note.title.length > 48 ? 'is-long' : ''}`} initial={expressive ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} exit={expressive ? { opacity: 0, y: -8 } : undefined} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }}>
      <small>{compare ? `${stage === 'a' ? nameA : nameB} · ` : ''}{note.device === 'mobile' ? 'Mobile' : 'Desktop'} · {list.findIndex(n => n.i === note.i) + 1} of {list.length}</small>
      <h3 ref={head}><EditableText field={`items.${note.i}.title`} value={note.title} /></h3>
      <p><EditableText field={`items.${note.i}.detail`} value={note.detail} /></p>
    </motion.div>}
  </AnimatePresence></div>;
  const idle = !note ? <p className="csb-ss-idle">{list.length ? 'Scroll the screen. Notes appear as their part of the page comes into view.' : 'Scroll the screen to explore the page.'}</p> : null;
  const addBtn = editorMode && (desk?.image || mob?.image) ? <button type="button" className="csb-ss-addhere" onClick={addHere}><Crosshair size={13} /> Add a note at this spot</button> : null;
  const screen = (d: Device) => { const it = d === 'desktop' ? desk : mob; return <Screen stack={section.options?.[d === 'desktop' ? 'stackDesk' : 'stackMob'] === true} takeRestore={() => { const r = pending.current[d]; pending.current[d] = null; return r; }} image={it?.image} slot={`${section.id}:${off + (d === 'desktop' ? 0 : 1)}`} label={it?.title || `${compare ? `${stage === 'a' ? nameA : nameB}: ` : ''}${d === 'desktop' ? 'desktop frame' : 'mobile frame'}`} grid={d === 'desktop' ? deskGrid : mobGrid} notes={notesFor(d)} activeI={device === d ? note?.i ?? null : null} onView={onView(d)} scrollRef={el => { scrollers.current[d] = el; }} editorMode={editorMode} onMoveNote={moveNote} onBox={(i, b, c) => { edit?.(`items.${i}.box`, b); edit?.(`items.${i}.point`, String(c)); }} />; };
  return <div ref={wrap} className={`csb-ss is-${show} ${compare ? 'is-compare' : ''} ${!annotate || (!list.length && !editorMode) ? 'no-notes' : ''} ${held ? 'is-held' : ''}`} style={heldBox ?? { ['--ss-vh' as string]: `${vh}px` }}>
    {compare && <div className="csb-ss-stages" role="radiogroup" aria-label="Design stage">
      {(['a', 'b'] as const).map(st => <button key={st} type="button" role="radio" aria-checked={!both && stage === st} onClick={() => { setBoth(false); setStage(st); }}>{!both && stage === st && <motion.i layoutId={`ss-stage-${section.id}`} className="csb-ss-stages-knob" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}<span>{st === 'a' ? nameA : nameB}</span></button>)}
      <button type="button" role="radio" aria-checked={both} onClick={() => setBoth(true)}>{both && <motion.i layoutId={`ss-stage-${section.id}`} className="csb-ss-stages-knob" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}<span>Side by side</span></button>
    </div>}
    {(compare && both && !held) || show === 'both' ? <>
      {show === 'both' && !both && layerToggle && <div className="csb-ss-layerrow">{layerToggle}</div>}
      <TwoScreens key={compare && both ? 'stages' : 'mixed'} kind={compare && both ? 'stages' : 'mixed'} section={section} editorMode={editorMode} annotate={annotate} scrollersRef={paneScrollers} takeRestore={p => { const r = panePending.current[p]; panePending.current[p] = null; return r; }}
        panes={compare && both ? [{ st: 'a', d: show === 'mobile' ? 'mobile' : 'desktop', label: nameA }, { st: 'b', d: show === 'mobile' ? 'mobile' : 'desktop', label: nameB }] : [{ st: stage, d: 'desktop', grid: deskGrid }, { st: stage, d: 'mobile', grid: mobGrid }]} />
    </> : <>
    <div className="csb-ss-stage" ref={stageEl}>
      <svg className="csb-ss-lines" aria-hidden="true">{note && line && <motion.path key={note.i} d={line} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }} />}</svg>
      {centered && <div className="csb-ss-notes is-left" aria-live="polite" ref={noteSide === 'left' ? col : undefined}>{noteSide === 'left' && noteBlock}</div>}
      <div className="csb-ss-devices">
        {show !== 'mobile' && <div className={`csb-ss-mac ${device === 'desktop' ? 'is-focus' : ''}`}>{layerToggle}
          <div className="csb-ss-lid"><span className="csb-ss-notch" aria-hidden="true" />{screen('desktop')}</div>
          <div className="csb-ss-base" aria-hidden="true"><i /></div>
        </div>}
        {show !== 'desktop' && <div className={`csb-ss-phone ${device === 'mobile' ? 'is-focus' : ''}`}>{show === 'mobile' && layerToggle}<span className="csb-ss-island" aria-hidden="true" />{screen('mobile')}</div>}
      </div>
      {centered ? <>
        <div className="csb-ss-notes is-right" aria-live="polite" ref={noteSide === 'right' ? col : undefined}>{noteSide === 'right' && noteBlock}</div>
      </> : <div className="csb-ss-notes" aria-live="polite" ref={col}>
        {ticks}
        {noteBlock}
        {idle}
        {addBtn}
      </div>}
    </div>
    {centered && <div className="csb-ss-foot">{ticks}{!note && idle}{addBtn}</div>}
    </>}
    {(held || (section.options?.show ?? 'both') !== 'desktop') && section.options?.hold !== false && <HoldIt held={held} onLive={on => { if (on !== held) setHeld(on); }} sectionId={section.id} stage={stage} root={wrap} onPick={st => { setBoth(false); setStage(st); }} />}
  </div>;
}

/* Right panel: what to show, and each callout's place on the page. */
export function ScrollSiteControls({ section, onChange }: { section: CaseStudySection; onChange: (patch: Partial<CaseStudySection>) => void }) {
  const { edit } = useContext(EditingContext); void edit;
  const show = (section.options?.show as string) ?? 'both';
  const items = section.items.length >= 2 ? section.items : [{ title: 'Desktop page', detail: '' }, { title: 'Mobile page', detail: '' }, ...section.items];
  const compare = section.options?.compare === true; const base = compare ? 4 : 2;
  const setCompare = (on: boolean) => {
    if (on === compare) return;
    const notes = items.slice(compare ? 4 : 2);
    onChange(on
      ? { options: { ...(section.options ?? {}), compare: true }, items: [items[0], items[1], { title: 'High fidelity desktop', detail: '', image: '' }, { title: 'High fidelity mobile', detail: '', image: '' }, ...notes.map(n => ({ ...n, when: n.when ?? 'a' }))] }
      : { options: { ...(section.options ?? {}), compare: false }, items: [items[0], items[1], ...notes] });
  };
  const setItem = (i: number, patch: Partial<CaseStudySection['items'][number]>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-panel-kicker">Show</p>
    <div className="csb-segment" role="group" aria-label="Devices">{([['both', 'Both'], ['desktop', 'Desktop'], ['mobile', 'Mobile']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={show === v} onClick={() => onChange({ options: { ...(section.options ?? {}), show: v } })}>{l}</button>)}</div>
    <p className="csb-field-note">Click a screen on the page to paste its Figma frame link, or copy the frame as PNG in Figma (⌘⇧C) and paste. Use full-length frames: the page scrolls inside the device.</p>
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.annotate !== false} onChange={e => onChange({ options: { ...(section.options ?? {}), annotate: e.target.checked } })} /> Show notes and highlights (off: just the screens)</label>
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.syncScroll !== false} onChange={e => onChange({ options: { ...(section.options ?? {}), syncScroll: e.target.checked } })} /> Desktop and mobile scroll together</label>
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.hold !== false} onChange={e => onChange({ options: { ...(section.options ?? {}), hold: e.target.checked } })} /> “Hold it on your phone” button (visitors scroll the real screen on their phone)</label>
    {section.options?.hold !== false && <div className="csb-ss-holdctl">
      <span className="csb-sb-label">On their phone</span>
      {(compare ? [['liveA', String(section.options?.stageA ?? 'Wireframe')], ['liveB', String(section.options?.stageB ?? 'High fidelity')]] : [['live', 'Live prototype']]).map(([k, l]) => <label key={k}><small>{compare ? `${l}: live link` : l}</small><input type="url" inputMode="url" placeholder="Figma prototype or web link (optional)" value={String(section.options?.[k] ?? '')} onChange={e => onChange({ options: { ...(section.options ?? {}), [k]: e.target.value.trim() } })} /></label>)}
      <label><small>Real app (TestFlight or App Store)</small><input type="url" inputMode="url" placeholder="https://testflight.apple.com/join/…" value={String(section.options?.appLink ?? '')} onChange={e => onChange({ options: { ...(section.options ?? {}), appLink: e.target.value.trim() } })} /></label>
      <p className="csb-field-note">With a live link, the phone opens your real prototype so people can tap through it, with a switch back to the scrolling screen. {compare ? 'People can swipe left and right on their phone to flip this page between the two stages.' : ''} Native Xcode builds can’t run in a browser: add the TestFlight link and they get a button to install it.</p>
    </div>}
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.stackMob === true} onChange={e => onChange({ options: { ...(section.options ?? {}), stackMob: e.target.checked } })} /> Mobile frame has several screens side by side: stack them into one page</label>
    <p className="csb-panel-kicker">Versions</p>
    <div className="csb-segment" role="group" aria-label="Versions">{([[false, 'One design'], [true, 'Two versions']] as const).map(([v, l]) => <button key={l} type="button" aria-pressed={compare === v} onClick={() => setCompare(v)}>{l}</button>)}</div>
    <p className="csb-field-note">{compare ? 'For redesigns or stages: old and new, or wireframe and high fidelity. Visitors switch between them here, or swipe on their phone.' : 'One concept, shown on its own. Choose Two versions for a redesign (old and new) or to show stages.'}</p>
    {compare && <><div className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <input value={String(section.options?.stageA ?? 'Wireframe')} placeholder="e.g. Old site" aria-label="First version name" onChange={e => onChange({ options: { ...(section.options ?? {}), stageA: e.target.value } })} />
      <input value={String(section.options?.stageB ?? 'High fidelity')} placeholder="e.g. New site" aria-label="Second version name" onChange={e => onChange({ options: { ...(section.options ?? {}), stageB: e.target.value } })} />
    </div>
    <p className="csb-field-note">Switch the stage on the page, then add each stage’s frames by clicking its screens. Your place on the page is kept when you switch.</p></>}
    <p className="csb-panel-kicker">Layout grid</p>
    <p className="csb-field-note">Copy the numbers from the frame’s Layout grid in Figma. It sits on the wireframes as a layer, hidden until someone switches it on with the eye, like in Figma. 0 columns turns it off.</p>
    {([['Desk', 'Desktop frame', 1440, 80, 20], ['Mob', 'Mobile frame', 390, 20, 16]] as const).map(([k, label, w, m, gu]) => { const o = section.options ?? {}; const set = (key: string, v: number) => onChange({ options: { ...o, [key]: v } });
      return <div key={k} className="csb-ss-gridctl">
        <strong>{label}</strong>
        <label><span>Columns</span><input type="number" min={0} max={24} value={Number(o[`grid${k}`] ?? 0)} onChange={e => set(`grid${k}`, Number(e.target.value))} /></label>
        <label><span>Margin</span><input type="number" min={0} value={Number(o[`grid${k}MarginPx`] ?? m)} onChange={e => set(`grid${k}MarginPx`, Number(e.target.value))} /></label>
        <label><span>Gutter</span><input type="number" min={0} value={Number(o[`grid${k}GutterPx`] ?? gu)} onChange={e => set(`grid${k}GutterPx`, Number(e.target.value))} /></label>
        <label><span>Frame width</span><input type="number" min={100} value={Number(o[`grid${k}W`] ?? w)} onChange={e => set(`grid${k}W`, Number(e.target.value))} /></label>
      </div>; })}
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.gridOn === true} onChange={e => onChange({ options: { ...(section.options ?? {}), gridOn: e.target.checked } })} /> Start with the grid showing</label>
    <p className="csb-panel-kicker">Notes</p>
    <p className="csb-field-note">Scroll a screen on the page to the part you want, then press “Add a note at this spot” there, or “Here” on a note below. Drag a numbered marker on the frame to fine-tune.</p>
    {items.slice(base).map((n, k) => { const i = k + base; return <div key={i} className="csb-ss-ctl">
      <input value={n.title} aria-label="Note title" onChange={e => setItem(i, { title: e.target.value })} />
      <div className="csb-fc-ctl-line">
        <select value={n.value === 'mobile' ? 'mobile' : 'desktop'} aria-label="Device" onChange={e => setItem(i, { value: e.target.value })}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select>
        {show === 'mobile' && <select value={n.side === 'left' || n.side === 'right' ? n.side : ''} aria-label="Side" onChange={e => setItem(i, { side: e.target.value || undefined })}><option value="">Auto side</option><option value="left">Left</option><option value="right">Right</option></select>}
        {compare && <select value={n.when === 'a' ? 'a' : n.when === 'both' ? 'both' : 'b'} aria-label="Stage" onChange={e => setItem(i, { when: e.target.value })}><option value="a">{String(section.options?.stageA ?? 'Wireframe')}</option><option value="b">{String(section.options?.stageB ?? 'High fidelity')}</option><option value="both">Both</option></select>}
        <button type="button" className="csb-quiet-button csb-ss-at" title="Attach this note to the middle of what the screen shows now" onClick={() => { const v = lastView.get(section.id); if (v) setItem(i, { point: String(Math.round(v.center * 1000) / 10), value: v.device }); }}><Crosshair size={12} /> Here</button>
        <button type="button" className="csb-icon-button" aria-label="Remove note" onClick={() => onChange({ items: items.filter((_, x) => x !== i) })}><Trash2 size={13} /></button>
      </div>
    </div>; })}
    <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'New note', detail: 'What this part of the page does.', point: String(Math.round((lastView.get(section.id)?.center ?? .5) * 1000) / 10), value: lastView.get(section.id)?.device ?? 'desktop' }] })}><Plus size={13} /> Add note</button>
  </div>;
}
