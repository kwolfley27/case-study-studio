import { Fragment, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText } from './EditableText';
import { useExpressive } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Insights: columns divided by hairlines. Each has a picture (optional), a quiet "Insight 1" label,
  a headline and a sentence of explanation.
  Headline emphasis is typed inline: *word* sets it in italic, [[words]] gives them a soft highlight
  that sweeps in as the column arrives.
  items: title = headline, detail = explanation, image / figmaUrl = picture, value = label (optional).
*/
function rich(text: string, on: boolean, delay: number) {
  const parts = text.split(/(\[\[[^\]]+\]\]|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p, i) => p.startsWith('[[') ? <motion.mark key={i} className="csb-ins-mark" initial={false} animate={{ backgroundSize: on ? '100% 100%' : '0% 100%' }} transition={{ duration: .7, delay, ease: [0.22, 1, 0.36, 1] }}>{p.slice(2, -2)}</motion.mark>
    : p.startsWith('*') ? <em key={i}>{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>);
}

export function Insights({ section }: { section: CaseStudySection }) {
  const expressive = useExpressive();
  const items = section.items;
  const pictures = items.some(i => i.image || i.figmaUrl);
  return <div className="csb-ins" style={{ ['--ins-cols' as string]: Math.min(3, Math.max(1, items.length)) }}>
    {items.map((it, i) => <motion.article key={i} className="csb-ins-col" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .35 }} transition={{ duration: .6, delay: expressive ? i * .12 : 0, ease: [0.22, 1, 0.36, 1] }}>
      {pictures && <div className="csb-ins-img" data-image-slot={`${section.id}:${i}`}>{it.image ? <img src={it.image} alt="" /> : <span>Add a picture</span>}</div>}
      <p className="csb-ins-label"><EditableText field={`items.${i}.value`} value={it.value || `Insight ${i + 1}`} /></p>
      <h3>
        <EditableText field={`items.${i}.title`} value={it.title}><InView>{on => rich(it.title, on, .25 + (expressive ? i * .12 : 0))}</InView></EditableText>
      </h3>
      <p className="csb-ins-body"><EditableText field={`items.${i}.detail`} value={it.detail} /></p>
    </motion.article>)}
  </div>;
}

function InView({ children }: { children: (on: boolean) => React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null); const on = useInView(ref, { once: true, amount: .6 });
  return <span ref={ref}>{children(on)}</span>;
}

export function InsightsControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const items = section.items;
  const set = (i: number, patch: Partial<CaseStudySection['items'][number]>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-field-note">In a headline, wrap words in *stars* for italic and [[double brackets]] for a highlight. Click a picture spot to paste a Figma frame or copied image.</p>
    {items.map((it, i) => <div key={i} className="csb-ss-ctl">
      <div className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr auto' }}>
        <input value={it.title} aria-label={`Insight ${i + 1} headline`} onChange={e => set(i, { title: e.target.value })} />
        <button type="button" className="csb-icon-button" aria-label="Remove insight" onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
      </div>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'The *idea* was [[clear]]', detail: 'One sentence on what you saw and why it matters.' }] })}><Plus size={13} /> Add insight</button>
  </div>;
}
