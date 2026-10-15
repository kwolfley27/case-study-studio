import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { FlaskConical, Minus, Plus, RefreshCw } from 'lucide-react';
import { CountUp, easeOut, useExpressive, useReducedMotion } from './MotionKit';
import { EditableText } from './EditableText';
import type { CaseStudySection } from './model';
import { aggregateTasks, call, readDrafts, type Session, type Study, type TaskResult } from './research/research';

/*
  Task success: one thin ring per user flow, three to a row.
  Ink arc = completed on their own; light arc = completed with help. The number counts up as the ring draws.
  items: title = flow, value = success %, assist = with-help %, detail = "4 of 5 completed".
*/
const R = 46, C = 2 * Math.PI * R;
const pct = (v?: string) => Math.max(0, Math.min(100, Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0));

export function TaskSuccess({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const n = section.items.length;
  return <div className={`csb-tsr ${n === 2 ? 'is-two' : n === 1 ? 'is-one' : ''} ${section.options?.color === 'accent' ? 'is-accent' : ''} ${section.options?.weight === 'bold' ? 'is-bold' : ''}`}>
    {section.items.map((item, i) => {
      const ok = pct(item.value), help = Math.min(100 - ok, pct(item.assist));
      const delay = (i % 3) * .14;
      return <motion.figure key={i} className="csb-tsr-item" initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .4 }} transition={{ duration: .6, delay, ease: easeOut }}>
        <div className="csb-tsr-ring" role="img" aria-label={`${item.title}: ${ok}% completed${help ? `, ${help}% with help` : ''}`}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="csb-tsr-track" cx="50" cy="50" r={R} />
            {help > 0 && <motion.circle className="csb-tsr-help" cx="50" cy="50" r={R} strokeDasharray={`${C * help / 100} ${C}`} style={{ rotate: -90 + ok * 3.6, transformOrigin: '50% 50%' }} initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: .5, delay: delay + (expressive ? 1.1 : .3) }} />}
            <motion.circle className="csb-tsr-arc" cx="50" cy="50" r={R} style={{ rotate: -90, transformOrigin: '50% 50%' }} strokeDasharray={C} initial={reduce ? false : { strokeDashoffset: C }} whileInView={{ strokeDashoffset: C * (1 - ok / 100) }} viewport={{ once: true, amount: .5 }} transition={expressive ? { duration: 1.3, delay: delay + .1, ease: [0.65, 0, 0.35, 1] } : { duration: .5, delay }} />
          </svg>
          <strong>{expressive ? <CountUp value={`${ok}%`} duration={1300} delay={(delay + .1) * 1000} /> : `${ok}%`}</strong>
        </div>
        <figcaption>
          <span className="csb-tsr-title"><EditableText field={`items.${i}.title`} value={item.title} /></span>
          <span className="csb-tsr-detail"><EditableText field={`items.${i}.detail`} value={item.detail} /></span>
        </figcaption>
      </motion.figure>;
    })}
    {section.items.some(it => pct(it.assist) > 0) && <p className="csb-tsr-key"><i className="is-ok" /> On their own <i className="is-help" /> With help</p>}
  </div>;
}

/* Turn usability results into ring items. */
export function taskItems(results: TaskResult[]) {
  return results.map(r => ({ title: r.task.title, value: String(Math.round(r.attempts ? r.success / r.attempts * 100 : 0)), assist: String(Math.round(r.attempts ? r.help / r.attempts * 100 : 0)), detail: r.attempts ? `${r.success} of ${r.attempts} on their own${r.help ? ` · ${r.help} with help` : ''}` : 'Not attempted yet' }));
}

/* Right panel: the numbers, plus a live connection to a usability test from Research. */
export function TaskSuccessControls({ section, onChange, onOpenResearch }: { section: CaseStudySection; onChange: (patch: Partial<CaseStudySection>) => void; onOpenResearch: () => void }) {
  const items = section.items;
  const setItem = (i: number, patch: Partial<CaseStudySection['items'][number]>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  return <div className="csb-connection-section">
    <p className="csb-panel-kicker">Rings</p>
    <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
      <div className="csb-segment" role="group" aria-label="Ring colour">{([['', 'Ink'], ['accent', 'Project colour']] as const).map(([v, l]) => <button key={l} type="button" aria-pressed={(section.options?.color ?? '') === v} onClick={() => onChange({ options: { ...(section.options ?? {}), color: v } })}>{l}</button>)}</div>
      <div className="csb-segment" role="group" aria-label="Ring weight">{([['', 'Thin'], ['bold', 'Bold']] as const).map(([v, l]) => <button key={l} type="button" aria-pressed={(section.options?.weight ?? '') === v} onClick={() => onChange({ options: { ...(section.options ?? {}), weight: v } })}>{l}</button>)}</div>
    </div>
    <p className="csb-panel-kicker">Flows</p>
    <div className="csb-tsr-rows">
      {items.map((it, i) => <div key={i} className="csb-tsr-row">
        <input value={it.title} aria-label={`Flow ${i + 1} name`} onChange={e => setItem(i, { title: e.target.value })} />
        <label><input type="number" min={0} max={100} value={pct(it.value)} onChange={e => setItem(i, { value: e.target.value })} aria-label="Completed on their own (%)" />%</label>
        <label title="Completed with help (%)"><input type="number" min={0} max={100} value={pct(it.assist)} onChange={e => setItem(i, { assist: e.target.value })} aria-label="Completed with help (%)" />% help</label>
        <button type="button" className="csb-icon-button" aria-label={`Remove ${it.title}`} onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Minus size={13} /></button>
      </div>)}
      <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'New flow', value: '80', assist: '0', detail: '4 of 5 on their own' }] })}><Plus size={13} /> Add flow</button>
    </div>
    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Data source</p>
    <UsabilityPicker section={section} onChange={onChange} onOpenResearch={onOpenResearch} />
  </div>;
}

