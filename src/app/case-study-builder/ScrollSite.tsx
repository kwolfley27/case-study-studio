import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { useExpressive, useReducedMotion, useScrollProgress } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Scrolling site: a long, scrolling web page shown the way it's used.
  A MacBook (desktop design) and an iPhone (mobile design) stay pinned while you scroll;
  both pages scroll inside their screens, and each callout appears when its part of the page arrives.

  items[0] = desktop page (image / figmaUrl), items[1] = mobile page,
  items[2..] = callouts: title, detail, point = where on the page (0–100), value = 'desktop' | 'mobile'.
  options.show = 'both' | 'desktop' | 'mobile'.
*/
type Note = { title: string; detail: string; at: number; device: 'desktop' | 'mobile'; i: number };

type Grid = { cols: number; margin: number; gutter: number } | null;
function Screen({ image, progress, slot, label, emptyHint, editorMode, grid }: { image?: string; progress: MotionValue<number>; slot: string; label: string; emptyHint: string; editorMode?: boolean; grid?: Grid }) {
  const box = useRef<HTMLDivElement>(null); const img = useRef<HTMLImageElement>(null);
  const [travel, setTravel] = useState(0);
  useLayoutEffect(() => {
    const measure = () => { const b = box.current, i = img.current; if (b && i) setTravel(Math.max(0, i.offsetHeight - b.clientHeight)); };
    measure(); const ro = new ResizeObserver(measure); if (box.current) ro.observe(box.current); if (img.current) ro.observe(img.current);
    return () => ro.disconnect();
  }, [image]);
  const y = useTransform(progress, p => -p * travel);
  return <div ref={box} className={`csb-ss-screen ${editorMode ? 'is-editing' : ''}`} data-image-slot={slot}>
    {image ? <motion.img ref={img} src={image} alt={label} style={{ y }} draggable={false} onLoad={() => { const b = box.current, i = img.current; if (b && i) setTravel(Math.max(0, i.offsetHeight - b.clientHeight)); }} />
      : <div className="csb-ss-empty"><strong>{label}</strong><span>{emptyHint}</span></div>}
    <AnimatePresence>{grid && <motion.div key="grid" className="csb-ss-grid" aria-hidden="true" style={{ paddingLeft: `${grid.margin}%`, paddingRight: `${grid.margin}%`, columnGap: `${grid.gutter}%`, gridTemplateColumns: `repeat(${grid.cols}, 1fr)` }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .4 }}>
      {Array.from({ length: grid.cols }, (_, i) => <motion.i key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: .5, delay: i * .03, ease: [0.22, 1, 0.36, 1] }} />)}
    </motion.div>}</AnimatePresence>
  </div>;
}

