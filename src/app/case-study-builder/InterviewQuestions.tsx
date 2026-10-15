import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText } from './EditableText';
import { Media } from './Media';
import { useReducedMotion } from './MotionKit';
import { readDrafts } from './research/research';
import type { CaseStudySection } from './model';

/*
  Interview questions: the questions you asked, each with a thin accent bar, beside an
  optional illustration or photo of the session (slot "art:<section id>", stored in options.art).
  items: title = the question, detail = an optional note (why you asked it, or a short takeaway).
  Questions can be pulled straight from an interview guide in Research.
*/
export function InterviewQuestions({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion();
  const art = String(section.options?.art ?? '');
  const showArt = section.options?.showArt !== false && (!!art || editorMode);
  return <div className={`csb-iq ${showArt ? 'has-art' : ''}`}>
    {showArt && <div className="csb-iq-art" data-image-slot={editorMode ? `art:${section.id}` : undefined}>
      {art ? <Media src={art} alt="" /> : <span>Add an illustration or a photo from a session</span>}
    </div>}
    <ol className="csb-iq-list">
      {section.items.map((it, i) => <motion.li key={i} initial={reduce ? false : { opacity: 0, x: 14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .5, delay: i * .06, ease: [0.22, 1, 0.36, 1] }}>
        <p><EditableText field={`items.${i}.title`} value={it.title} /></p>
        {(it.detail || editorMode) && <small><EditableText field={`items.${i}.detail`} value={it.detail || (editorMode ? '' : '')} /></small>}
      </motion.li>)}
    </ol>
  </div>;
}

export function InterviewQuestionsControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const o = section.options ?? {}; const items = section.items;
  const guides = readDrafts().filter(s => s.format === 'interview' && (s.tasks ?? []).length);
  const [pick, setPick] = useState('');
  return <div className="csb-tsc">
    {guides.length > 0 && <div className="csb-sb-row"><span className="csb-sb-label">Bring in from Research</span>
      <div className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr auto' }}>
        <select value={pick} onChange={e => setPick(e.target.value)} aria-label="Interview guide"><option value="">Choose an interview guide…</option>{guides.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select>
        <button type="button" className="csb-ps-pick" disabled={!pick} onClick={() => { const g = guides.find(x => x.id === pick); if (!g) return; if (items.some(i => i.title.trim()) && !window.confirm(`Replace these questions with the ${g.tasks!.length} from “${g.title}”?`)) return; onChange({ items: g.tasks!.map(q => ({ title: q.title, detail: '' })) }); }}>Use</button>
      </div></div>}
    <label className="csb-sb-switch"><span><b>Illustration</b><small>A picture beside the questions. Click it on the page to add one.</small></span><input type="checkbox" role="switch" checked={o.showArt !== false} onChange={e => onChange({ options: { ...o, showArt: e.target.checked } })} /><i aria-hidden="true" /></label>
    <div className="csb-sb-row"><span className="csb-sb-label">Questions</span>
      {items.map((it, i) => <div key={i} className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr auto' }}>
        <input value={it.title} aria-label={`Question ${i + 1}`} onChange={e => onChange({ items: items.map((x, k) => k === i ? { ...x, title: e.target.value } : x) })} />
        <button type="button" className="csb-tsc-del" aria-label={`Remove question ${i + 1}`} onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
      </div>)}
      <button type="button" className="csb-ps-pick" onClick={() => onChange({ items: [...items, { title: 'A new question?', detail: '' }] })}><Plus size={12} /> Add a question</button>
    </div>
    <p className="csb-field-note">Record the interviews in Research → New interview guide. Your notes and the transcript are sorted by question there.</p>
  </div>;
}
