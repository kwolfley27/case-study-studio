import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Copy, ExternalLink, Link2, PenLine, Plus, Trash2, X } from 'lucide-react';
import { SurveyRunner } from './SurveyRunner';
import { aggregate, call, getPasscode, NeedsPasscode, newQuestion, newStudy, npsQuestion, participantLink, QUESTION_TYPES, readDrafts, setPasscode, susQuestions, susScore, writeDrafts, type Question, type QuestionResult, type Response, type Study } from './research';
import { createSection, type CaseStudySection } from '../model';
import './research.css';

type Tab = 'build' | 'share' | 'results';

export function ResearchWorkspace({ onExit, onAddSections }: { onExit: () => void; onAddSections: (sections: CaseStudySection[], note: string) => void }) {
  const [studies, setStudies] = useState<Study[]>(() => readDrafts());
  const [currentId, setCurrentId] = useState<string | null>(() => readDrafts()[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>('build');
  const [previewAt, setPreviewAt] = useState(-1);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => { writeDrafts(studies); }, [studies]);
  // Response counts for published studies (quietly skipped if the service or passcode isn't set up).
  useEffect(() => { call<{ studies: Study[] }>('list', {}, true).then(d => setCounts(Object.fromEntries(d.studies.map(s => [s.id, s.responses ?? 0])))).catch(() => undefined); }, []);
  const study = studies.find(s => s.id === currentId) ?? null;
  const update = (patch: Partial<Study>) => setStudies(list => list.map(s => s.id === currentId ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s));
  const create = () => { const s = newStudy(); setStudies(list => [s, ...list]); setCurrentId(s.id); setTab('build'); setPreviewAt(-1); };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this study? Published responses are deleted too.')) return;
    const s = studies.find(x => x.id === id); if (s?.published) await call('remove', { id }, true).catch(() => undefined);
    setStudies(list => list.filter(x => x.id !== id)); if (currentId === id) setCurrentId(null);
  };

  return <main className="csb-app rw">
    <header className="csb-home-head rw-head">
      <button type="button" className="csb-wordmark csb-wordmark-home" onClick={onExit} title="Back to the studio"><span className="csb-wordmark-icon">✳</span>Case Study Studio</button>
      <span className="csb-header-separator" /><strong className="rw-title">Research</strong>
      <button type="button" className="csb-quiet-button rw-back" onClick={onExit}>Back to case study</button>
    </header>
    <div className="rw-shell">
      <aside className="rw-list">
        <button type="button" className="csb-primary-button" onClick={create}><Plus size={14} /> New survey</button>
        <p className="rw-list-kicker">Studies</p>
        {!studies.length && <p className="rw-empty">Make a survey, share the link, and turn the answers into case study charts. More study types (prototype tests, card sorts, tree tests) are coming.</p>}
        {studies.map(s => <div key={s.id} className={`rw-study ${s.id === currentId ? 'is-on' : ''}`}>
          <button type="button" onClick={() => { setCurrentId(s.id); setPreviewAt(-1); }}><strong>{s.title}</strong><small>Survey · {s.published ? (s.status === 'open' ? 'Live' : 'Closed') : 'Draft'}{counts[s.id] !== undefined ? ` · ${counts[s.id]} responses` : ''}</small></button>
          <button type="button" className="rw-icon" aria-label={`Delete ${s.title}`} onClick={() => void remove(s.id)}><Trash2 size={13} /></button>
        </div>)}
      </aside>
      {study ? <section className="rw-main">
        <div className="rw-tabs" role="tablist">
          {([['build', 'Build', PenLine], ['share', 'Share', Link2], ['results', 'Results', BarChart3]] as const).map(([k, l, Icon]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}><Icon size={14} /> {l}</button>)}
        </div>
        {tab === 'build' && <Builder study={study} update={update} previewAt={previewAt} setPreviewAt={setPreviewAt} />}
        {tab === 'share' && <Share study={study} update={update} />}
        {tab === 'results' && <Results study={study} onAddSections={onAddSections} />}
      </section> : <section className="rw-main rw-blank"><h2>Your own research tool</h2><p>Write a survey here, send participants a link, and answers save to your server and a Notion database. Then add the results to a case study in one click.</p><button type="button" className="csb-primary-button" onClick={create}><Plus size={14} /> New survey</button></section>}
    </div>
  </main>;
}