export function ScrollSite({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const show = (section.options?.show as 'both' | 'desktop' | 'mobile' | undefined) ?? 'both';
  const desk = section.items[0], mob = section.items[1];
  // Optional layout grid over each screen (e.g. 12 columns on desktop, 4 on mobile), with a visitor toggle.
  const g = section.options ?? {};
  const hasGrid = Number(g.gridDesk) > 0 || Number(g.gridMob) > 0;
  const [gridOn, setGridOn] = useState(g.gridOn !== false);
  const deskGrid: Grid = hasGrid && gridOn && Number(g.gridDesk) > 0 ? { cols: Number(g.gridDesk), margin: Number(g.gridDeskMargin ?? 5.5), gutter: Number(g.gridDeskGutter ?? 1.4) } : null;
  const mobGrid: Grid = hasGrid && gridOn && Number(g.gridMob) > 0 ? { cols: Number(g.gridMob), margin: Number(g.gridMobMargin ?? 5), gutter: Number(g.gridMobGutter ?? 4) } : null;
  const notes: Note[] = section.items.slice(2).map((n, k) => ({ title: n.title, detail: n.detail, at: Math.min(100, Math.max(0, Number(n.point) || 0)) / 100, device: n.value === 'mobile' ? 'mobile' : 'desktop', i: k + 2 }))
    .filter(n => show === 'both' || n.device === show).sort((a, b) => a.at - b.at);
  const wrap = useRef<HTMLDivElement>(null);
  const pinned = !editorMode && !reduce;
  // While pinned, progress runs from the stage reaching the top to the section's end.
  const progress = useScrollProgress(wrap, pinned ? 0 : .9, pinned ? 1 : .1);
  // In the editor: scrub with a slider instead of page scroll.
  const [scrub, setScrub] = useState(0);
  const scrubMV = useMotionValue(0);
  // The pinned stage is exactly one screen tall (the preview pane, or the window).
  const [vh, setVh] = useState(800);
  useLayoutEffect(() => { const measure = () => { const sc = wrap.current?.closest('.csb-preview-viewport') as HTMLElement | null; setVh(sc ? sc.clientHeight : window.innerHeight); }; measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, []);
  const p = editorMode ? scrubMV : progress;
  const [active, setActive] = useState(-1);
  const pick = (v: number) => { let a = -1; notes.forEach((n, k) => { if (v >= n.at - .02) a = k; }); setActive(a); };
  useMotionValueEvent(p, 'change', pick);
  const note = active >= 0 ? notes[active] : null;
  return <div ref={wrap} className={`csb-ss is-${show} ${pinned ? 'is-pinned' : ''}`} style={{ ['--ss-vh' as string]: `${vh}px`, ...(pinned ? { height: vh * Math.max(2.4, 1.4 + notes.length * .45) } : {}) }}>
    <div className="csb-ss-stage">
      <div className="csb-ss-devices">
        {show !== 'mobile' && <div className="csb-ss-mac">
          <div className="csb-ss-lid"><span className="csb-ss-notch" aria-hidden="true" /><Screen image={desk?.image} progress={p} slot={`${section.id}:0`} label={desk?.title || 'Desktop page'} emptyHint="Paste a Figma frame link or drop the full-length page" editorMode={editorMode} grid={deskGrid} /></div>
          <div className="csb-ss-base" aria-hidden="true"><i /></div>
        </div>}
        {show !== 'desktop' && <div className="csb-ss-phone"><span className="csb-ss-island" aria-hidden="true" /><Screen image={mob?.image} progress={p} slot={`${section.id}:1`} label={mob?.title || 'Mobile page'} emptyHint="Paste a Figma frame link or drop the full-length page" editorMode={editorMode} grid={mobGrid} /></div>}
      </div>
      <div className="csb-ss-notes" aria-live="polite">
        {hasGrid && <button type="button" className="csb-ss-gridtoggle" role="switch" aria-checked={gridOn} onClick={() => setGridOn(v => !v)}><i aria-hidden="true" />Layout grid{Number(g.gridDesk) > 0 ? ` · ${g.gridDesk} col` : ''}{Number(g.gridMob) > 0 ? ` / ${g.gridMob} col` : ''}</button>}
        <div className="csb-ss-ticks" aria-hidden="true">{notes.map((n, k) => <i key={n.i} className={k === active ? 'is-on' : k < active ? 'is-past' : ''} />)}</div>
        <AnimatePresence mode="wait">
          {note && <motion.div key={note.i} className="csb-ss-note" initial={expressive ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} exit={expressive ? { opacity: 0, y: -8 } : undefined} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}>
            <small>{note.device === 'mobile' ? 'Mobile' : 'Desktop'}</small>
            <h3><EditableText field={`items.${note.i}.title`} value={note.title} /></h3>
            <p><EditableText field={`items.${note.i}.detail`} value={note.detail} /></p>
          </motion.div>}
        </AnimatePresence>
        {editorMode && <label className="csb-ss-scrub"><span>Scroll the page</span><input type="range" min={0} max={1} step={.005} value={scrub} onChange={e => { const v = Number(e.target.value); setScrub(v); pick(v); scrubMV.set(v); }} /></label>}
      </div>
    </div>
  </div>;
}

/* Right panel: what to show, and each callout's place on the page. */
export function ScrollSiteControls({ section, onChange }: { section: CaseStudySection; onChange: (patch: Partial<CaseStudySection>) => void }) {
  const { edit } = useContext(EditingContext); void edit;
  const show = (section.options?.show as string) ?? 'both';
  const items = section.items.length >= 2 ? section.items : [{ title: 'Desktop page', detail: '' }, { title: 'Mobile page', detail: '' }, ...section.items];
  const setItem = (i: number, patch: Partial<CaseStudySection['items'][number]>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-panel-kicker">Show</p>
    <div className="csb-segment" role="group" aria-label="Devices">{([['both', 'Both'], ['desktop', 'Desktop'], ['mobile', 'Mobile']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={show === v} onClick={() => onChange({ options: { ...(section.options ?? {}), show: v } })}>{l}</button>)}</div>
    <p className="csb-field-note">Click a screen on the page to paste its Figma frame link. Use full-length frames: the page scrolls inside the device.</p>
    <p className="csb-panel-kicker">Layout grid</p>
    <div className="csb-fc-ctl-grid">
      <label className="csb-field"><span>Desktop columns</span><input type="number" min={0} max={24} value={Number(section.options?.gridDesk ?? 0)} onChange={e => onChange({ options: { ...(section.options ?? {}), gridDesk: Number(e.target.value) } })} /></label>
      <label className="csb-field"><span>Mobile columns</span><input type="number" min={0} max={12} value={Number(section.options?.gridMob ?? 0)} onChange={e => onChange({ options: { ...(section.options ?? {}), gridMob: Number(e.target.value) } })} /></label>
      <label className="csb-field"><span>Desktop margin / gutter %</span><span className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr 1fr' }}><input type="number" step={.1} value={Number(section.options?.gridDeskMargin ?? 5.5)} onChange={e => onChange({ options: { ...(section.options ?? {}), gridDeskMargin: Number(e.target.value) } })} /><input type="number" step={.1} value={Number(section.options?.gridDeskGutter ?? 1.4)} onChange={e => onChange({ options: { ...(section.options ?? {}), gridDeskGutter: Number(e.target.value) } })} /></span></label>
      <label className="csb-field"><span>Mobile margin / gutter %</span><span className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr 1fr' }}><input type="number" step={.1} value={Number(section.options?.gridMobMargin ?? 5)} onChange={e => onChange({ options: { ...(section.options ?? {}), gridMobMargin: Number(e.target.value) } })} /><input type="number" step={.1} value={Number(section.options?.gridMobGutter ?? 4)} onChange={e => onChange({ options: { ...(section.options ?? {}), gridMobGutter: Number(e.target.value) } })} /></span></label>
    </div>
    <p className="csb-field-note">0 columns hides the grid. Visitors can switch it off and on.</p>
    <p className="csb-panel-kicker">Callouts</p>
    {items.slice(2).map((n, k) => { const i = k + 2; return <div key={i} className="csb-ss-ctl">
      <input value={n.title} aria-label="Callout title" onChange={e => setItem(i, { title: e.target.value })} />
      <div className="csb-fc-ctl-line">
        <select value={n.value === 'mobile' ? 'mobile' : 'desktop'} aria-label="Device" onChange={e => setItem(i, { value: e.target.value })}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select>
        <label className="csb-ss-at" title="Where on the page (top to bottom)"><input type="range" min={0} max={100} value={Number(n.point) || 0} onChange={e => setItem(i, { point: e.target.value })} /><span>{Number(n.point) || 0}%</span></label>
        <button type="button" className="csb-icon-button" aria-label="Remove callout" onClick={() => onChange({ items: items.filter((_, x) => x !== i) })}><Trash2 size={13} /></button>
      </div>
    </div>; })}
    <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'New callout', detail: 'What this part of the page does.', point: '50', value: 'desktop' }] })}><Plus size={13} /> Add callout</button>
  </div>;
}
