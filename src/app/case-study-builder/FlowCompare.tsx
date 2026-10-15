import { useContext, useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { CountUp, easeOut, useExpressive, useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Flow comparison: the same task, done in each product.
  Columns are shared stages (Find → Choose → Pay → Done); each row is a product's path through them.
  Extra steps pile up inside a stage, so you can see exactly where a competitor adds friction.
*/
export type FlowStep = { id: string; stage: string; label: string; pain?: boolean; note?: string; image?: string };
export type FlowProduct = { id: string; name: string; ours?: boolean; steps: FlowStep[] };
export type FlowCompareData = { task: string; stages: Array<{ id: string; title: string }>; products: FlowProduct[]; unit?: string };

const fid = () => crypto.randomUUID().slice(0, 8);
const st = (stage: string, label: string, pain?: string): FlowStep => ({ id: fid(), stage, label, ...(pain ? { pain: true, note: pain } : {}) });
export const defaultFlowCompare = (): FlowCompareData => ({
  task: 'Book a class for Friday',
  unit: 'steps',
  stages: [{ id: 'find', title: 'Find' }, { id: 'choose', title: 'Choose' }, { id: 'pay', title: 'Pay' }, { id: 'done', title: 'Done' }],
  products: [
    { id: fid(), name: 'ClassPass', steps: [st('find', 'Search'), st('find', 'Filter by time'), st('choose', 'Studio page'), st('choose', 'Pick class'), st('pay', 'Credits check', 'Credit cost only shown here'), st('pay', 'Confirm'), st('done', 'Booked')] },
    { id: fid(), name: 'Mindbody', steps: [st('find', 'Search'), st('find', 'Map'), st('choose', 'Studio page'), st('choose', 'Schedule'), st('choose', 'Pick class'), st('pay', 'Sign in', 'Forced account creation'), st('pay', 'Card'), st('pay', 'Review'), st('done', 'Booked')] },
    { id: fid(), name: 'Studio website', steps: [st('find', 'Schedule PDF', 'Schedule is a PDF'), st('choose', 'Call desk', 'Can’t book online'), st('done', 'Booked')] },
    { id: fid(), name: 'Our design', ours: true, steps: [st('find', 'Friday view'), st('choose', 'Pick class'), st('pay', 'Apple Pay'), st('done', 'Booked')] },
  ],
});

export function FlowCompare({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const data = section.flowCompare ?? defaultFlowCompare();
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const save = (next: FlowCompareData) => edit?.('json:flowCompare', JSON.stringify(next));
  const ordered = [...data.products.filter(p => !p.ours), ...data.products.filter(p => p.ours)];
  const max = Math.max(1, ...data.products.map(p => p.steps.length));
  // Each stage is as wide as its busiest product needs, so every step gets about the same room.
  const weight = data.stages.map(st => Math.max(1.4, ...data.products.map(p => p.steps.filter(x => x.stage === st.id).length)));
  const total = weight.reduce((a, b) => a + b, 0);
  const cols = `minmax(120px,${Math.max(1.2, total / 6).toFixed(2)}fr) ${weight.map(w => `minmax(${w * 64}px,${w}fr)`).join(' ')} 84px`;
  return <div className="csb-fc" style={{ ['--fc-min' as string]: `${total * 64 + 220}px` }} onMouseLeave={() => setHover(null)}>
    <div className="csb-fc-head" style={{ gridTemplateColumns: cols }}>
      <span className="csb-fc-task"><EditableText field="deep:flowCompare.task" value={data.task} /></span>
      {data.stages.map((s, i) => <span key={s.id} className={`csb-fc-stage ${hover === s.id ? 'is-on' : ''}`} onMouseEnter={() => setHover(s.id)}>
        <i>{String(i + 1).padStart(2, '0')}</i><EditableText field={`deep:flowCompare.stages.${i}.title`} value={s.title} />
      </span>)}
      <span className="csb-fc-unit">{data.unit || 'steps'}</span>
    </div>
    {ordered.map((p, row) => <Row key={p.id} product={p} index={data.products.indexOf(p)} row={row} stages={data.stages} cols={cols} max={max} hover={hover} setHover={setHover} open={open} setOpen={setOpen} reduce={reduce} expressive={expressive} editorMode={editorMode}
      onAdd={stage => save({ ...data, products: data.products.map(x => x.id === p.id ? { ...x, steps: [...x.steps, st(stage, 'New step')] } : x) })}
      onRemove={sid => save({ ...data, products: data.products.map(x => x.id === p.id ? { ...x, steps: x.steps.filter(s => s.id !== sid) } : x) })} />)}
    {ordered.some(p => p.ours) && ordered.some(p => !p.ours) && <Summary data={data} />}
  </div>;
}

function Row({ product, index, row, stages, cols, max, hover, setHover, open, setOpen, reduce, expressive, editorMode, onAdd, onRemove }: {
  product: FlowProduct; index: number; row: number; stages: FlowCompareData['stages']; cols: string; max: number; hover: string | null; setHover: (s: string | null) => void; open: string | null; setOpen: (s: string | null) => void;
  reduce: boolean; expressive: boolean; editorMode?: boolean; onAdd: (stage: string) => void; onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: .6 }) || reduce || !!editorMode;
  const base = expressive ? row * .25 : 0; // rows play one after another; ours comes last
  let n = 0;
  return <div ref={ref} className={`csb-fc-row ${product.ours ? 'is-ours' : ''}`} style={{ gridTemplateColumns: cols }}>
    <span className="csb-fc-name"><EditableText field={`deep:flowCompare.products.${index}.name`} value={product.name} /></span>
    <motion.i className="csb-fc-track" aria-hidden="true" style={{ gridColumn: `2 / span ${stages.length}` }} initial={false} animate={{ scaleX: seen ? 1 : 0 }} transition={{ duration: expressive ? 1.1 : .4, delay: base, ease: [0.65, 0, 0.35, 1] }} />
    {stages.map((stage, col) => {
      const steps = product.steps.map((s, si) => ({ s, si })).filter(x => x.s.stage === stage.id);
      return <div key={stage.id} className={`csb-fc-cell ${hover === stage.id ? 'is-on' : ''} ${hover && hover !== stage.id ? 'is-dim' : ''}`} style={{ gridColumn: col + 2 }} onMouseEnter={() => setHover(stage.id)}>
        {steps.map(({ s, si }) => { const k = n++; const id = `${product.id}-${s.id}`; return <motion.span key={s.id} className={`csb-fc-step ${s.pain ? 'is-pain' : ''} ${s.image ? 'has-img' : ''} ${open === id ? 'is-open' : ''}`}
          initial={false} animate={{ opacity: seen ? 1 : 0, scale: seen ? 1 : .85 }} transition={{ duration: .35, delay: base + (expressive ? .15 + k * .07 : 0), ease: easeOut }}
          onMouseEnter={() => s.note && setOpen(id)} onMouseLeave={() => setOpen(null)} onFocus={() => s.note && setOpen(id)} onBlur={() => setOpen(null)} tabIndex={s.note ? 0 : undefined}>
          <i className="csb-fc-stop" aria-hidden="true" />{s.pain && <span className="csb-sr-only">Friction: </span>}
          <span className="csb-fc-label"><EditableText field={`deep:flowCompare.products.${index}.steps.${si}.label`} value={s.label} /></span>
          {s.image && <img src={s.image} alt="" loading="lazy" />}
          {s.note && open === id && <span className="csb-fc-note" role="tooltip">{s.note}</span>}
          {editorMode && <button type="button" className="csb-fc-x" aria-label={`Remove ${s.label}`} onClick={e => { e.stopPropagation(); onRemove(s.id); }}><X size={10} /></button>}
        </motion.span>; })}
        {editorMode && <button type="button" className="csb-fc-add" aria-label={`Add a step to ${stage.title}`} onClick={() => onAdd(stage.id)}><Plus size={12} /></button>}
      </div>;
    })}
    <span className="csb-fc-count" style={{ gridColumn: stages.length + 2 }} aria-label={`${product.steps.length} steps`}>
      <strong>{expressive && seen ? <CountUp value={String(product.steps.length)} duration={900} delay={(base + .3) * 1000} /> : product.steps.length}</strong>
      <i style={{ width: `${product.steps.length / max * 100}%` }} />
    </span>
  </div>;
}

function Summary({ data }: { data: FlowCompareData }) {
  const ours = data.products.find(p => p.ours)!; const others = data.products.filter(p => !p.ours);
  const avg = others.reduce((a, p) => a + p.steps.length, 0) / others.length;
  const pains = others.reduce((a, p) => a + p.steps.filter(s => s.pain).length, 0);
  const fewer = Math.round((1 - ours.steps.length / avg) * 100);
  return <p className="csb-fc-summary">
    <span><strong>{ours.steps.length}</strong> {data.unit || 'steps'} in {ours.name}, against an average of <strong>{avg.toFixed(avg % 1 ? 1 : 0)}</strong>{fewer > 0 ? <> · {fewer}% fewer</> : null}</span>
    {pains > 0 && <span><i className="csb-fc-stop is-key" aria-hidden="true" /> {pains} friction point{pains === 1 ? '' : 's'} in the alternatives. Hover a step to see why.</span>}
  </p>;
}

/* ---------- Right panel ---------- */
const shrink = (file: File) => new Promise<string>((resolve, reject) => {
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = () => { const w = Math.min(360, img.width), h = Math.round(img.height * w / img.width); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', .8)); };
  img.onerror = () => reject(new Error('Could not read that image.')); img.src = url;
});

export function FlowCompareControls({ section, onChange }: { section: CaseStudySection; onChange: (next: FlowCompareData) => void }) {
  const data = section.flowCompare ?? defaultFlowCompare();
  const set = (patch: Partial<FlowCompareData>) => onChange({ ...data, ...patch });
  const [pid, setPid] = useState(data.products[0]?.id ?? '');
  const product = data.products.find(p => p.id === pid) ?? data.products[0];
  const setP = (patch: Partial<FlowProduct>) => product && set({ products: data.products.map(p => p.id === product.id ? { ...p, ...patch } : p) });
  const setS = (id: string, patch: Partial<FlowStep>) => product && setP({ steps: product.steps.map(s => s.id === id ? { ...s, ...patch } : s) });
  const order = (steps: FlowStep[]) => [...steps].sort((a, b) => data.stages.findIndex(x => x.id === a.stage) - data.stages.findIndex(x => x.id === b.stage));
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-panel-kicker">Stages</p>
    <p className="csb-field-note">The shared parts of the task, in order. Every product’s steps sit under one of these.</p>
    {data.stages.map((s, i) => <div key={s.id} className="csb-fc-ctl-line">
      <input value={s.title} aria-label={`Stage ${i + 1}`} onChange={e => set({ stages: data.stages.map((x, k) => k === i ? { ...x, title: e.target.value } : x) })} />
      <button type="button" className="csb-icon-button" aria-label={`Remove ${s.title}`} disabled={data.stages.length < 2} onClick={() => set({ stages: data.stages.filter(x => x.id !== s.id), products: data.products.map(p => ({ ...p, steps: p.steps.filter(x => x.stage !== s.id) })) })}><Trash2 size={13} /></button>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => set({ stages: [...data.stages, { id: fid(), title: 'Stage' }] })}><Plus size={13} /> Add stage</button>
    <label className="csb-field"><span>Count label</span><input value={data.unit ?? 'steps'} onChange={e => set({ unit: e.target.value })} placeholder="steps, taps, screens" /></label>

    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Products</p>
    <div className="csb-segment" role="group" aria-label="Product">{data.products.map(p => <button key={p.id} type="button" aria-pressed={product?.id === p.id} onClick={() => setPid(p.id)}>{p.name || 'Untitled'}</button>)}</div>
    <button type="button" className="csb-quiet-button" onClick={() => { const p: FlowProduct = { id: fid(), name: 'Competitor', steps: data.stages.map(s => st(s.id, s.title)) }; set({ products: [...data.products.filter(x => !x.ours), p, ...data.products.filter(x => x.ours)] }); setPid(p.id); }}><Plus size={13} /> Add product</button>
    {product && <div className="csb-fc-ctl-product">
      <div className="csb-fc-ctl-line">
        <input value={product.name} aria-label="Product name" onChange={e => setP({ name: e.target.value })} />
        <button type="button" className="csb-icon-button" aria-label={`Remove ${product.name}`} disabled={data.products.length < 2} onClick={() => { set({ products: data.products.filter(p => p.id !== product.id) }); setPid(data.products.find(p => p.id !== product.id)?.id ?? ''); }}><Trash2 size={13} /></button>
      </div>
      <label className="csb-check-field"><input type="checkbox" checked={!!product.ours} onChange={e => set({ products: data.products.map(p => ({ ...p, ours: p.id === product.id ? e.target.checked : e.target.checked ? false : p.ours })) })} /> This is our design (shown last, in ink)</label>
      {order(product.steps).map(s => <div key={s.id} className="csb-fc-ctl-step">
        <div className="csb-fc-ctl-line is-step">
          <select value={s.stage} aria-label="Stage" onChange={e => setS(s.id, { stage: e.target.value })}>{data.stages.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
          <input value={s.label} aria-label="Step" onChange={e => setS(s.id, { label: e.target.value })} />
          <label className="csb-fc-img" title={s.image ? 'Replace screenshot' : 'Add a screenshot'}>{s.image ? <img src={s.image} alt="" /> : <ImagePlus size={13} />}<input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) void shrink(f).then(image => setS(s.id, { image })); e.target.value = ''; }} /></label>
          <button type="button" className="csb-icon-button" aria-label="Remove step" onClick={() => setP({ steps: product.steps.filter(x => x.id !== s.id) })}><X size={13} /></button>
        </div>
        <div className="csb-fc-ctl-line is-pain">
          <label className="csb-check-field"><input type="checkbox" checked={!!s.pain} onChange={e => setS(s.id, { pain: e.target.checked })} /> Friction</label>
          {s.pain && <input value={s.note ?? ''} placeholder="Why it hurts, in a few words" aria-label="Friction note" onChange={e => setS(s.id, { note: e.target.value })} />}
          {s.image && <button type="button" className="csb-link-button" onClick={() => setS(s.id, { image: undefined })}>Remove image</button>}
        </div>
      </div>)}
      <button type="button" className="csb-quiet-button" onClick={() => setP({ steps: [...product.steps, st(data.stages[data.stages.length - 1]?.id ?? '', 'New step')] })}><Plus size={13} /> Add step</button>
    </div>}
  </div>;
}
