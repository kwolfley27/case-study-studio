import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText } from './EditableText';
import { CountUp, useExpressive, useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';
import { Swatches } from './ProjectSettings';

/*
  Bar chart: a live, editable column chart (no pictures of charts).
  items: title = label (e.g. a year), value = number. options.unit, options.note, options.labels = 'ends' | 'all'.
  options.color = undefined (ink) | 'accent' (project colour) | '#hex'; options.fill = 'ramp' (light → dark) | 'solid' | 'last' (highlight the last bar).
  Columns rise one after another; the bars darken from first to last, and the end values count up.
*/
const num = (v?: string) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function BarChart({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const ref = useRef<HTMLDivElement>(null); const seen = useInView(ref, { once: true, amount: .4 }) || reduce;
  const items = section.items; const vals = items.map(i => num(i.value));
  const max = Math.max(1, ...vals); const min = Math.min(...vals);
  const floor = section.options?.zero === false ? Math.max(0, min - (max - min) * 1.2) : 0; // bars start at zero unless switched off
  const labelsAll = section.options?.labels === 'all';
  const unit = String(section.options?.unit ?? '');
  const n = items.length;
  // The project colour follows the page: a gradient when the accent is set to gradient.
  const color = section.options?.color === 'accent' ? 'var(--csb-accent-grad-v, var(--csb-accent, currentColor))' : String(section.options?.color || 'currentColor');
  const fill = String(section.options?.fill ?? 'ramp');
  return <figure className="csb-bar" ref={ref} style={{ ['--bar-c' as string]: color }}>
    <div className="csb-bar-plot" role="img" aria-label={`${section.title}: ${items.map(i => `${i.title} ${i.value}`).join(', ')}`}>
      {items.map((it, i) => {
        const h = ((vals[i] - floor) / (max - floor || 1)) * 100; const end = i === 0 || i === n - 1;
        const shade = fill === 'solid' ? 1 : fill === 'last' ? (i === n - 1 ? 1 : .2) : n > 1 ? .16 + .84 * (i / (n - 1)) : 1;
        return <div key={i} className={`csb-bar-col ${end ? 'is-end' : ''}`} style={{ ['--h' as string]: `${Math.max(1.5, h)}%` }}>
          {(labelsAll || end) && <motion.span className="csb-bar-val" initial={false} animate={{ opacity: seen ? 1 : 0 }} transition={{ duration: .4, delay: expressive ? .3 + i * .07 : 0 }}>
            {expressive && seen ? <CountUp value={fmt(vals[i])} duration={1100} delay={i * 70} /> : fmt(vals[i])}
          </motion.span>}
          <motion.i style={{ height: `${Math.max(1.5, h)}%`, ['--shade' as string]: shade }} initial={false} animate={{ scaleY: seen ? 1 : 0 }} transition={{ duration: expressive ? .8 : .3, delay: expressive ? i * .07 : 0, ease: [0.22, 1, 0.36, 1] }} />
          <b><EditableText field={`items.${i}.title`} value={it.title} /></b>
        </div>;
      })}
    </div>
    {(unit || section.options?.note) && <figcaption>{unit && <span>{unit}</span>}{section.options?.note && <span><EditableText field="options.note" value={String(section.options.note)} /></span>}</figcaption>}
  </figure>;
}

export function BarChartControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const items = section.items;
  const set = (i: number, patch: Partial<CaseStudySection['items'][number]>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  const opt = (k: string, v: string | boolean) => onChange({ options: { ...(section.options ?? {}), [k]: v } });
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-panel-kicker">Data</p>
    {items.map((it, i) => <div key={i} className="csb-fc-ctl-line is-prod">
      <input value={it.title} aria-label={`Label ${i + 1}`} onChange={e => set(i, { title: e.target.value })} />
      <input value={it.value ?? ''} aria-label={`Value ${i + 1}`} inputMode="decimal" style={{ width: 90 }} onChange={e => set(i, { value: e.target.value })} />
      <button type="button" className="csb-icon-button" aria-label="Remove" onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'New', value: items[items.length - 1]?.value ?? '0', detail: '' }] })}><Plus size={13} /> Add bar</button>
    <p className="csb-panel-kicker">Colour</p>
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 6 }}>
    <div className="csb-segment" role="group" aria-label="Bar colour">{([['', 'Ink'], ['accent', 'Project'], ['custom', 'Custom']] as const).map(([v, l]) => { const cur = !section.options?.color ? '' : section.options.color === 'accent' ? 'accent' : 'custom'; return <button key={v} type="button" aria-pressed={cur === v} onClick={() => opt('color', v === 'custom' ? (cur === 'custom' ? String(section.options?.color) : '#ff4704') : v)}>{l}</button>; })}</div>
    {section.options?.color && section.options.color !== 'accent' && <Swatches label="Bar colour" value={String(section.options.color)} onChange={v => opt('color', v ?? '')} />}
    <div className="csb-segment" role="group" aria-label="Bar shading">{([['ramp', 'Light to dark'], ['solid', 'Solid'], ['last', 'Highlight last']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={String(section.options?.fill ?? 'ramp') === v} onClick={() => opt('fill', v)}>{l}</button>)}</div>
    </div>
    <label className="csb-field"><span>Unit</span><input value={String(section.options?.unit ?? '')} placeholder="USD million" onChange={e => opt('unit', e.target.value)} /></label>
    <label className="csb-field"><span>Source / note</span><input value={String(section.options?.note ?? '')} onChange={e => opt('note', e.target.value)} /></label>
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.labels === 'all'} onChange={e => opt('labels', e.target.checked ? 'all' : 'ends')} /> Show every value</label>
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.zero !== false} onChange={e => opt('zero', e.target.checked)} /> Start the axis at zero</label>
  </div>;
}
