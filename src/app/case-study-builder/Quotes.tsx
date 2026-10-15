import { useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
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
  const { edit } = useContext(EditingContext);
  const ref = useRef<HTMLDivElement>(null); const seen = useInView(ref, { once: true, amount: .3 });
  const items = section.items; const n = items.length;
  // Play like a real thread: answers show "typing…" in their own spot, then the message replaces it.
  // While editing, with Reduce Motion or calm motion, everything shows at once.
  const instant = !!edit || reduce || !expressive;
  const [shown, setShown] = useState(instant ? n : 0);
  const [typing, setTyping] = useState(false);
  useEffect(() => { if (instant) { setShown(n); setTyping(false); } }, [instant, n]);
  useEffect(() => {
    if (instant || !seen || shown >= n) { setTyping(false); return; }
    const next = items[shown]; const me = next?.value === 'q';
    const words = (next?.detail || '').split(/\s+/).length;
    if (me) { const t = window.setTimeout(() => setShown(s => s + 1), shown === 0 ? 150 : 650); return () => window.clearTimeout(t); }
    setTyping(true);
    const t = window.setTimeout(() => { setTyping(false); setShown(s => s + 1); }, (shown === 0 ? 300 : 500) + Math.min(1300, 450 + words * 45));
    return () => window.clearTimeout(t);
  }, [instant, seen, shown, n]);
  const ease = [0.22, 1, 0.36, 1] as const;
  const rows = items.map((it, i) => ({ it, i, me: it.value === 'q', first: !items[i - 1] || items[i - 1].title !== it.title || (items[i - 1].value === 'q') !== (it.value === 'q') }));
  const visible = rows.slice(0, shown);
  const pending = typing && shown < n ? rows[shown] : null;
  return <div className="csb-qchat" ref={ref} role="list" style={instant ? undefined : { minHeight: Math.min(n, 6) * 52 }}>
    <AnimatePresence initial={false}>
      {visible.map(({ it, i, me, first }) => <motion.div key={i} layout={!instant} className={`csb-qchat-row ${me ? 'is-me' : ''} ${first ? 'is-first' : ''}`} role="listitem"
        initial={instant ? false : { opacity: 0, y: 10, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .35, ease }} style={{ transformOrigin: me ? '100% 100%' : '0% 100%' }}>
        {!me && <span className="csb-qchat-face" aria-hidden="true" style={{ visibility: first ? 'visible' : 'hidden' }}>{initials(it.title)}</span>}
        <div className="csb-qchat-col">
          {first && <small><EditableText field={`items.${i}.title`} value={it.title} /></small>}
          <p className="csb-qchat-bubble"><EditableText field={`items.${i}.detail`} value={it.detail} /></p>
        </div>
      </motion.div>)}
      {pending && <motion.div key={`typing-${pending.i}`} layout className={`csb-qchat-row ${pending.first ? 'is-first' : ''}`} aria-hidden="true"
        initial={{ opacity: 0, y: 8, scale: .9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: .12 } }} transition={{ duration: .25, ease }} style={{ transformOrigin: '0% 100%' }}>
        <span className="csb-qchat-face" style={{ visibility: pending.first ? 'visible' : 'hidden' }}>{initials(pending.it.title)}</span>
        <div className="csb-qchat-col">{pending.first && <small>{pending.it.title}</small>}<span className="csb-qchat-typing"><i /><i /><i /></span></div>
      </motion.div>}
    </AnimatePresence>
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
