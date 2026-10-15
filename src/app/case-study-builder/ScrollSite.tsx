import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Columns3, Crosshair, Eye, EyeOff, MousePointer2, Plus, Trash2 } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { useExpressive } from './MotionKit';
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
type Note = { title: string; detail: string; at: number; device: Device; i: number; when?: string };
type View = { top: number; bottom: number };
type Grid = { cols: number; margin: number; gutter: number } | null;

/** Last view of each section's screens, so the inspector can place a note "where I am now". */
export const lastView = new Map<string, { device: Device; center: number }>();

function Screen({ image, slot, label, grid, notes, activeI, onView, scrollRef, editorMode, onMoveNote, takeRestore }: {
  image?: string; slot: string; label: string; grid?: Grid; notes: Note[]; activeI: number | null; takeRestore?: () => number | null;
  onView: (v: View, byUser?: boolean) => void; scrollRef: (el: HTMLDivElement | null) => void; editorMode?: boolean; onMoveNote: (i: number, at: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const silent = useRef(false);
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
  return <div className={`csb-ss-screen ${editorMode ? 'is-editing' : ''}`} data-image-slot={slot}>
    {image ? <div className="csb-ss-scroll" ref={el => { scroller.current = el; scrollRef(el); }} tabIndex={0} aria-label={`${label}: scroll to explore`} onScroll={() => { if (silent.current) { silent.current = false; report(); return; } if (!scrolled) setScrolled(true); report(true); }}>
      <div className="csb-ss-content" ref={content}>
        <img key={image} className="csb-ss-frame" src={image} alt={label} draggable={false} onLoad={() => { const el = scroller.current; const r = takeRestore?.(); if (el && r != null) { silent.current = true; el.scrollTop = r * el.scrollHeight; } report(); }} />
        {notes.map((n, k) => <span key={n.i} className={`csb-ss-marker ${activeI === n.i ? 'is-on' : ''}`} style={{ top: `${n.at * 100}%` }} onPointerDown={drag(n)} data-no-slot title={editorMode ? 'Drag to move this note on the frame' : n.title}>{k + 1}</span>)}
      </div>
    </div> : <div className="csb-ss-empty"><strong>{label}</strong><span>Paste a Figma frame link, or copy the frame as PNG in Figma (⌘⇧C) and paste it here</span></div>}
    <AnimatePresence>{grid && image && <motion.div key="grid" className="csb-ss-grid" aria-hidden="true" style={{ paddingLeft: `${grid.margin}%`, paddingRight: `${grid.margin}%`, columnGap: `${grid.gutter}%`, gridTemplateColumns: `repeat(${grid.cols}, 1fr)` }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
      {Array.from({ length: grid.cols }, (_, i) => <i key={i} />)}
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{image && !scrolled && <motion.span className="csb-ss-hint" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><MousePointer2 size={11} strokeWidth={2} />Scroll</motion.span>}</AnimatePresence>
  </div>;
}

export function ScrollSite({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const expressive = useExpressive();
  const { edit } = useContext(EditingContext);
  const show = (section.options?.show as 'both' | 'desktop' | 'mobile' | undefined) ?? 'both';
  const compare = section.options?.compare === true; const base = stageBase(section);
  const [stage, setStageRaw] = useState<Stage>('a');
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

  const all: Note[] = section.items.slice(base).map((n, k) => ({ title: n.title, detail: n.detail, at: Math.min(100, Math.max(0, Number(n.point) || 0)) / 100, device: (n.value === 'mobile' ? 'mobile' : 'desktop') as Device, i: k + base, when: n.when }))
    .filter(n => !compare || (n.when === 'a' ? 'a' : n.when === 'both' ? stage : 'b') === stage);
  const notesFor = (d: Device) => all.filter(n => n.device === d).sort((a, b) => a.at - b.at);
  const [views, setViews] = useState<Record<Device, View>>({ desktop: { top: 0, bottom: .2 }, mobile: { top: 0, bottom: .2 } });
  const [device, setDevice] = useState<Device>(show === 'mobile' ? 'mobile' : 'desktop');
  const scrollers = useRef<Record<Device, HTMLDivElement | null>>({ desktop: null, mobile: null });
  const setStage = (st: Stage) => { if (st === stage) return; (['desktop', 'mobile'] as Device[]).forEach(d => { const el = scrollers.current[d]; pending.current[d] = el && el.scrollHeight ? el.scrollTop / el.scrollHeight : null; }); setStageRaw(st); };
  const onView = (d: Device) => (v: View, byUser?: boolean) => { setViews(prev => ({ ...prev, [d]: v })); if (byUser) setDevice(d); lastView.set(section.id, { device: d, center: (v.top + v.bottom) / 2 }); };
  // The note shown: the one on the frame you're scrolling whose spot is on screen, nearest the middle.
  const hasImage = !!(device === 'desktop' ? desk?.image : mob?.image);
  const v = views[device]; const mid = (v.top + v.bottom) / 2;
  const visible = notesFor(device).filter(n => n.at >= v.top - .01 && n.at <= v.bottom + .01).sort((a, b) => Math.abs(a.at - mid) - Math.abs(b.at - mid));
  const note = hasImage ? visible[0] ?? null : null;
  const list = notesFor(device);
  const jump = (n: Note) => { const el = scrollers.current[n.device]; if (!el) return; el.scrollTo({ top: n.at * el.scrollHeight - el.clientHeight / 2, behavior: 'smooth' }); };
  const moveNote = (i: number, at: number) => edit?.(`items.${i}.point`, String(at));
  const addHere = () => { if (!edit) return; const items = [...section.items]; while (items.length < 2) items.push({ title: '', detail: '' }); items.push({ title: 'New note', detail: 'What this part of the page does.', point: String(Math.round(mid * 1000) / 10), value: device, ...(compare ? { when: stage } : {}) }); edit('json:items', JSON.stringify(items)); };

  // Keep the devices one screen tall at most (the preview pane, or the window).
  const wrap = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(800);
  useLayoutEffect(() => { const measure = () => { const sc = wrap.current?.closest('.csb-preview-viewport') as HTMLElement | null; setVh(sc ? sc.clientHeight : window.innerHeight); }; measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, []);
  const screen = (d: Device) => { const it = d === 'desktop' ? desk : mob; return <Screen takeRestore={() => { const r = pending.current[d]; pending.current[d] = null; return r; }} image={it?.image} slot={`${section.id}:${off + (d === 'desktop' ? 0 : 1)}`} label={it?.title || `${compare ? `${stage === 'a' ? nameA : nameB}: ` : ''}${d === 'desktop' ? 'desktop frame' : 'mobile frame'}`} grid={d === 'desktop' ? deskGrid : mobGrid} notes={notesFor(d)} activeI={device === d ? note?.i ?? null : null} onView={onView(d)} scrollRef={el => { scrollers.current[d] = el; }} editorMode={editorMode} onMoveNote={moveNote} />; };
  return <div ref={wrap} className={`csb-ss is-${show} ${compare ? 'is-compare' : ''}`} style={{ ['--ss-vh' as string]: `${vh}px` }}>
    {compare && <div className="csb-ss-stages" role="radiogroup" aria-label="Design stage">
      {(['a', 'b'] as const).map(st => <button key={st} type="button" role="radio" aria-checked={stage === st} onClick={() => setStage(st)}>{stage === st && <motion.i layoutId={`ss-stage-${section.id}`} className="csb-ss-stages-knob" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}<span>{st === 'a' ? nameA : nameB}</span></button>)}
    </div>}
    <div className="csb-ss-stage">
      <div className="csb-ss-devices">
        {show !== 'mobile' && <div className={`csb-ss-mac ${device === 'desktop' ? 'is-focus' : ''}`}>{layerToggle}
          <div className="csb-ss-lid"><span className="csb-ss-notch" aria-hidden="true" />{screen('desktop')}</div>
          <div className="csb-ss-base" aria-hidden="true"><i /></div>
        </div>}
        {show !== 'desktop' && <div className={`csb-ss-phone ${device === 'mobile' ? 'is-focus' : ''}`}>{show === 'mobile' && layerToggle}<span className="csb-ss-island" aria-hidden="true" />{screen('mobile')}</div>}
      </div>
      <div className="csb-ss-notes" aria-live="polite">
        {hasImage && list.length > 0 && <div className="csb-ss-ticks" aria-label={`${device === 'mobile' ? 'Mobile' : 'Desktop'} notes`}>{list.map((n, k) => <button key={n.i} type="button" className={note?.i === n.i ? 'is-on' : ''} title={n.title} aria-label={`Go to note ${k + 1}: ${n.title}`} onClick={() => jump(n)}>{k + 1}</button>)}</div>}
        <AnimatePresence mode="wait">
          {note ? <motion.div key={note.i} className="csb-ss-note" initial={expressive ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} exit={expressive ? { opacity: 0, y: -8 } : undefined} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }}>
            <small>{compare ? `${stage === 'a' ? nameA : nameB} · ` : ''}{note.device === 'mobile' ? 'Mobile' : 'Desktop'} · {list.findIndex(n => n.i === note.i) + 1} of {list.length}</small>
            <h3><EditableText field={`items.${note.i}.title`} value={note.title} /></h3>
            <p><EditableText field={`items.${note.i}.detail`} value={note.detail} /></p>
          </motion.div> : <motion.p key="idle" className="csb-ss-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{list.length ? 'Scroll the screen. Notes appear as their part of the page comes into view.' : 'Scroll the screen to explore the page.'}</motion.p>}
        </AnimatePresence>
        {editorMode && (desk?.image || mob?.image) && <button type="button" className="csb-ss-addhere" onClick={addHere}><Crosshair size={13} /> Add a note at this spot</button>}
      </div>
    </div>
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
    <p className="csb-panel-kicker">Stages</p>
    <label className="csb-check-field"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Two stages, switched with one click</label>
    {compare && <><div className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <input value={String(section.options?.stageA ?? 'Wireframe')} aria-label="First stage name" onChange={e => onChange({ options: { ...(section.options ?? {}), stageA: e.target.value } })} />
      <input value={String(section.options?.stageB ?? 'High fidelity')} aria-label="Second stage name" onChange={e => onChange({ options: { ...(section.options ?? {}), stageB: e.target.value } })} />
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
        {compare && <select value={n.when === 'a' ? 'a' : n.when === 'both' ? 'both' : 'b'} aria-label="Stage" onChange={e => setItem(i, { when: e.target.value })}><option value="a">{String(section.options?.stageA ?? 'Wireframe')}</option><option value="b">{String(section.options?.stageB ?? 'High fidelity')}</option><option value="both">Both</option></select>}
        <button type="button" className="csb-quiet-button csb-ss-at" title="Attach this note to the middle of what the screen shows now" onClick={() => { const v = lastView.get(section.id); if (v) setItem(i, { point: String(Math.round(v.center * 1000) / 10), value: v.device }); }}><Crosshair size={12} /> Here</button>
        <button type="button" className="csb-icon-button" aria-label="Remove note" onClick={() => onChange({ items: items.filter((_, x) => x !== i) })}><Trash2 size={13} /></button>
      </div>
    </div>; })}
    <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'New note', detail: 'What this part of the page does.', point: String(Math.round((lastView.get(section.id)?.center ?? .5) * 1000) / 10), value: lastView.get(section.id)?.device ?? 'desktop' }] })}><Plus size={13} /> Add note</button>
  </div>;
}
