import { useEffect, useState } from 'react';
import { FlaskConical, RefreshCw } from 'lucide-react';
import { aggregate, call, chartable, readDrafts, toSurveyQuestions, type Response, type Study } from './research';
import { SurveySourcePicker } from '../SurveySourcePicker';
import type { CaseStudySection } from '../model';

/* The survey chart's data source: one of your Research surveys (live), or Google Forms / CSV. */
export function SurveyDataSource({ section, onApply, onOpenResearch }: { section: CaseStudySection; onApply: (patch: Partial<CaseStudySection>) => void; onOpenResearch: () => void }) {
  const [mode, setMode] = useState<'study' | 'forms'>(section.surveySource?.url || (section.surveySource && !section.surveySource.studyId) ? 'forms' : 'study');
  return <div className="csb-connection-section">
    <p className="csb-panel-kicker">Data source</p>
    <div className="csb-segment" role="group" aria-label="Data source">
      <button type="button" aria-pressed={mode === 'study'} onClick={() => setMode('study')}>Your surveys</button>
      <button type="button" aria-pressed={mode === 'forms'} onClick={() => setMode('forms')}>Google Forms / CSV</button>
    </div>
    {mode === 'study' ? <StudyPicker key={section.id} section={section} onApply={onApply} onOpenResearch={onOpenResearch} /> : <SurveySourcePicker key={section.id} section={section} onApply={onApply} />}
  </div>;
}

function StudyPicker({ section, onApply, onOpenResearch }: { section: CaseStudySection; onApply: (patch: Partial<CaseStudySection>) => void; onOpenResearch: () => void }) {
  const studies = readDrafts().filter(s => s.published);
  const src = section.surveySource;
  const [id, setId] = useState(src?.studyId || studies[0]?.id || '');
  const [data, setData] = useState<{ study: Study; responses: Response[] } | null>(null);
  const [picked, setPicked] = useState<string[]>(src?.questionIds ?? []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const load = async (studyId: string) => {
    if (!studyId) return null; setBusy(true); setNote(null);
    try { const d = await call<{ study: Study; responses: Response[] }>('results', { id: studyId }, true); setData(d); return d; }
    catch (e) { setNote({ text: e instanceof Error ? e.message : 'Could not load results.', error: true }); return null; }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(id).then(d => { if (d && !picked.length) setPicked(chartable(aggregate(d.study, d.responses)).slice(0, 2).map(r => r.q.id)); }); }, [id]);
  const apply = (d = data, ids = picked) => {
    if (!d) return;
    const questions = toSurveyQuestions(aggregate(d.study, d.responses), ids);
    if (!questions.length) { setNote({ text: d.responses.length ? 'Pick at least one question that has answers.' : 'No responses yet. Share the survey link first.', error: true }); return; }
    onApply({ surveySource: { studyId: d.study.id, studyTitle: d.study.title, questionIds: ids, updatedAt: new Date().toISOString(), totalResponses: d.responses.length, questions }, items: questions.map((q, i) => ({ title: section.items[i]?.title && src?.studyId === d.study.id ? section.items[i].title : q.sourceName, detail: section.items[i]?.detail || '' })) });
    setNote({ text: `Showing ${questions.length} chart${questions.length === 1 ? '' : 's'} from ${d.responses.length} responses.` });
  };
  if (!studies.length) return <div className="csb-study-empty"><p className="csb-field-note">You don't have a published survey yet. Make one in Research, publish it, then connect it here.</p><button type="button" className="csb-quiet-button" onClick={onOpenResearch}><FlaskConical size={14} /> Open Research</button></div>;
  const questions = data ? chartable(aggregate(data.study, data.responses)) : [];
  return <div className="csb-study-pick">
    <div className="csb-field"><label htmlFor="csb-study-select">Survey</label><select id="csb-study-select" value={id} onChange={e => { setId(e.target.value); setPicked([]); }}>{studies.map(s => <option key={s.id} value={s.id}>{s.title}{s.projectTitle ? ` · ${s.projectTitle}` : ''}</option>)}</select></div>
    {busy && <p className="csb-field-note">Loading results…</p>}
    {data && <>
      <p className="csb-field-note">{data.responses.length} responses. Choose the questions to chart (choice and scale questions):</p>
      <div className="csb-study-qs">{questions.map(r => <label key={r.q.id} className="csb-check-field"><input type="checkbox" checked={picked.includes(r.q.id)} onChange={e => setPicked(p => e.target.checked ? [...p, r.q.id] : p.filter(x => x !== r.q.id))} /> {r.q.prompt}</label>)}{!questions.length && <span className="csb-field-note">This survey has no choice or scale questions to chart.</span>}</div>
      <button type="button" className="csb-primary-button" onClick={() => apply()} disabled={!picked.length}>Show these results</button>
    </>}
    {src?.studyId === id && <button type="button" className="csb-quiet-button" disabled={busy} onClick={() => void load(id).then(d => d && apply(d, src.questionIds ?? picked))}><RefreshCw size={14} /> Refresh with new responses</button>}
    {src?.studyId && <p className="csb-field-note">Connected to “{src.studyTitle}” · updated {new Date(src.updatedAt).toLocaleString()} · {src.totalResponses} responses</p>}
    {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`} role="status">{note.text}</p>}
    <button type="button" className="csb-link-button" onClick={onOpenResearch}>Open Research to edit or share surveys →</button>
  </div>;
}
