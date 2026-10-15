import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText } from './EditableText';
import { useExpressive, useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Research voices, three looks (options.quoteStyle):
  • statement: one big quote at a time, as before.
  • chat: a quiet message thread. Your question (item.value === 'q') sits on the right in ink;
    participants answer on the left in warm grey, each bubble arriving after a brief typing pause.
  • cards: a calm wall of quote cards.
  items: title = who (Participant 01, or "You" for a question), detail = their words.
*/
const initials = (s: string) => s.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(w => /\d/.test(w) ? w.replace(/\D/g, '').slice(-2) : w[0] ?? '').join('').toUpperCase() || '•';

export function QuotesView({ section }: { section: CaseStudySection }) {
  const style = String(section.options?.quoteStyle ?? 'statement');
  if (style === 'chat') return <QuoteChat section={section} />;
  if (style === 'cards') return <div className="csb-qcards">{section.items.map((it, i) => <motion.figure key={i} className="csb-qcard" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .4 }} transition={{ duration: .55, delay: (i % 3) * .08, ease: [0.22, 1, 0.36, 1] }}>
    <blockquote><EditableText field={`items.${i}.detail`} value={it.detail} /></blockquote>
    <figcaption><i aria-hidden="true">{initials(it.title)}</i><EditableText field={`items.${i}.title`} value={it.title} /></figcaption>
  </motion.figure>)}</div>;
  return <div className="csb-quote-grid">{section.items.map((item, index) => <motion.div key={index} className={`csb-quote csb-quote-${index % 3}`} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .4 }} transition={{ duration: .6, ease: [0.22, 1, 0.36, 1] }}><blockquote>“<EditableText field={`items.${index}.detail`} value={item.detail} />”</blockquote><div className="csb-quote-attribution"><span><EditableText field={`items.${index}.title`} value={item.title} /></span></div></motion.div>)}</div>;
}

function QuoteChat({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const ref = useRef<HTMLDivElement>(null); const seen = useInView(ref, { once: true, amount: .25 }) || reduce;
  const step = expressive ? .9 : .25;
  return <div className="csb-qchat" ref={ref} role="list">
    {section.items.map((it, i) => { const me = it.value === 'q'; const prev = section.items[i - 1]; const first = !prev || prev.title !== it.title || (prev.value === 'q') !== me;
      const at = i * step;
      return <div key={i} className={`csb-qchat-row ${me ? 'is-me' : ''} ${first ? 'is-first' : ''}`} role="listitem">
        {!me && <span className="csb-qchat-face" aria-hidden="true" style={{ visibility: first ? 'visible' : 'hidden' }}>{initials(it.title)}</span>}
        <div className="csb-qchat-col">
          {first && <motion.small initial={false} animate={{ opacity: seen ? 1 : 0 }} transition={{ duration: .3, delay: seen ? at : 0 }}><EditableText field={`items.${i}.title`} value={it.title} /></motion.small>}
          <div className="csb-qchat-stack">
            {expressive && !reduce && <motion.span className="csb-qchat-typing" aria-hidden="true" initial={false} animate={{ opacity: seen ? [0, 1, 1, 0] : 0 }} transition={{ duration: step, delay: seen ? Math.max(0, at - step * .6) : 0, times: [0, .15, .8, 1] }}><i /><i /><i /></motion.span>}
            <motion.p className="csb-qchat-bubble" initial={false} animate={{ opacity: seen ? 1 : 0, y: seen ? 0 : 8, scale: seen ? 1 : .96 }} transition={{ duration: .4, delay: seen ? at : 0, ease: [0.22, 1, 0.36, 1] }} style={{ transformOrigin: me ? '100% 100%' : '0% 100%' }}>
              <EditableText field={`items.${i}.detail`} value={it.detail} />
            </motion.p>
          </div>
        </div>
      </div>; })}
  </div>;
}

export function QuotesControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const style = String(section.options?.quoteStyle ?? 'statement');
  const items = section.items;
  const set = (i: number, patch: Partial<CaseStudySection['items'][number]>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-panel-kicker">Look</p>
    <div className="csb-segment" role="group" aria-label="Quote style">{([['statement', 'Statement'], ['chat', 'Chat'], ['cards', 'Cards']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={style === v} onClick={() => onChange({ options: { ...(section.options ?? {}), quoteStyle: v } })}>{l}</button>)}</div>
    {style === 'chat' && <p className="csb-field-note">Questions you asked sit on the right; answers on the left. Replies from the same person group together.</p>}
    <p className="csb-panel-kicker">Quotes</p>
    {items.map((it, i) => <div key={i} className="csb-ss-ctl">
      <div className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr auto auto' }}>
        <input value={it.title} aria-label="Who" onChange={e => set(i, { title: e.target.value })} />
        {style === 'chat' && <label className="csb-check-field" title="Show as your question (right side)"><input type="checkbox" checked={it.value === 'q'} onChange={e => set(i, { value: e.target.checked ? 'q' : '' })} /> Question</label>}
        <button type="button" className="csb-icon-button" aria-label="Remove" onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
      </div>
      <textarea value={it.detail} rows={2} aria-label="Words" onChange={e => set(i, { detail: e.target.value })} style={{ width: '100%', font: 'inherit', fontSize: 13, padding: '6px 8px', border: '1px solid #e3e3e6', borderRadius: 8, resize: 'vertical' }} />
    </div>)}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: `Participant ${String(items.filter(x => x.value !== 'q').length + 1).padStart(2, '0')}`, detail: 'Their words.' }] })}><Plus size={13} /> Add quote</button>
      {style === 'chat' && <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'You', detail: 'Your question?', value: 'q' }] })}><Plus size={13} /> Add question</button>}
    </div>
  </div>;
}