function UsabilityPicker({ section, onChange, onOpenResearch }: { section: CaseStudySection; onChange: (patch: Partial<CaseStudySection>) => void; onOpenResearch: () => void }) {
  const tests = readDrafts().filter(s => s.kind === 'usability' && s.published);
  const src = section.taskSource;
  const [id, setId] = useState(src?.studyId || tests[0]?.id || '');
  const [data, setData] = useState<{ study: Study; sessions: Session[] } | null>(null);
  const [picked, setPicked] = useState<string[]>(src?.taskIds ?? []);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (sid: string) => {
    if (!sid) return null; setBusy(true); setNote(null);
    try { const d = await call<{ study: Study; sessions: Session[] }>('results', { id: sid }, true); setData({ study: d.study, sessions: d.sessions ?? [] }); return d; }
    catch (e) { setNote({ text: e instanceof Error ? e.message : 'Could not load results.', error: true }); return null; }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(id).then(d => { if (d && !picked.length) setPicked((d.study.tasks ?? []).slice(0, 3).map(t => t.id)); }); }, [id]);
  const apply = (d = data, ids = picked) => {
    if (!d) return;
    const results = aggregateTasks(d.study, d.sessions).filter(r => ids.includes(r.task.id));
    if (!results.length) { setNote({ text: 'Pick at least one task.', error: true }); return; }
    onChange({ items: taskItems(results), taskSource: { studyId: d.study.id, studyTitle: d.study.title, taskIds: ids, sessions: d.sessions.length, updatedAt: new Date().toISOString() } });
    setNote({ text: `Showing ${results.length} flow${results.length === 1 ? '' : 's'} from ${d.sessions.length} session${d.sessions.length === 1 ? '' : 's'}.` });
  };
  if (!tests.length) return <div className="csb-study-empty"><p className="csb-field-note">No saved usability tests yet. Make one in Research, run a few sessions, then connect it here.</p><button type="button" className="csb-quiet-button" onClick={onOpenResearch}><FlaskConical size={14} /> Open Research</button></div>;
  return <div className="csb-study-pick">
    <div className="csb-field"><label htmlFor="csb-ut-select">Usability test</label><select id="csb-ut-select" value={id} onChange={e => { setId(e.target.value); setPicked([]); }}>{tests.map(s => <option key={s.id} value={s.id}>{s.title}{s.projectTitle ? ` · ${s.projectTitle}` : ''}</option>)}</select></div>
    {busy && <p className="csb-field-note">Loading sessions…</p>}
    {data && <>
      <p className="csb-field-note">{data.sessions.length} session{data.sessions.length === 1 ? '' : 's'}. Choose the tasks to show:</p>
      <div className="csb-study-qs">{(data.study.tasks ?? []).map(t => <label key={t.id} className="csb-check-field"><input type="checkbox" checked={picked.includes(t.id)} onChange={e => setPicked(p => e.target.checked ? [...p, t.id] : p.filter(x => x !== t.id))} /> {t.title}</label>)}</div>
      <button type="button" className="csb-primary-button" onClick={() => apply()} disabled={!picked.length}>Show these tasks</button>
    </>}
    {src?.studyId === id && <button type="button" className="csb-quiet-button" disabled={busy} onClick={() => void load(id).then(d => d && apply({ study: d.study, sessions: d.sessions ?? [] }, src.taskIds))}><RefreshCw size={14} /> Refresh with new sessions</button>}
    {src?.studyId && <p className="csb-field-note">Connected to “{src.studyTitle}” · {src.sessions} sessions · updated {new Date(src.updatedAt).toLocaleString()}</p>}
    {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`} role="status">{note.text}</p>}
  </div>;
}