/* ---------- Build ---------- */
function Builder({ study, update, previewAt, setPreviewAt }: { study: Study; update: (p: Partial<Study>) => void; previewAt: number; setPreviewAt: (n: number) => void }) {
  const qs = study.questions;
  const setQ = (i: number, patch: Partial<Question>) => update({ questions: qs.map((q, k) => k === i ? { ...q, ...patch } : q) });
  const move = (i: number, j: number) => { const n = [...qs]; [n[i], n[j]] = [n[j], n[i]]; update({ questions: n }); setPreviewAt(j); };
  const add = (list: Question[]) => { update({ questions: [...qs, ...list] }); setPreviewAt(qs.length); };
  const hasSus = qs.some(q => q.preset?.startsWith('sus-'));
  return <div className="rw-build">
    <div className="rw-editor">
      <label className="rw-field"><span>Survey title</span><input value={study.title} onChange={e => update({ title: e.target.value })} onFocus={() => setPreviewAt(-1)} /></label>
      <label className="rw-field"><span>Welcome message</span><textarea rows={2} value={study.intro ?? ''} onChange={e => update({ intro: e.target.value })} onFocus={() => setPreviewAt(-1)} /></label>
      <p className="rw-kicker">Questions · {qs.length}</p>
      {qs.map((q, i) => <div key={q.id} className={`rw-q ${previewAt === i ? 'is-on' : ''}`} onFocusCapture={() => setPreviewAt(i)} onClick={() => setPreviewAt(i)}>
        <div className="rw-q-head">
          <span className="rw-q-num">{i + 1}</span>
          <select value={q.type} aria-label="Question type" disabled={!!q.preset} onChange={e => { const t = e.target.value as Question['type']; const base = newQuestion(t); setQ(i, { type: t, options: base.options, min: base.min, max: base.max, minLabel: base.minLabel, maxLabel: base.maxLabel }); }}>{QUESTION_TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}</select>
          {q.preset && <span className="rw-tag">{q.preset === 'nps' ? 'NPS' : 'SUS'}</span>}
          <span className="rw-q-tools">
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></button>
            <button type="button" aria-label="Move down" disabled={i === qs.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></button>
            <button type="button" aria-label="Delete question" onClick={() => update({ questions: qs.filter((_, k) => k !== i) })}><X size={13} /></button>
          </span>
        </div>
        <textarea className="rw-prompt" rows={2} value={q.prompt} readOnly={q.preset?.startsWith('sus-')} onChange={e => setQ(i, { prompt: e.target.value })} aria-label={`Question ${i + 1}`} />
        {(q.type === 'single' || q.type === 'multi') && <div className="rw-opts">
          {(q.options ?? []).map((o, k) => <div key={k} className="rw-opt"><span className={`rs-mark ${q.type === 'multi' ? 'is-box' : ''}`} aria-hidden="true" /><input value={o} aria-label={`Option ${k + 1}`} onChange={e => setQ(i, { options: q.options!.map((x, n) => n === k ? e.target.value : x) })} /><button type="button" aria-label={`Remove option ${k + 1}`} onClick={() => setQ(i, { options: q.options!.filter((_, n) => n !== k) })}><X size={12} /></button></div>)}
          <button type="button" className="rw-add-opt" onClick={() => setQ(i, { options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`] })}>+ Add option</button>
        </div>}
        {q.type === 'scale' && !q.preset && <div className="rw-scale">
          <label>From 1 to <select value={q.max ?? 5} onChange={e => setQ(i, { max: Number(e.target.value), min: 1 })}><option value={5}>5</option><option value={7}>7</option><option value={10}>10</option></select></label>
          <input value={q.minLabel ?? ''} placeholder="Low label" aria-label="Low label" onChange={e => setQ(i, { minLabel: e.target.value })} />
          <input value={q.maxLabel ?? ''} placeholder="High label" aria-label="High label" onChange={e => setQ(i, { maxLabel: e.target.value })} />
        </div>}
        <label className="rw-req"><input type="checkbox" checked={!!q.required} onChange={e => setQ(i, { required: e.target.checked })} /> Required</label>
      </div>)}
      <div className="rw-addbar">
        {QUESTION_TYPES.map(([t, l, hint]) => <button key={t} type="button" title={hint} onClick={() => add([newQuestion(t)])}>+ {l}</button>)}
      </div>
      <div className="rw-presets">
        <p className="rw-kicker">Standard questionnaires</p>
        <button type="button" disabled={hasSus} onClick={() => add(susQuestions())}><strong>SUS · System Usability Scale</strong><small>10 standard statements. Gives a 0–100 usability score and grade.</small></button>
        <button type="button" disabled={qs.some(q => q.preset === 'nps')} onClick={() => add([npsQuestion()])}><strong>NPS · Net Promoter Score</strong><small>“How likely are you to recommend…” 0–10. Gives a score from −100 to 100.</small></button>
      </div>
      <label className="rw-field"><span>Thank-you message</span><input value={study.thanks ?? ''} onChange={e => update({ thanks: e.target.value })} onFocus={() => setPreviewAt(qs.length)} /></label>
    </div>
    <div className="rw-preview" aria-label="Live preview">
      <div className="rw-phone"><SurveyRunner study={study} preview startAt={previewAt} /></div>
      <small>Live preview · what participants see</small>
    </div>
  </div>;
}

/* ---------- Share ---------- */
function Share({ study, update }: { study: Study; update: (p: Partial<Study>) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [needPass, setNeedPass] = useState(!getPasscode());
  const [pass, setPass] = useState(getPasscode());
  const [copied, setCopied] = useState(false);
  const link = participantLink(study.id);
  const publish = async (patch: Partial<Study> = {}) => {
    setBusy(true); setNote(null);
    try {
      const { study: saved } = await call<{ study: Study }>('publish', { study: { ...study, ...patch } }, true);
      update({ ...patch, published: true, notion: saved.notion });
      setNote(saved.notion?.error ? { text: `Published. Notion: ${saved.notion.error}`, error: true } : { text: saved.notion?.databaseId ? 'Published. Responses will also appear in your Notion database.' : 'Published. Share the link below.' });
    } catch (e) { if (e instanceof NeedsPasscode) setNeedPass(true); setNote({ text: e instanceof Error ? e.message : 'Could not publish.', error: true }); }
    finally { setBusy(false); }
  };
  return <div className="rw-share">
    <div className="rw-card">
      <h3>1 · Save responses to Notion <small>(optional)</small></h3>
      <p>Paste a Notion page link. On publish, a database named “{study.title} · responses” is created inside it, with one row per participant. In Notion, open the page → ••• → Connections → add your Case Study Studio integration first.</p>
      <input className="rw-input" placeholder="https://www.notion.so/…" value={study.notion?.pageUrl ?? ''} onChange={e => update({ notion: { ...study.notion, pageUrl: e.target.value } })} />
      {study.notion?.databaseId && <small className="rw-ok">Connected to a Notion database.</small>}
    </div>
    <div className="rw-card">
      <h3>2 · Publish</h3>
      {needPass && <input className="rw-input" type="password" placeholder="Studio passcode" value={pass} onChange={e => { setPass(e.target.value); setPasscode(e.target.value); }} aria-label="Studio passcode" />}
      <div className="rw-row">
        <button type="button" className="csb-primary-button" disabled={busy} onClick={() => void publish()}>{busy ? 'Publishing…' : study.published ? 'Publish changes' : 'Publish survey'}</button>
        {study.published && <button type="button" className="csb-quiet-button" disabled={busy} onClick={() => void publish({ status: study.status === 'open' ? 'closed' : 'open' })}>{study.status === 'open' ? 'Close survey' : 'Reopen survey'}</button>}
      </div>
      {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`} role="status">{note.text}</p>}
    </div>
    <div className={`rw-card ${study.published ? '' : 'is-muted'}`}>
      <h3>3 · Send the link</h3>
      <p>Anyone with the link can answer. Works on phones. Answers are anonymous unless you ask for a name.</p>
      <div className="rw-link"><input readOnly value={link} aria-label="Participant link" onFocus={e => e.target.select()} />
        <button type="button" className="csb-quiet-button" disabled={!study.published} onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy size={13} /> {copied ? 'Copied' : 'Copy'}</button>
        <a className="csb-quiet-button" href={link} target="_blank" rel="noreferrer" aria-disabled={!study.published}><ExternalLink size={13} /> Open</a></div>
    </div>
  </div>;
}

/* ---------- Results ---------- */
function Results({ study, onAddSections }: { study: Study; onAddSections: (s: CaseStudySection[], note: string) => void }) {
  const [data, setData] = useState<{ study: Study; responses: Response[] } | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const load = () => { setError(''); call<{ study: Study; responses: Response[] }>('results', { id: study.id }, true).then(setData, e => setError(e instanceof Error ? e.message : 'Could not load results.')); };
  useEffect(load, [study.id]);
  const s = data?.study ?? study; const responses = data?.responses ?? [];
  const results = useMemo(() => aggregate(s, responses), [data]);
  const sus = useMemo(() => susScore(s, responses), [data]);
  const nps = results.find((r): r is Extract<QuestionResult, { kind: 'nps' }> => r.kind === 'nps');
  const medianSec = responses.length ? Math.round([...responses].sort((a, b) => a.ms - b.ms)[Math.floor(responses.length / 2)].ms / 1000) : 0;
  const quotes = results.flatMap(r => r.kind === 'text' ? r.answers.map((a, k) => ({ key: `${r.q.id}-${k}`, text: a })) : []);

  const addCharts = () => {
    const choice = results.filter((r): r is Extract<QuestionResult, { kind: 'choice' }> => r.kind === 'choice' && r.answered > 0).slice(0, 4);
    const scales = results.filter((r): r is Extract<QuestionResult, { kind: 'scale' }> => r.kind === 'scale' && !r.q.preset && r.answered > 0).slice(0, 4 - choice.length);
    const questions = [...choice.map((r, i) => ({ sourceName: r.q.prompt, columnIndex: i, chart: 'bars' as const, multiSelect: r.q.type === 'multi', answered: r.answered, options: [...r.options].sort((a, b) => b.count - a.count) })),
      ...scales.map((r, i) => ({ sourceName: r.q.prompt, columnIndex: choice.length + i, chart: 'bars' as const, multiSelect: false, answered: r.answered, options: r.dist.map((count, k) => ({ label: `${(r.q.min ?? 1) + k}${k === 0 && r.q.minLabel ? ` · ${r.q.minLabel}` : k === r.dist.length - 1 && r.q.maxLabel ? ` · ${r.q.maxLabel}` : ''}`, count })) }))];
    if (!questions.length) return;
    const sec = { ...createSection('survey'), title: s.title, eyebrow: 'Discover', surveySource: { updatedAt: new Date().toISOString(), totalResponses: responses.length, questions }, items: questions.map(q => ({ title: q.sourceName, detail: '' })) };
    onAddSections([sec], `Added ${questions.length} chart${questions.length === 1 ? '' : 's'} from “${s.title}”.`);
  };
  const addScores = () => {
    const items = [{ value: String(responses.length), title: 'Participants', detail: `Answered “${s.title}”` },
      ...(sus ? [{ value: String(Math.round(sus.score)), title: 'SUS score', detail: `${sus.grade} usability (average is 68)` }] : []),
      ...(nps ? [{ value: `${nps.score > 0 ? '+' : ''}${nps.score}`, title: 'NPS', detail: `${nps.promoters} promoters · ${nps.detractors} detractors` }] : [])];
    const sec = { ...createSection('metrics'), title: 'What the numbers said', eyebrow: 'Results', items, layout: { count: items.length, columns: Math.min(3, items.length) as 1 | 2 | 3 } };
    onAddSections([sec], 'Added the scores as a numbers section.');
  };
  const addQuotes = () => {
    const chosen = quotes.filter(q => picked[q.key]).slice(0, 6); if (!chosen.length) return;
    const sec = { ...createSection('quotes'), title: 'In their words', eyebrow: 'Discover', items: chosen.map((q, i) => ({ title: `Participant ${String(i + 1).padStart(2, '0')}`, detail: q.text })) };
    onAddSections([sec], `Added ${chosen.length} quote${chosen.length === 1 ? '' : 's'}.`);
  };

  if (error) return <div className="rw-card"><p className="csb-field-note is-error">{error}</p><button type="button" className="csb-quiet-button" onClick={load}>Try again</button></div>;
  if (!data) return <p className="rw-empty">Loading results…</p>;
  return <div className="rw-results">
    <div className="rw-stats">
      <div><strong>{responses.length}</strong><small>Responses</small></div>
      <div><strong>{medianSec ? `${Math.floor(medianSec / 60)}:${String(medianSec % 60).padStart(2, '0')}` : '—'}</strong><small>Median time</small></div>
      {sus && <div><strong>{sus.n ? Math.round(sus.score) : '—'}</strong><small>SUS {sus.grade && `· ${sus.grade}`}</small></div>}
      {nps && <div><strong>{nps.answered ? `${nps.score > 0 ? '+' : ''}${nps.score}` : '—'}</strong><small>NPS</small></div>}
      <button type="button" className="csb-quiet-button" onClick={load}>Refresh</button>
    </div>
    {!responses.length ? <p className="rw-empty">No responses yet. Share the link from the Share tab.</p> : <>
      <div className="rw-addrow">
        <span>Add to the case study:</span>
        <button type="button" className="csb-quiet-button" onClick={addCharts}>Charts</button>
        <button type="button" className="csb-quiet-button" onClick={addScores}>Scores</button>
        <button type="button" className="csb-quiet-button" disabled={!Object.values(picked).some(Boolean)} onClick={addQuotes}>Selected quotes</button>
      </div>
      {results.filter(r => !r.q.preset?.startsWith('sus-')).map(r => <div key={r.q.id} className="rw-res">
        <h4>{r.q.prompt}<small>{r.answered} answered</small></h4>
        {r.kind === 'choice' && <div className="rw-bars">{r.options.map(o => { const pct = r.answered ? Math.round(o.count / r.answered * 100) : 0; return <div key={o.label}><span>{o.label}</span><i><b style={{ width: `${pct}%` }} /></i><em>{pct}%</em></div>; })}{r.q.type === 'multi' && <small>Choose-all question: percentages add up to more than 100%.</small>}</div>}
        {r.kind === 'scale' && <div className="rw-bars">{r.dist.map((c, k) => { const pct = r.answered ? Math.round(c / r.answered * 100) : 0; return <div key={k}><span>{(r.q.min ?? 1) + k}</span><i><b style={{ width: `${pct}%` }} /></i><em>{pct}%</em></div>; })}<small>Average {r.mean.toFixed(1)} of {r.q.max ?? 5}</small></div>}
        {r.kind === 'nps' && <div className="rw-nps"><strong>{r.score > 0 ? '+' : ''}{r.score}</strong><span>{r.promoters} promoters · {r.passives} passives · {r.detractors} detractors</span></div>}
        {r.kind === 'text' && <ul className="rw-quotes">{r.answers.map((a, k) => { const key = `${r.q.id}-${k}`; return <li key={key}><label><input type="checkbox" checked={!!picked[key]} onChange={e => setPicked(p => ({ ...p, [key]: e.target.checked }))} /> “{a}”</label></li>; })}</ul>}
      </div>)}
      {sus && <div className="rw-res"><h4>System Usability Scale<small>{sus.n} complete</small></h4><div className="rw-nps"><strong>{Math.round(sus.score)}</strong><span>{sus.grade}. The average product scores 68.</span></div></div>}
    </>}
  </div>;
}
