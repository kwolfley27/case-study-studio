import { useContext, useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { CountUp, easeOut, useExpressive, useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

const cid = () => crypto.randomUUID().slice(0, 8);

/* =====================================================================
   Feature comparison — Apple "compare models" style.
   Products are columns (ours first, on a soft band); features are rows.
   ● has it   ◐ partly   – doesn't. Click a mark in the editor to cycle it.
   ===================================================================== */
export type Mark = 'yes' | 'partial' | 'no';
export type FeatureCompareData = { products: Array<{ id: string; name: string; ours?: boolean }>; features: Array<{ id: string; label: string; group?: string; values: Record<string, Mark> }> };
export const defaultFeatureCompare = (): FeatureCompareData => {
  const p = [{ id: 'ours', name: 'Our design', ours: true }, { id: 'a', name: 'ClassPass' }, { id: 'b', name: 'Mindbody' }, { id: 'c', name: 'Studio site' }];
  const row = (label: string, group: string, v: Mark[]) => ({ id: cid(), label, group, values: Object.fromEntries(p.map((x, i) => [x.id, v[i]])) as Record<string, Mark> });
  return { products: p, features: [
    row('See open spots before tapping in', 'Booking', ['yes', 'partial', 'no', 'no']),
    row('Book in under a minute', 'Booking', ['yes', 'yes', 'partial', 'no']),
    row('Waitlist with auto-join', 'Booking', ['yes', 'yes', 'partial', 'no']),
    row('Price shown up front', 'Paying', ['yes', 'partial', 'yes', 'no']),
    row('Apple Pay / Google Pay', 'Paying', ['yes', 'yes', 'no', 'no']),
    row('Guest checkout', 'Paying', ['yes', 'no', 'no', 'partial']),
    row('Reminders that respect quiet hours', 'After', ['yes', 'partial', 'partial', 'no']),
  ] };
};
const cycle: Record<Mark, Mark> = { yes: 'partial', partial: 'no', no: 'yes' };
const markLabel: Record<Mark, string> = { yes: 'Yes', partial: 'Partly', no: 'No' };

export function FeatureCompare({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const data = section.featureCompare ?? defaultFeatureCompare();
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const ref = useRef<HTMLDivElement>(null); const seen = useInView(ref, { once: true, amount: .25 }) || reduce || !!editorMode;
  const save = (next: FeatureCompareData) => edit?.('json:featureCompare', JSON.stringify(next));
  const products = [...data.products.filter(p => p.ours), ...data.products.filter(p => !p.ours)];
  const score = (pid: string) => data.features.reduce((a, f) => a + (f.values[pid] === 'yes' ? 1 : f.values[pid] === 'partial' ? .5 : 0), 0);
  const cols = `minmax(180px,1.6fr) repeat(${products.length}, minmax(76px,1fr))`;
  let lastGroup = '';
  return <div ref={ref} className="csb-fx" style={{ ['--fx-cols' as string]: cols }}>
    <div className="csb-fx-head">
      <span />
      {products.map(p => <span key={p.id} className={`csb-fx-prod ${p.ours ? 'is-ours' : ''}`}><EditableText field={`deep:featureCompare.products.${data.products.indexOf(p)}.name`} value={p.name} /></span>)}
    </div>
    <div className="csb-fx-body">
      {data.features.flatMap((f, fi) => {
        const out = [];
        if ((f.group || '') !== lastGroup) { lastGroup = f.group || ''; if (f.group) out.push(<div key={`g${fi}`} className="csb-fx-row is-group"><span className="csb-fx-group"><EditableText field={`deep:featureCompare.features.${fi}.group`} value={f.group} /></span>{products.map(p => <span key={p.id} className={`csb-fx-cell ${p.ours ? 'is-ours' : ''}`} />)}</div>); }
        out.push(<motion.div key={f.id} className="csb-fx-row" initial={false} animate={{ opacity: seen ? 1 : 0, y: seen ? 0 : 8 }} transition={{ duration: .45, delay: expressive ? .1 + fi * .06 : 0, ease: easeOut }}>
          <span className="csb-fx-feat"><EditableText field={`deep:featureCompare.features.${fi}.label`} value={f.label} /></span>
          {products.map(p => { const v = f.values[p.id] ?? 'no'; const body = <i className={`csb-fx-mark is-${v}`} aria-hidden="true" />; return editorMode
            ? <button key={p.id} type="button" className={`csb-fx-cell ${p.ours ? 'is-ours' : ''}`} aria-label={`${f.label}, ${p.name}: ${markLabel[v]}. Click to change.`} onClick={() => save({ ...data, features: data.features.map(x => x.id === f.id ? { ...x, values: { ...x.values, [p.id]: cycle[v] } } : x) })}>{body}</button>
            : <span key={p.id} className={`csb-fx-cell ${p.ours ? 'is-ours' : ''}`} role="img" aria-label={`${p.name}: ${markLabel[v]}`}>{body}</span>; })}
        </motion.div>);
        return out;
      })}
      <div className="csb-fx-row is-total">
        <span className="csb-fx-feat">Covered</span>
        {products.map(p => { const s = score(p.id); return <span key={p.id} className={`csb-fx-cell ${p.ours ? 'is-ours' : ''}`}><strong>{expressive && seen ? <CountUp value={String(Math.round(s / Math.max(1, data.features.length) * 100))} duration={1000} delay={600} /> : Math.round(s / Math.max(1, data.features.length) * 100)}<small>%</small></strong></span>; })}
      </div>
    </div>
    <p className="csb-fx-key"><span><i className="csb-fx-mark is-yes" /> Yes</span><span><i className="csb-fx-mark is-partial" /> Partly</span><span><i className="csb-fx-mark is-no" /> No</span></p>
  </div>;
}

export function FeatureCompareControls({ section, onChange }: { section: CaseStudySection; onChange: (d: FeatureCompareData) => void }) {
  const data = section.featureCompare ?? defaultFeatureCompare();
  const set = (patch: Partial<FeatureCompareData>) => onChange({ ...data, ...patch });
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-panel-kicker">Products</p>
    {data.products.map((p, i) => <div key={p.id} className="csb-fc-ctl-line is-prod">
      <input value={p.name} aria-label={`Product ${i + 1}`} onChange={e => set({ products: data.products.map((x, k) => k === i ? { ...x, name: e.target.value } : x) })} />
      <label className="csb-check-field" title="Our design: shown first, on a soft band"><input type="radio" name={`fx-ours-${section.id}`} checked={!!p.ours} onChange={() => set({ products: data.products.map(x => ({ ...x, ours: x.id === p.id })) })} /> Ours</label>
      <button type="button" className="csb-icon-button" aria-label={`Remove ${p.name}`} disabled={data.products.length < 2} onClick={() => set({ products: data.products.filter(x => x.id !== p.id) })}><Trash2 size={13} /></button>
    </div>)}
    <button type="button" className="csb-quiet-button" disabled={data.products.length >= 6} onClick={() => set({ products: [...data.products, { id: cid(), name: 'Competitor' }] })}><Plus size={13} /> Add product</button>
    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Features</p>
    <p className="csb-field-note">On the page, click a mark to switch it between Yes, Partly and No. Rows with the same group sit together under a small heading.</p>
    {data.features.map((f, i) => <div key={f.id} className="csb-fc-ctl-line is-feat">
      <input value={f.label} aria-label={`Feature ${i + 1}`} onChange={e => set({ features: data.features.map((x, k) => k === i ? { ...x, label: e.target.value } : x) })} />
      <input value={f.group ?? ''} placeholder="Group" aria-label="Group" onChange={e => set({ features: data.features.map((x, k) => k === i ? { ...x, group: e.target.value } : x) })} />
      <button type="button" className="csb-icon-button" aria-label={`Remove ${f.label}`} onClick={() => set({ features: data.features.filter(x => x.id !== f.id) })}><Trash2 size={13} /></button>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => set({ features: [...data.features, { id: cid(), label: 'New feature', group: data.features[data.features.length - 1]?.group, values: {} }] })}><Plus size={13} /> Add feature</button>
  </div>;
}

/* =====================================================================
   Positioning matrix — a square with two axes and four quadrants.
   Each product is a dot; ours is the ink dot with a soft ring.
   Dots drift out from the centre into place; drag them in the editor.
   ===================================================================== */
export type PositioningData = { x: { low: string; high: string }; y: { low: string; high: string }; quadrants: [string, string, string, string]; points: Array<{ id: string; name: string; x: number; y: number; ours?: boolean }> };
export const defaultPositioning = (): PositioningData => ({
  x: { low: 'Generic', high: 'Built for one studio' },
  y: { low: 'Many steps', high: 'Effortless' },
  quadrants: ['Easy but generic', 'The opening', 'Clunky and generic', 'Personal but slow'],
  points: [
    { id: cid(), name: 'ClassPass', x: .22, y: .62 }, { id: cid(), name: 'Mindbody', x: .3, y: .3 },
    { id: cid(), name: 'Studio website', x: .78, y: .18 }, { id: cid(), name: 'Booking spreadsheet', x: .62, y: .4 },
    { id: cid(), name: 'Our design', x: .8, y: .82, ours: true },
  ],
});

export function Positioning({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const data = section.positioning ?? defaultPositioning();
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const box = useRef<HTMLDivElement>(null); const seen = useInView(box, { once: true, amount: .5 }) || reduce || !expressive || !!editorMode;
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const save = (next: PositioningData) => edit?.('json:positioning', JSON.stringify(next));
  const at = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) }; };
  const ordered = [...data.points.filter(p => !p.ours), ...data.points.filter(p => p.ours)];
  return <div className="csb-pm">
    <div className="csb-pm-frame">
      <span className="csb-pm-y is-high"><EditableText field="deep:positioning.y.high" value={data.y.high} /></span>
      <div ref={box} className={`csb-pm-box ${editorMode ? 'is-editing' : ''}`} onPointerMove={e => drag && setDrag({ id: drag.id, ...at(e) })} onPointerUp={() => { if (drag) save({ ...data, points: data.points.map(p => p.id === drag.id ? { ...p, x: Math.round(drag.x * 100) / 100, y: Math.round(drag.y * 100) / 100 } : p) }); setDrag(null); }} onPointerCancel={() => setDrag(null)}>
        <motion.i className="csb-pm-axis is-x" initial={false} animate={{ scaleX: seen ? 1 : 0 }} transition={{ duration: .9, ease: [0.65, 0, 0.35, 1] }} />
        <motion.i className="csb-pm-axis is-y" initial={false} animate={{ scaleY: seen ? 1 : 0 }} transition={{ duration: .9, delay: .1, ease: [0.65, 0, 0.35, 1] }} />
        {data.quadrants.map((q, i) => <motion.span key={i} className={`csb-pm-q is-q${i}`} initial={false} animate={{ opacity: seen ? 1 : 0 }} transition={{ duration: .6, delay: .5 }}><EditableText field={`deep:positioning.quadrants.${i}`} value={q} /></motion.span>)}
        {ordered.map((p, k) => { const idx = data.points.indexOf(p); const live = drag?.id === p.id ? drag : p; return <motion.div key={p.id} className={`csb-pm-dot ${p.ours ? 'is-ours' : ''} ${live.x > .7 ? 'is-left' : ''} ${drag?.id === p.id ? 'is-drag' : ''}`}
          initial={false} animate={{ left: `${(seen ? live.x : .5) * 100}%`, top: `${(1 - (seen ? live.y : .5)) * 100}%`, opacity: seen ? 1 : 0 }}
          transition={drag?.id === p.id ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 16, delay: seen && !editorMode ? .5 + k * .12 + (p.ours ? .3 : 0) : 0 }}
          onPointerDown={editorMode ? e => { if ((e.target as HTMLElement).closest('[contenteditable=true]')) return; e.preventDefault(); (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); setDrag({ id: p.id, x: p.x, y: p.y }); } : undefined}>
          <i />{p.ours && <motion.b aria-hidden="true" initial={false} animate={seen && expressive && !reduce ? { scale: [1, 1.9, 1], opacity: [.35, 0, .35] } : { scale: 1, opacity: .35 }} transition={{ duration: 2.4, repeat: seen && expressive && !reduce ? Infinity : 0, delay: 1.4 }} />}
          <span><EditableText field={`deep:positioning.points.${idx}.name`} value={p.name} /></span>
        </motion.div>; })}
      </div>
      <span className="csb-pm-y is-low"><EditableText field="deep:positioning.y.low" value={data.y.low} /></span>
      <div className="csb-pm-x"><span><EditableText field="deep:positioning.x.low" value={data.x.low} /></span><span><EditableText field="deep:positioning.x.high" value={data.x.high} /></span></div>
    </div>
  </div>;
}

export function PositioningControls({ section, onChange }: { section: CaseStudySection; onChange: (d: PositioningData) => void }) {
  const data = section.positioning ?? defaultPositioning();
  const set = (patch: Partial<PositioningData>) => onChange({ ...data, ...patch });
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-panel-kicker">Axes</p>
    <div className="csb-fc-ctl-grid">
      <label className="csb-field"><span>Left</span><input value={data.x.low} onChange={e => set({ x: { ...data.x, low: e.target.value } })} /></label>
      <label className="csb-field"><span>Right</span><input value={data.x.high} onChange={e => set({ x: { ...data.x, high: e.target.value } })} /></label>
      <label className="csb-field"><span>Bottom</span><input value={data.y.low} onChange={e => set({ y: { ...data.y, low: e.target.value } })} /></label>
      <label className="csb-field"><span>Top</span><input value={data.y.high} onChange={e => set({ y: { ...data.y, high: e.target.value } })} /></label>
    </div>
    <p className="csb-panel-kicker">Quadrants</p>
    <div className="csb-fc-ctl-grid">{(['Top left', 'Top right', 'Bottom left', 'Bottom right'] as const).map((l, i) => <label key={l} className="csb-field"><span>{l}</span><input value={data.quadrants[i]} onChange={e => { const q = [...data.quadrants] as PositioningData['quadrants']; q[i] = e.target.value; set({ quadrants: q }); }} /></label>)}</div>
    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Products</p>
    <p className="csb-field-note">Drag the dots on the page to place them.</p>
    {data.points.map((p, i) => <div key={p.id} className="csb-fc-ctl-line is-prod">
      <input value={p.name} aria-label={`Product ${i + 1}`} onChange={e => set({ points: data.points.map((x, k) => k === i ? { ...x, name: e.target.value } : x) })} />
      <label className="csb-check-field"><input type="radio" name={`pm-ours-${section.id}`} checked={!!p.ours} onChange={() => set({ points: data.points.map(x => ({ ...x, ours: x.id === p.id })) })} /> Ours</label>
      <button type="button" className="csb-icon-button" aria-label={`Remove ${p.name}`} onClick={() => set({ points: data.points.filter(x => x.id !== p.id) })}><Trash2 size={13} /></button>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => set({ points: [...data.points, { id: cid(), name: 'Competitor', x: .5, y: .5 }] })}><Plus size={13} /> Add product</button>
  </div>;
}
