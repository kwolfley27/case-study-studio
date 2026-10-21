import { Fragment, useEffect, useMemo, useState } from 'react';
import { MessagesSquare, ArrowDown, ArrowUp, BarChart3, Copy, CopyPlus, ExternalLink, ImagePlus, Link2, ListChecks, PenLine, Plus, Smartphone, Sparkles, Trash2, X } from 'lucide-react';
import { uploadToStudio } from '../media';
import { authHeaders } from '../auth';
import { projectId } from '../../../utils/supabase/info';
import { UsabilityBuilder, UsabilityResults, UsabilityRun } from './Usability';
import { SurveyRunner } from './SurveyRunner';
import { ACCENTS, BACKGROUNDS, duplicateQuestion, aggregate, BOOKED, call, CONTACT_FIELDS, contactModes, getPasscode, isCalendly, splitPrompt, estimateMinutes, answerWords, letterQuestions, aboutYouQuestions, groupQuestions, groupLabel, participantName, filterByGroups, bucketCount, AGE_RANGES, canFollowUp, isChoice, hasOptions, lintQuestion, DEFAULT_FOLLOWUP_BUDGET, NeedsPasscode, newQuestion, newStudy, newUsability, newInterview, npsQuestion, participantLink, QUESTION_TYPES, readDrafts, recruitQuestions, setPasscode, susQuestions, susScore, writeDrafts, type ContactKey, type FieldMode, type Question, type QuestionResult, type Response, type Study } from './research';
import { createSection, type CaseStudySection } from '../model';
import './research.css';

type Tab = 'build' | 'share' | 'results';

export function ResearchWorkspace({ onExit, onAddSections, project, initialId, initialTab, onRoute }: { onExit: () => void; onAddSections: (sections: CaseStudySection[], note: string) => void; project?: { id: string; title: string }; initialId?: string; initialTab?: string; /** Tells the app which survey and tab are open, for the address bar. */ onRoute?: (id: string | null, tab: string) => void }) {
  const [studies, setStudies] = useState<Study[]>(() => readDrafts());
  const [currentId, setCurrentId] = useState<string | null>(() => initialId && readDrafts().some(s => s.id === initialId) ? initialId : (readDrafts().find(s => s.projectId === project?.id) ?? readDrafts()[0])?.id ?? null);
  const [tab, setTab] = useState<Tab>(() => initialTab === 'share' || initialTab === 'results' ? initialTab : 'build');
  useEffect(() => { onRoute?.(currentId, tab); }, [currentId, tab]);
  const [previewAt, setPreviewAt] = useState(-1);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => { writeDrafts(studies); }, [studies]);
  // Response counts for published studies (quietly skipped if the service or passcode isn't set up).
  useEffect(() => { call<{ studies: Study[] }>('list', {}, true).then(d => setCounts(Object.fromEntries(d.studies.map(s => [s.id, s.responses ?? 0])))).catch(() => undefined); }, []);
  const study = studies.find(s => s.id === currentId) ?? null;
  const update = (patch: Partial<Study>) => setStudies(list => list.map(s => s.id === currentId ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s));
  const create = (kind: Study['kind'] | 'interview' = 'survey') => { const s = kind === 'interview' ? newInterview(project) : kind === 'usability' ? newUsability(project) : newStudy(project); setStudies(list => [s, ...list]); setCurrentId(s.id); setTab('build'); setPreviewAt(-1); };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this study? Published responses are deleted too.')) return;
    const s = studies.find(x => x.id === id); if (s?.published) await call('remove', { id }, true).catch(() => undefined);
    setStudies(list => list.filter(x => x.id !== id)); if (currentId === id) setCurrentId(null);
  };

  return <main className="csb-app rw">
    <header className="csb-home-head rw-head">
      <button type="button" className="csb-wordmark csb-wordmark-home" onClick={onExit} title="Back to the studio"><span className="csb-wordmark-icon">✳</span>Case Study Studio</button>
      <span className="csb-header-separator" /><strong className="rw-title">Research</strong>
      <button type="button" className="csb-quiet-button rw-back" onClick={onExit}>Back to {project?.title ? `“${project.title.length > 28 ? project.title.slice(0, 28) + '…' : project.title}”` : 'case study'}</button>
    </header>
    <div className="rw-shell">
      <aside className="rw-list">
        <button type="button" className="csb-primary-button" onClick={() => create('survey')}><Plus size={14} /> New survey</button>
        <button type="button" className="csb-quiet-button rw-new-ut" onClick={() => create('usability')}><ListChecks size={14} /> New usability test</button>
        <button type="button" className="csb-quiet-button rw-new-ut" onClick={() => create('interview')}><MessagesSquare size={14} /> New interview guide</button>
        <p className="rw-list-kicker">Studies</p>
        {!studies.length && <p className="rw-empty">Surveys: share a link and chart the answers. Usability tests: run sessions from your phone and score each task.</p>}
        {studies.map(s => <div key={s.id} className={`rw-study ${s.id === currentId ? 'is-on' : ''}`}>
          <button type="button" onClick={() => { setCurrentId(s.id); setPreviewAt(-1); }}><strong>{s.title}</strong><small>{s.format === 'interview' ? 'Interview' : s.kind === 'usability' ? 'Usability test' : 'Survey'} · {s.published ? (s.kind === 'usability' ? 'Saved' : s.status === 'open' ? 'Live' : 'Closed') : 'Draft'}{counts[s.id] !== undefined ? ` · ${counts[s.id]} ${s.kind === 'usability' ? 'sessions' : 'responses'}` : ''}{s.projectTitle ? ` · ${s.projectTitle}` : ''}</small></button>
          <button type="button" className="rw-icon" aria-label={`Delete ${s.title}`} onClick={() => void remove(s.id)}><Trash2 size={13} /></button>
        </div>)}
      </aside>
      {study ? <section className="rw-main">
        <div className="rw-tabs" role="tablist">
          {(study.kind === 'usability' ? [['build', study.format === 'interview' ? 'Questions' : 'Tasks', PenLine], ['share', 'Run', Smartphone], ['results', 'Results', BarChart3]] as const : [['build', 'Build', PenLine], ['share', 'Share', Link2], ['results', 'Results', BarChart3]] as const).map(([k, l, Icon]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}><Icon size={14} /> {l}</button>)}
        </div>
        {study.kind === 'usability' ? <>
          {tab === 'build' && <UsabilityBuilder study={study} update={update} />}
          {tab === 'share' && <UsabilityRun study={study} update={update} onOpenResults={() => setTab('results')} />}
          {tab === 'results' && <UsabilityResults study={study} onAddSections={onAddSections} />}
        </> : <>
          {tab === 'build' && <Builder study={study} update={update} previewAt={previewAt} setPreviewAt={setPreviewAt} />}
          {tab === 'share' && <Share study={study} update={update} />}
          {tab === 'results' && <Results study={study} onAddSections={onAddSections} />}
        </>}
      </section> : <section className="rw-main rw-blank"><h2>Your own research tool</h2><p>Write a survey and send participants a link, run a moderated usability test, or record interviews from your phone: tasks, a recording, a transcript and success for each task. Everything saves to your server and Notion, and goes into a case study in one click.</p><div className="rw-row"><button type="button" className="csb-primary-button" onClick={() => create('survey')}><Plus size={14} /> New survey</button><button type="button" className="csb-quiet-button" onClick={() => create('usability')}><ListChecks size={14} /> New usability test</button></div></section>}
    </div>
  </main>;
}

/* ---------- Build ---------- */
function Builder({ study, update, previewAt, setPreviewAt }: { study: Study; update: (p: Partial<Study>) => void; previewAt: number; setPreviewAt: (n: number) => void }) {
  const qs = study.questions;
  const setQ = (i: number, patch: Partial<Question>) => update({ questions: qs.map((q, k) => k === i ? { ...q, ...patch } : q) });
  const move = (i: number, j: number) => { const n = [...qs]; [n[i], n[j]] = [n[j], n[i]]; update({ questions: n }); setPreviewAt(j); };
  const add = (list: Question[]) => { update({ questions: [...qs, ...list] }); setPreviewAt(qs.length); };
  // Deleting a question also clears any "Show only if" that pointed at it.
  const removeQ = (i: number) => { const gone = qs[i].id; update({ questions: qs.filter((_, k) => k !== i).map(q => q.showIf?.questionId === gone ? { ...q, showIf: undefined } : q) }); };
  const hasRecruit = qs.some(q => q.preset === 'recruit');
  const duplicate = (i: number) => { const n = [...qs]; n.splice(i + 1, 0, duplicateQuestion(qs[i])); update({ questions: n }); setPreviewAt(i + 1); };
  const hasSus = qs.some(q => q.preset?.startsWith('sus-'));
  return <div className="rw-build">
    <div className="rw-editor">
      <label className="rw-field"><span>Survey title</span><input value={study.title} onChange={e => update({ title: e.target.value })} onFocus={() => setPreviewAt(-1)} /></label>
      <label className="rw-field"><span>Welcome message</span><textarea rows={2} value={study.intro ?? ''} onChange={e => update({ intro: e.target.value })} onFocus={() => setPreviewAt(-1)} /></label>
      <label className="rw-field"><span>What you want to learn <em className="rw-private">private · steers the AI follow-ups</em></span><textarea rows={3} value={study.goal ?? ''} onChange={e => update({ goal: e.target.value || undefined })} placeholder="e.g. Why people do or don’t meal prep, what gets in the way, and what they hope it’ll do for them (save money, eat healthier, save time). How they plan meals and shop for groceries. Tracking matters less." /></label>
      {qs.some(q => q.followups) && <div className="rw-contact-row rw-budget"><span>Most AI follow-ups per person <small>keeps it from feeling like homework</small></span>
        <div className="rw-seg" role="radiogroup" aria-label="Follow-up limit">{[4, 6, 8, 12].map(v => <button key={v} type="button" role="radio" aria-checked={(study.followupBudget ?? DEFAULT_FOLLOWUP_BUDGET) === v} className={(study.followupBudget ?? DEFAULT_FOLLOWUP_BUDGET) === v ? 'is-on' : ''} onClick={() => update({ followupBudget: v })}>{v}</button>)}</div></div>}
      <AiDesigner study={study} update={update} setPreviewAt={setPreviewAt} />
      <LookEditor study={study} update={update} onFocus={() => setPreviewAt(-1)} />
      <p className="rw-kicker">Questions · {qs.length}{qs.some(q => q.bonus) ? ` · short version about ${estimateMinutes(qs.filter(q => !q.bonus), study.followupBudget)} min, bonus round about ${estimateMinutes(qs.filter(q => q.bonus), Math.max(1, Math.round((study.followupBudget ?? DEFAULT_FOLLOWUP_BUDGET) / 2)))} more` : ''}</p>
      {qs.some(q => q.bonus) && <p className="rw-note" style={{ margin: '-4px 0 0' }}>Everyone gets the short version. At the end they’re offered the bonus round, and their short answers are already saved. Mark a question “Bonus round” to move it there.</p>}
      {qs.map((q, i) => <div key={q.id} className={`rw-q ${previewAt === i ? 'is-on' : ''}`} onFocusCapture={() => setPreviewAt(i)} onClick={() => setPreviewAt(i)}>
        <div className="rw-q-head">
          <span className="rw-q-num">{i + 1}</span>
          <select value={q.type} aria-label="Question type" disabled={!!q.preset && (q.preset.startsWith('sus-') || q.preset === 'nps' || q.preset === 'name')} onChange={e => { const t = e.target.value as Question['type']; const base = newQuestion(t); setQ(i, { type: t, options: base.options, min: base.min, max: base.max, minLabel: base.minLabel, maxLabel: base.maxLabel, contact: base.contact, url: t === 'schedule' ? q.url ?? '' : undefined, ...(t === 'contact' || t === 'schedule' ? { prompt: base.prompt, required: base.required } : {}) }); }}>{QUESTION_TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}</select>
          {q.preset && <span className="rw-tag">{q.preset === 'nps' ? 'NPS' : q.preset === 'letter' ? 'Love / hate' : q.preset === 'recruit' ? 'Recruit' : q.preset === 'name' ? 'Name · private' : q.preset === 'about' ? 'About you' : 'SUS'}</span>}
          {q.group && <span className="rw-tag is-group">Group</span>}
          {q.bonus && <span className="rw-tag is-bonus">Bonus round</span>}
          <span className="rw-q-tools">
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></button>
            <button type="button" aria-label="Move down" disabled={i === qs.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></button>
            <button type="button" aria-label="Duplicate question" title="Duplicate" onClick={() => duplicate(i)}><CopyPlus size={13} /></button>
            <button type="button" aria-label="Delete question" onClick={() => removeQ(i)}><X size={13} /></button>
          </span>
        </div>
        <textarea className="rw-prompt" rows={2} value={q.prompt} readOnly={q.preset?.startsWith('sus-')} onChange={e => setQ(i, { prompt: e.target.value })} aria-label={`Question ${i + 1}`} />
        {q.type === 'note' && <textarea className="rw-input rw-note-body" value={q.hint ?? ''} placeholder="What people should know before the next questions. Leave a blank line between paragraphs. A paragraph starting with “For example” is shown as an example." aria-label={`Screen ${i + 1} text`} onChange={e => setQ(i, { hint: e.target.value || undefined })} />}
        {q.type !== 'note' && !q.preset?.startsWith('sus-') && <input className="rw-input rw-hint-input" value={q.hint ?? ''} placeholder={splitPrompt({ prompt: q.prompt }).sub ? 'Helper text: the part in brackets above already shows small and gray' : 'Helper text (optional): shows smaller and lighter, e.g. “For example, …”'} aria-label={`Question ${i + 1} helper text`} onChange={e => setQ(i, { hint: e.target.value || undefined })} />}
        {(() => { const lints = lintQuestion(q); return lints.length > 0 && <div className="rw-lints">{lints.map((l, k) => <p key={k} className={`rw-lint ${l.level === 'tip' ? 'is-tip' : ''}`}><b>{l.level === 'warn' ? 'Check' : 'Tip'}</b>{l.text}</p>)}</div>; })()}
        {hasOptions(q) && <div className="rw-opts">
          {(q.options ?? []).map((o, k) => <div key={k} className="rw-opt">{q.optionImages ? <OptionImage study={study} src={q.optionImages[k]} label={o} onChange={src => { const imgs = [...(q.optionImages ?? [])]; imgs[k] = src; setQ(i, { optionImages: imgs }); }} /> : q.type === 'rank' ? <span className="rw-rank-num">{k + 1}</span> : <span className={`rs-mark ${q.type === 'multi' ? 'is-box' : ''}`} aria-hidden="true" />}<input value={o} aria-label={`Option ${k + 1}`} onChange={e => setQ(i, { options: q.options!.map((x, n) => n === k ? e.target.value : x) })} /><button type="button" aria-label={`Remove option ${k + 1}`} onClick={() => setQ(i, { options: q.options!.filter((_, n) => n !== k), optionImages: q.optionImages?.filter((_, n) => n !== k) })}><X size={12} /></button></div>)}
          <div className="rw-row"><button type="button" className="rw-add-opt" onClick={() => setQ(i, { options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`], optionImages: q.optionImages ? [...q.optionImages, ''] : undefined })}>+ Add option</button>
            {isChoice(q) && !(q.options ?? []).some(o => /^other\b/i.test(o)) && <button type="button" className="rw-add-opt" title="Tip: turn on AI follow-ups for “Other” so the AI asks what they meant" onClick={() => setQ(i, { options: [...(q.options ?? []), 'Other'], optionImages: q.optionImages ? [...q.optionImages, ''] : undefined })}>+ Other</button>}</div>
          {q.type === 'rank' && <small className="rw-note">Participants tap options in order, best first. Results show the average position and how often each came first. Order here doesn’t matter; it’s shuffled for each person.</small>}
        </div>}
        {q.type === 'scale' && !q.preset && <div className="rw-scale">
          <label>From 1 to <select value={q.max ?? 5} onChange={e => setQ(i, { max: Number(e.target.value), min: 1 })}><option value={5}>5</option><option value={7}>7</option><option value={10}>10</option></select></label>
          <input value={q.minLabel ?? ''} placeholder="Low label" aria-label="Low label" onChange={e => setQ(i, { minLabel: e.target.value })} />
          <input value={q.maxLabel ?? ''} placeholder="High label" aria-label="High label" onChange={e => setQ(i, { maxLabel: e.target.value })} />
        </div>}
        {q.type === 'contact' && <div className="rw-contact">
          {CONTACT_FIELDS.map(([k, label]) => { const m = contactModes(q)[k]; return <div key={k} className="rw-contact-row"><span>{label}</span>
            <div className="rw-seg" role="radiogroup" aria-label={`${label} field`}>{(['off', 'optional', 'required'] as FieldMode[]).map(v => <button key={v} type="button" role="radio" aria-checked={m === v} className={m === v ? 'is-on' : ''} onClick={() => setQ(i, { contact: { ...contactModes(q), [k]: v } as Record<ContactKey, FieldMode> })}>{v === 'off' ? 'Off' : v === 'optional' ? 'Optional' : 'Required'}</button>)}</div></div>; })}
          <small className="rw-note">Kept private: shown in your follow-up list, left out of charts, quotes and anything added to a case study.</small>
        </div>}
        {q.type === 'schedule' && <div className="rw-contact">
          <input className="rw-input" value={q.url ?? ''} placeholder="https://calendly.com/you/30min" aria-label="Booking link" onChange={e => setQ(i, { url: e.target.value })} />
          <small className="rw-note">{!q.url ? 'Paste your Calendly link (or Cal.com, Google appointment page…).' : isCalendly(q.url) ? 'Calendly shows right in the survey, with their name and email filled in. Bookings are marked in Results.' : 'Participants get a “Pick a time” button that opens this link.'}</small>
        </div>}
        {q.image !== undefined && <ImageField study={study} label="Picture above the question" value={q.image} onChange={v => setQ(i, { image: v })} onRemove={() => setQ(i, { image: undefined })} />}
        {!q.preset?.startsWith('sus-') && <div className="rw-q-extra">
          {q.image === undefined && <button type="button" onClick={() => setQ(i, { image: '' })}><ImagePlus size={11} /> Picture</button>}
          {hasOptions(q) && <button type="button" onClick={() => setQ(i, { optionImages: q.optionImages ? undefined : (q.options ?? []).map(() => '') })}>{q.optionImages ? 'Plain options' : 'Picture options'}</button>}
        </div>}
        {canFollowUp(q) && <div className="rw-contact rw-fu">
          <div className="rw-contact-row"><span>AI follow-ups</span>
            <div className="rw-seg" role="radiogroup" aria-label="AI follow-ups">{[0, 1, 2, 3].map(v => <button key={v} type="button" role="radio" aria-checked={(q.followups ?? 0) === v} className={(q.followups ?? 0) === v ? 'is-on' : ''} onClick={() => setQ(i, { followups: v || undefined })}>{v === 0 ? 'Off' : `Up to ${v}`}</button>)}</div></div>
          {!!q.followups && isChoice(q) && <div className="rw-showif"><span>Follow up when they pick {q.followIf?.length ? '' : <em>any answer</em>}</span><div className="rw-chips">{(q.options ?? []).map(o => { const on = !!q.followIf?.includes(o); return <button key={o} type="button" aria-pressed={on} className={on ? 'is-on' : ''} onClick={() => { const list = on ? (q.followIf ?? []).filter(x => x !== o) : [...(q.followIf ?? []), o]; setQ(i, { followIf: list.length ? list : undefined }); }}>{o}</button>; })}</div></div>}
          {!!q.followups && <input className="rw-input" value={q.probe ?? ''} placeholder="What to dig into (optional), e.g. If they don’t meal prep, ask what stops them. If they want to, ask why: money, time, health?" aria-label="What the AI should dig into" onChange={e => setQ(i, { probe: e.target.value || undefined })} />}
          {!!q.followups && <small className="rw-note">After they answer, AI asks about what they actually said, one question at a time. It stops early when there’s nothing worth asking.</small>}
        </div>}
        <ShowIfEditor qs={qs} i={i} setQ={setQ} />
        <div className="rw-row">{q.type !== 'schedule' && q.type !== 'note' && <label className="rw-req"><input type="checkbox" checked={!!q.required} onChange={e => setQ(i, { required: e.target.checked })} /> Required</label>}
          {!q.preset?.startsWith('sus-') && q.preset !== 'name' && q.preset !== 'about' && <label className="rw-req" title="Only asked if they choose to keep going after the short version"><input type="checkbox" checked={!!q.bonus} onChange={e => setQ(i, { bonus: e.target.checked || undefined })} /> Bonus round</label>}
          {(q.type === 'single' || q.type === 'multi') && !q.preset?.startsWith('sus-') && <label className="rw-req" title="Each answer becomes a group (bucket) you can filter and compare in Results"><input type="checkbox" checked={!!q.group} onChange={e => setQ(i, { group: e.target.checked || undefined })} /> Use answers as groups</label>}</div>
      </div>)}
      <div className="rw-addbar">
        {QUESTION_TYPES.map(([t, l, hint]) => <button key={t} type="button" title={hint} onClick={() => add([newQuestion(t)])}>+ {l}</button>)}
      </div>
      <div className="rw-presets">
        <p className="rw-kicker">Standard questionnaires</p>
        <button type="button" disabled={hasSus} onClick={() => add(susQuestions())}><strong>SUS · System Usability Scale</strong><small>10 standard statements. Gives a 0–100 usability score and grade.</small></button>
        <button type="button" disabled={qs.some(q => q.preset === 'nps')} onClick={() => add([npsQuestion()])}><strong>NPS · Net Promoter Score</strong><small>“How likely are you to recommend…” 0–10. Gives a score from −100 to 100.</small></button>
        <button type="button" disabled={qs.some(q => q.preset === 'about')} onClick={() => { update({ questions: [...aboutYouQuestions(), ...qs] }); setPreviewAt(0); }}><strong>About you (start of survey)</strong><small>Age range, how often they meal prep, and what describes them (student, gym, runner…). Sorts everyone into groups you can compare in Results.</small></button>
        <button type="button" disabled={qs.some(q => q.preset === 'letter')} onClick={() => add(letterQuestions())}><strong>Love it / can’t stand it</strong><small>Two open questions: one food thing they’d never give up, and one they struggle with or can’t stand. The breakup letter shows what to fix; the love letter shows what to keep. Best mid-survey, once people have warmed up.</small></button>
        <button type="button" disabled={hasRecruit} onClick={() => add(recruitQuestions())}><strong>Recruit for interviews</strong><small>“Open to a follow-up interview?” Yes / Maybe / No. Yes and Maybe then get contact info and your Calendly link.</small></button>
      </div>
      <label className="rw-field"><span>Thank-you message</span><input value={study.thanks ?? ''} onChange={e => update({ thanks: e.target.value })} onFocus={() => setPreviewAt(qs.length)} /></label>
    </div>
    <div className="rw-preview" aria-label="Live preview">
      <div className="rw-phone"><SurveyRunner study={study} preview startAt={previewAt} /></div>
      <small>Live preview · what participants see</small>
    </div>
  </div>;
}

/* ---------- Design with AI: describe the goal, approve questions one by one ---------- */
const AI_URL = import.meta.env.VITE_STUDIO_AI_URL || (projectId ? `https://${projectId}.supabase.co/functions/v1/studio-ai-draft` : '');
type Proposal = { ref: string; replaces?: number; type: Question['type']; prompt: string; hint?: string; followups?: number; probe?: string; options?: string[]; minLabel?: string; maxLabel?: string; required?: boolean; why: string; showIf?: { ref: string; anyOf: string[] } };
type Design = { title?: string; intro?: string; summary: string; questions: Proposal[] };
const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map(([t, l]) => [t, l])) as Record<Question['type'], string>;

function AiDesigner({ study, update, setPreviewAt }: { study: Study; update: (p: Partial<Study>) => void; setPreviewAt: (n: number) => void }) {
  const qs = study.questions;
  const [open, setOpen] = useState(!qs.length);
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState(getPasscode());
  const [design, setDesign] = useState<Design | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<Record<string, string>>({}); // proposal ref → question id, so later picks can branch on earlier ones
  const ask = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Studio-Passcode': getPasscode() }, body: JSON.stringify({ task: 'designSurvey', goal: [study.goal ? `Research goal: ${study.goal}` : '', goal].filter(Boolean).join('\n\n'), title: study.title, questions: qs.map(q => ({ type: q.type, prompt: q.prompt, options: q.options })) }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { setNeedPass(true); throw new Error(data.message || 'Enter your Studio passcode.'); }
      if (!res.ok || !Array.isArray(data.questions)) throw new Error(/Notion research link|Figma design link/.test(data.error || '') ? 'Survey design needs the latest studio-ai-draft function deployed.' : data.error || 'The AI could not draft questions. Try again.');
      setDesign(data); setApplied({}); setPicked(Object.fromEntries((data.questions as Proposal[]).map(p => [p.ref, true])));
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };
  const apply = (refs: string[]) => {
    if (!design) return;
    let list = [...qs]; const map = { ...applied };
    const chosen = design.questions.filter(p => refs.includes(p.ref) && !applied[p.ref]);
    const resolve = (ref: string) => map[ref] ?? (/^n\d+$/.test(ref) ? qs[Number(ref.slice(1)) - 1]?.id : undefined);
    for (const p of chosen) {
      const base = newQuestion(p.type);
      const target = p.replaces ? qs[p.replaces - 1] : undefined;
      const q: Question = { ...base, id: target?.id ?? base.id, prompt: p.prompt, ...(p.hint ? { hint: p.hint } : {}), ...(p.followups && (p.type === 'long' || p.type === 'text') ? { followups: Math.min(3, p.followups), probe: p.probe } : {}), ...(p.options?.length ? { options: p.options } : {}), ...(p.minLabel ? { minLabel: p.minLabel } : {}), ...(p.maxLabel ? { maxLabel: p.maxLabel } : {}), ...(p.required !== undefined && p.type !== 'schedule' ? { required: p.required } : {}), showIf: target?.showIf };
      map[p.ref] = q.id;
      if (target) list = list.map(x => x.id === target.id ? q : x); else list.push(q);
    }
    // Branching, now that every chosen question has an id.
    for (const p of chosen) { if (!p.showIf) continue; const src = resolve(p.showIf.ref); if (src) list = list.map(x => x.id === map[p.ref] ? { ...x, showIf: { questionId: src, anyOf: p.showIf!.anyOf } } : x); }
    update({ questions: list }); setApplied(map); setPreviewAt(list.findIndex(x => x.id === map[chosen[0]?.ref]));
  };
  const pending = design?.questions.filter(p => !applied[p.ref]) ?? [];
  const selected = pending.filter(p => picked[p.ref]).map(p => p.ref);
  const condText = (p: Proposal) => { if (!p.showIf) return ''; const src = design?.questions.find(x => x.ref === p.showIf!.ref); const label = src ? `“${src.prompt.slice(0, 40)}${src.prompt.length > 40 ? '…' : ''}”` : /^n\d+$/.test(p.showIf.ref) ? `Q${p.showIf.ref.slice(1)}` : 'an earlier answer'; return `Only if ${label} is ${p.showIf.anyOf.map(o => `“${o}”`).join(' or ')}`; };

  if (!open) return <button type="button" className="rw-ai-open" onClick={() => setOpen(true)}><Sparkles size={14} /> Design with AI <small>Describe what you want to learn. Approve the questions you like.</small></button>;
  return <div className="rw-ai">
    <div className="rw-ai-head"><strong><Sparkles size={14} /> Design with AI</strong><button type="button" className="rw-icon" aria-label="Close" onClick={() => setOpen(false)}><X size={13} /></button></div>
    <textarea className="rw-input" rows={3} value={goal} onChange={e => setGoal(e.target.value)} placeholder={qs.length ? 'Optional: what should it improve? e.g. “Make this a screener for people who meal prep at least twice a month. Keep it under 3 minutes.”' : 'What do you want to learn, and who should take it? e.g. “Screener for a 30-min interview with people who meal prep or track food. I want a mix of beginners and regulars.”'} />
    {needPass && <input className="rw-input" type="password" placeholder="Studio passcode" value={pass} onChange={e => { setPass(e.target.value); setPasscode(e.target.value); }} aria-label="Studio passcode" />}
    <div className="rw-row">
      <button type="button" className="csb-primary-button" disabled={busy || (!goal.trim() && !qs.length)} onClick={() => void ask()}>{busy ? 'Thinking…' : design ? 'Try again' : qs.length ? 'Review my survey' : 'Draft questions'}</button>
      {design && pending.length > 0 && <button type="button" className="csb-quiet-button" disabled={!selected.length} onClick={() => apply(selected)}>Add {selected.length} selected</button>}
    </div>
    {error && <p className="csb-field-note is-error" role="alert">{error}</p>}
    {design && <>
      {design.summary && <p className="rw-ai-summary">{design.summary}</p>}
      {(design.title && design.title !== study.title || design.intro && design.intro !== study.intro) && <div className="rw-ai-card is-meta">
        {design.title && design.title !== study.title && <div><small>Title</small><p>{design.title}</p><button type="button" className="csb-quiet-button" onClick={() => update({ title: design.title })}>Use</button></div>}
        {design.intro && design.intro !== study.intro && <div><small>Welcome message</small><p>{design.intro}</p><button type="button" className="csb-quiet-button" onClick={() => update({ intro: design.intro })}>Use</button></div>}
      </div>}
      {!pending.length ? <p className="rw-ok">All suggestions added. Tweak anything below.</p> : pending.map(p => <div key={p.ref} className={`rw-ai-card ${picked[p.ref] ? 'is-on' : ''}`}>
        <label className="rw-ai-pick"><input type="checkbox" checked={!!picked[p.ref]} onChange={e => setPicked(x => ({ ...x, [p.ref]: e.target.checked }))} />
          <span><small>{p.replaces ? `Rewrite of Q${p.replaces}` : 'New'} · {TYPE_LABEL[p.type]}</small>
            {p.replaces && qs[p.replaces - 1] && <s>{qs[p.replaces - 1].prompt}</s>}
            <strong>{p.prompt}</strong>
            {p.hint && <em>{p.hint}</em>}
            {!!p.followups && <em className="rw-ai-cond">AI follow-ups: up to {p.followups}{p.probe ? ` · ${p.probe}` : ''}</em>}
            {p.options && <em>{p.options.join(' · ')}</em>}
            {p.showIf && <em className="rw-ai-cond">{condText(p)}</em>}
            <i>{p.why}</i></span></label>
        <button type="button" className="csb-quiet-button" onClick={() => apply([p.ref])}>{p.replaces ? 'Replace' : 'Add'}</button>
      </div>)}
    </>}
  </div>;
}

/* ---------- Look: colours and pictures ---------- */
function useUpload(study: Study) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const upload = async (file: File | undefined, done: (url: string) => void) => {
    if (!file) return; setBusy(true); setErr('');
    try { done(await uploadToStudio(file, `research-${study.id.slice(0, 8)}`)); }
    catch (e) { setErr(e instanceof Error ? `${e.message} You can paste an image link instead.` : 'Upload failed.'); }
    finally { setBusy(false); }
  };
  return { busy, err, upload };
}
function ImageField({ study, label, value, onChange, onRemove }: { study: Study; label: string; value: string; onChange: (v: string) => void; onRemove?: () => void }) {
  const { busy, err, upload } = useUpload(study);
  return <div className="rw-contact">
    <div className="rw-imgfield">
      {value ? <img src={value} alt="" /> : null}
      <input className="rw-input" type="url" value={value} placeholder={`${label}: paste an image link`} aria-label={label} onChange={e => onChange(e.target.value)} />
      <label className="rw-upload"><ImagePlus size={12} /> {busy ? 'Uploading…' : 'Upload'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => void upload(e.target.files?.[0], onChange)} /></label>
      {onRemove && <button type="button" className="rw-icon" aria-label="Remove picture" onClick={onRemove}><X size={12} /></button>}
    </div>
    {err && <small className="rw-note is-warn">{err}</small>}
  </div>;
}
function OptionImage({ study, src, label, onChange }: { study: Study; src?: string; label: string; onChange: (v: string) => void }) {
  const { busy, upload } = useUpload(study);
  return <label className="rw-opt-img" title={`Picture for “${label}”`}>{src ? <img src={src} alt="" /> : busy ? '…' : <ImagePlus size={13} />}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={`Picture for ${label}`} onChange={e => void upload(e.target.files?.[0], onChange)} /></label>;
}
function LookEditor({ study, update, onFocus }: { study: Study; update: (p: Partial<Study>) => void; onFocus: () => void }) {
  const t = study.theme ?? {};
  const set = (p: Partial<NonNullable<Study['theme']>>) => update({ theme: { ...t, ...p } });
  return <div className="rw-look" onFocusCapture={onFocus} onClick={onFocus}>
    <p className="rw-kicker" style={{ margin: 0 }}>Look</p>
    <div className="rw-look-row"><span>Accent</span><div className="rw-swatches">
      {ACCENTS.map(c => <button key={c} type="button" className={`rw-swatch ${(t.accent ?? '#000000') === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={`Accent ${c}`} onClick={() => set({ accent: c })} />)}
      <input type="color" value={t.accent ?? '#000000'} aria-label="Custom accent colour" onChange={e => set({ accent: e.target.value })} />
    </div></div>
    <div className="rw-look-row"><span>Background</span><div className="rw-swatches">
      {BACKGROUNDS.map(c => <button key={c} type="button" className={`rw-swatch ${(t.background ?? '#fdfcfc') === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={`Background ${c}`} onClick={() => set({ background: c })} />)}
      <input type="color" value={t.background ?? '#fdfcfc'} aria-label="Custom background colour" onChange={e => set({ background: e.target.value })} />
    </div></div>
    <div className="rw-look-row"><span>Cover picture</span><ImageField study={study} label="Cover picture" value={t.cover ?? ''} onChange={v => set({ cover: v })} onRemove={t.cover ? () => set({ cover: undefined }) : undefined} /></div>
  </div>;
}

/* "Show only if" — branch on an earlier one-choice or checkbox question. */
function ShowIfEditor({ qs, i, setQ }: { qs: Question[]; i: number; setQ: (i: number, p: Partial<Question>) => void }) {
  const q = qs[i];
  const sources = qs.slice(0, i).map((x, k) => ({ x, k })).filter(({ x }) => x.type === 'single' || x.type === 'multi');
  const srcIndex = q.showIf ? qs.findIndex(x => x.id === q.showIf!.questionId) : -1;
  const src = srcIndex >= 0 ? qs[srcIndex] : undefined;
  if (!sources.length && !q.showIf) return null;
  return <div className="rw-showif">
    <label>Show <select value={q.showIf?.questionId ?? ''} aria-label="Show this question" onChange={e => { const id = e.target.value; const s = qs.find(x => x.id === id); setQ(i, { showIf: id && s ? { questionId: id, anyOf: (s.options ?? []).slice(0, 1) } : undefined }); }}>
      <option value="">to everyone</option>
      {sources.map(({ x, k }) => <option key={x.id} value={x.id}>only if Q{k + 1} is…</option>)}
      {src && srcIndex >= i && <option value={src.id}>only if Q{srcIndex + 1} is… (move it above)</option>}
    </select></label>
    {src && <div className="rw-chips">{(src.options ?? []).map(o => { const on = q.showIf!.anyOf.includes(o); return <button key={o} type="button" aria-pressed={on} className={on ? 'is-on' : ''} onClick={() => setQ(i, { showIf: { ...q.showIf!, anyOf: on ? q.showIf!.anyOf.filter(x => x !== o) : [...q.showIf!.anyOf, o] } })}>{o}</button>; })}</div>}
    {src && srcIndex > i && <small className="rw-note is-warn">Q{srcIndex + 1} comes after this question, so it will never show. Move this one below it.</small>}
    {src && !q.showIf!.anyOf.length && <small className="rw-note is-warn">Pick at least one answer, or this always shows.</small>}
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
  const [picks, setPicks] = useState<Record<string, string>>({}); // group filter: question id → option
  const s = data?.study ?? study; const all = data?.responses ?? [];
  const responses = useMemo(() => filterByGroups(all, picks), [data, picks]);
  const results = useMemo(() => aggregate(s, responses), [data, picks]);
  const sus = useMemo(() => susScore(s, responses), [data, picks]);
  const nps = results.find((r): r is Extract<QuestionResult, { kind: 'nps' }> => r.kind === 'nps');
  const medianSec = responses.length ? Math.round([...responses].sort((a, b) => a.ms - b.ms)[Math.floor(responses.length / 2)].ms / 1000) : 0;
  // Open answers with their AI follow-ups, one entry per participant.
  const entries = (qid: string) => responses.filter(rs => { const v = rs.answers[qid]; return v != null && v !== '' && typeof v !== 'object'; }).map(rs => ({ key: `${qid}-${rs.id}`, text: String(rs.answers[qid]), name: participantName(s, rs), who: groupLabel(s, rs), fu: (rs.followups?.[qid] ?? []).map((f, j) => ({ key: `${qid}-${rs.id}-f${j}`, q: f.q, text: f.a })) }));
  const quotes = results.flatMap(r => r.kind === 'text' && r.q.preset !== 'name' ? entries(r.q.id).flatMap(e => [{ key: e.key, text: e.text, who: e.who }, ...e.fu.map(f => ({ key: f.key, text: f.text, who: e.who }))]) : []);

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
    const sec = { ...createSection('quotes'), title: 'In their words', eyebrow: 'Discover', items: chosen.map((q, i) => ({ title: q.who || `Participant ${String(i + 1).padStart(2, '0')}`, detail: q.text })) }; // groups, never names
    onAddSections([sec], `Added ${chosen.length} quote${chosen.length === 1 ? '' : 's'}.`);
  };

  if (error) return <div className="rw-card"><p className="csb-field-note is-error">{error}</p><button type="button" className="csb-quiet-button" onClick={load}>Try again</button></div>;
  if (!data) return <p className="rw-empty">Loading results…</p>;
  return <div className="rw-results">
    <div className="rw-stats">
      <div><strong>{responses.length}</strong><small>Responses</small></div>
      {s.questions.some(q => q.bonus) && <div><strong>{responses.filter(r => r.part !== 'core').length}</strong><small>Did the bonus round</small></div>}
      <div><strong>{medianSec ? `${Math.floor(medianSec / 60)}:${String(medianSec % 60).padStart(2, '0')}` : '—'}</strong><small>Median time</small></div>
      {sus && <div><strong>{sus.n ? Math.round(sus.score) : '—'}</strong><small>SUS {sus.grade && `· ${sus.grade}`}</small></div>}
      {nps && <div><strong>{nps.answered ? `${nps.score > 0 ? '+' : ''}${nps.score}` : '—'}</strong><small>NPS</small></div>}
      <button type="button" className="csb-quiet-button" onClick={load}>Refresh</button>
    </div>
    <Groups study={s} all={all} picks={picks} setPicks={setPicks} />
    {!responses.length ? <p className="rw-empty">{all.length ? 'No one in this group yet.' : 'No responses yet. Share the link from the Share tab.'}</p> : <>
      <div className="rw-addrow">
        <span>Add to the case study:</span>
        <button type="button" className="csb-quiet-button" onClick={addCharts}>Charts</button>
        <button type="button" className="csb-quiet-button" onClick={addScores}>Scores</button>
        <button type="button" className="csb-quiet-button" disabled={!Object.values(picked).some(Boolean)} onClick={addQuotes}>Selected quotes</button>
      </div>
      <Synthesis study={s} responses={responses} onAddSections={onAddSections} filterNote={Object.values(picks).join(' + ')} />
      <FollowUps study={s} responses={responses} />
      {results.filter(r => !r.q.preset?.startsWith('sus-') && r.kind !== 'contact' && r.kind !== 'note' && r.q.preset !== 'name').map(r => <div key={r.q.id} className="rw-res">
        <h4>{r.q.prompt}<small>{r.answered} answered</small></h4>
        {r.kind === 'choice' && <div className="rw-bars">{r.options.map(o => { const pct = r.answered ? Math.round(o.count / r.answered * 100) : 0; return <div key={o.label}><span>{o.label}</span><i><b style={{ width: `${pct}%` }} /></i><em>{pct}%</em></div>; })}{r.q.type === 'multi' && <small>Choose-all question: percentages add up to more than 100%.</small>}</div>}
        {r.kind === 'scale' && <div className="rw-bars">{r.dist.map((c, k) => { const pct = r.answered ? Math.round(c / r.answered * 100) : 0; return <div key={k}><span>{(r.q.min ?? 1) + k}</span><i><b style={{ width: `${pct}%` }} /></i><em>{pct}%</em></div>; })}<small>Average {r.mean.toFixed(1)} of {r.q.max ?? 5}</small></div>}
        {r.kind === 'choice' && (() => { const typed = new Map<string, { label: string; n: number }>(); for (const rs of responses) { const t = rs.others?.[r.q.id]?.trim(); if (t) { const k = t.toLowerCase(); typed.set(k, { label: typed.get(k)?.label ?? t, n: (typed.get(k)?.n ?? 0) + 1 }); } } return typed.size > 0 && <div className="rw-others">Typed for Other: {[...typed.values()].sort((a, b) => b.n - a.n).map(x => <span key={x.label}>{x.label}<b>{x.n}</b></span>)}</div>; })()}
        {r.kind === 'rank' && (() => { const typed = [...new Set(responses.map(rs => rs.others?.[r.q.id]?.trim()).filter(Boolean))]; return typed.length > 0 && <div className="rw-others">Typed for Other: {typed.map(t => <span key={t}>{t}</span>)}</div>; })()}
        {r.kind === 'rank' && <div className="rw-rank-res">{r.items.map((it, k) => <div key={it.label}><b>{k + 1}</b><span>{it.label}</span><em>avg {it.avg ? it.avg.toFixed(1) : '—'} · #1 for {it.firsts}</em></div>)}<small className="rw-note">Ordered by average position (1 = best). Each person saw the options shuffled.</small></div>}
        {r.kind === 'photo' && <div className="rw-results-photos">{responses.flatMap(rs => (rs.photoUrls?.[r.q.id] ?? []).map((u, k) => <a key={`${rs.id}-${k}`} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Participant photo" loading="lazy" /></a>))}{!r.answered && <p className="rw-empty">No photos yet.</p>}</div>}
        {r.kind === 'schedule' && <div className="rw-nps"><strong>{r.booked}</strong><span>booked a time{r.answered > r.booked ? ` · ${r.answered - r.booked} opened the link but didn’t finish in the survey` : ''}</span></div>}
        {r.kind === 'nps' && <div className="rw-nps"><strong>{r.score > 0 ? '+' : ''}{r.score}</strong><span>{r.promoters} promoters · {r.passives} passives · {r.detractors} detractors</span></div>}
        {r.kind === 'text' && <ul className="rw-quotes">{entries(r.q.id).map(e => <li key={e.key}><label><input type="checkbox" checked={!!picked[e.key]} onChange={ev => setPicked(p => ({ ...p, [e.key]: ev.target.checked }))} /> “{e.text}”</label>{(e.name || e.who) && <span className="rw-who">{[e.name, e.who].filter(Boolean).join(' · ')}</span>}
          {e.fu.length > 0 && <ul className="rw-fu-list">{e.fu.map(f => <li key={f.key}><small>AI follow-up: {f.q}</small><label><input type="checkbox" checked={!!picked[f.key]} onChange={ev => setPicked(p => ({ ...p, [f.key]: ev.target.checked }))} /> “{f.text}”</label></li>)}</ul>}</li>)}</ul>}
      </div>)}
      {sus && <div className="rw-res"><h4>System Usability Scale<small>{sus.n} complete</small></h4><div className="rw-nps"><strong>{Math.round(sus.score)}</strong><span>{sus.grade}. The average product scores 68.</span></div></div>}
    </>}
  </div>;
}

/* People who left contact details: private, never added to a case study. */
function FollowUps({ study, responses }: { study: Study; responses: Response[] }) {
  const [copied, setCopied] = useState(false);
  const contactQs = study.questions.filter(q => q.type === 'contact');
  if (!contactQs.length) return null;
  const scheduleQ = study.questions.find(q => q.type === 'schedule');
  const interestQ = study.questions.find(q => q.preset === 'recruit') ?? study.questions.find(q => q.id === contactQs[0].showIf?.questionId);
  const rows = responses.map(r => {
    const c = contactQs.map(q => r.answers[q.id]).find(v => v && typeof v === 'object' && !Array.isArray(v)) as Partial<Record<ContactKey, string>> | undefined;
    return c && Object.values(c).some(Boolean) ? { id: r.id, at: r.at, c, interest: interestQ ? String(r.answers[interestQ.id] ?? '') : '', booked: scheduleQ ? r.answers[scheduleQ.id] === BOOKED : false } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  const emails = rows.map(r => r.c.email).filter(Boolean).join(', ');
  const phone = contactQs.some(q => contactModes(q).phone !== 'off') || rows.some(r => r.c.phone);
  return <div className="rw-res rw-followups">
    <h4>People to follow up with<small>{rows.length} left contact info · private</small></h4>
    {!rows.length ? <p className="rw-empty">No one has left contact details yet.</p> : <>
      <div className="rw-table" role="table">
        <div role="row" className="is-head"><span role="columnheader">Name</span><span role="columnheader">Email</span>{phone && <span role="columnheader">Phone</span>}{interestQ && <span role="columnheader">Interested</span>}{scheduleQ && <span role="columnheader">Booked</span>}</div>
        {rows.map(r => <div role="row" key={r.id}><span role="cell">{r.c.name || '—'}</span><span role="cell">{r.c.email ? <a href={`mailto:${r.c.email}`}>{r.c.email}</a> : '—'}</span>{phone && <span role="cell">{r.c.phone || '—'}</span>}{interestQ && <span role="cell">{r.interest.split(',')[0] || '—'}</span>}{scheduleQ && <span role="cell">{r.booked ? '✓' : '—'}</span>}</div>)}
      </div>
      {emails && <div className="rw-row"><button type="button" className="csb-quiet-button" onClick={() => { void navigator.clipboard?.writeText(emails); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy size={13} /> {copied ? 'Copied' : 'Copy all emails'}</button></div>}
    </>}
  </div>;
}

/* ---------- Find themes with AI: synthesis the way a researcher would do it ---------- */
type Pain = { pain: string; people: number; frequency: number; intensity: number; spending: number; score: number; cost?: string; quote?: string; participant?: string };
type Synth = { summary: string; themes: Array<{ title: string; detail: string; count: number; segments?: string; quotes: Array<{ text: string; participant: string }> }>; forces?: Partial<Record<'push' | 'pull' | 'anxiety' | 'habit', Array<{ point: string; count: number; quote?: string }>>>; surprises?: string[]; pains?: Pain[]; lowEffort?: Array<{ participant: string; reason: string }>; nextQuestions?: string[]; note?: string };
const FORCE_LABEL = { push: ['Push', 'What’s wrong with how things are now'], pull: ['Pull', 'What they hope a change gets them'], anxiety: ['Anxiety', 'What worries them about changing'], habit: ['Habit', 'What keeps them doing it the old way'] } as const;
function Synthesis({ study, responses, onAddSections, filterNote }: { study: Study; responses: Response[]; onAddSections: (s: CaseStudySection[], note: string) => void; filterNote?: string }) {
  const key = `csb-synth-${study.id}${filterNote ? `-${filterNote}` : ''}`;
  const [synth, setSynth] = useState<Synth | null>(() => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = study.questions.filter(q => ['long', 'text', 'single', 'multi', 'rank', 'scale'].includes(q.type) && q.preset !== 'name'); // names never go to the AI
  if (responses.length < 2 || !open.some(q => q.type === 'long' || q.type === 'text' || q.followups)) return null;
  const run = async () => {
    setBusy(true); setError('');
    try {
      const qList = open.map((q, i) => ({ n: i + 1, type: q.type, prompt: q.prompt, options: q.options }));
      const people = responses.map((r, k) => ({ p: `P${k + 1}`, answers: Object.fromEntries(open.map((q, i) => [i + 1, answerWords(r.answers[q.id], q, r.others?.[q.id])]).filter(([, a]) => a)), followups: Object.fromEntries(open.map((q, i) => [i + 1, r.followups?.[q.id] ?? []]).filter(([, f]) => (f as unknown[]).length)) }));
      const res = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Studio-Passcode': getPasscode() }, body: JSON.stringify({ task: 'synthesize', title: study.title + (filterNote ? ` (only: ${filterNote})` : ''), goal: study.goal, questions: qList, people, groupBy: open.map((q, i) => q.group ? i + 1 : 0).filter(Boolean) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.themes)) throw new Error(res.status === 401 ? 'Enter your Studio passcode on the Share tab first.' : /Notion research link|Figma design link/.test(data.error || '') ? 'Finding themes needs the latest studio-ai-draft function deployed.' : data.error || 'Could not find themes. Try again.');
      setSynth(data); try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };
  const addThemes = () => { if (!synth) return; const sec = { ...createSection('findings'), title: 'What kept coming up', eyebrow: 'Discover', items: synth.themes.slice(0, 6).map(t => ({ title: t.title, detail: `${t.detail}${t.count ? ` (${t.count} of ${responses.length} people)` : ''}` })) }; onAddSections([sec], `Added ${Math.min(6, synth.themes.length)} themes from “${study.title}”.`); };
  const addPains = () => { if (!synth?.pains?.length) return; const sec = { ...createSection('findings'), title: 'The pains worth solving', eyebrow: 'Discover', items: synth.pains.slice(0, 5).map(p => ({ title: `${p.pain} (${p.score.toFixed(1)}/10)`, detail: `How often ${p.frequency}/10 · how much it hurts ${p.intensity}/10 · already paying to fix ${p.spending}/10. ${p.people} of ${responses.length} people.${p.cost ? ` Cost: ${p.cost}.` : ''}` })) }; onAddSections([sec], `Added the top ${Math.min(5, synth.pains.length)} pains.`); };
  const addQuotes = () => { if (!synth) return; const qs = synth.themes.flatMap(t => t.quotes.slice(0, 1)).slice(0, 6); const sec = { ...createSection('quotes'), title: 'In their words', eyebrow: 'Discover', items: qs.map(q => ({ title: q.participant, detail: q.text })) }; onAddSections([sec], `Added ${qs.length} quotes.`); };
  return <div className="rw-synth">
    <h4><Sparkles size={14} /> Themes {synth ? <small className="rw-note">from {responses.length} responses{filterNote ? ` · ${filterNote}` : ''}</small> : filterNote ? <small className="rw-note">for {filterNote}</small> : ''}</h4>
    {!synth && <p>Reads every answer and follow-up, groups what people did and said into themes with counts, scores each pain (how often, how much it hurts, already paying to fix), maps the four forces behind changing a habit, and flags low-effort responses.</p>}
    <div className="rw-row"><button type="button" className={synth ? 'csb-quiet-button' : 'csb-primary-button'} disabled={busy} onClick={() => void run()}>{busy ? 'Reading every answer…' : synth ? 'Run again' : 'Find themes with AI'}</button>
      {synth && <><button type="button" className="csb-quiet-button" onClick={addThemes}>Add themes to case study</button><button type="button" className="csb-quiet-button" onClick={addQuotes}>Add quotes</button>{!!synth.pains?.length && <button type="button" className="csb-quiet-button" onClick={addPains}>Add pain scores</button>}</>}</div>
    {error && <p className="csb-field-note is-error" role="alert">{error}</p>}
    {synth && <>
      {synth.note && <small className="rw-note is-warn">{synth.note}</small>}
      <p>{synth.summary}</p>
      {synth.themes.length > 0 && <h5>Themes</h5>}
      {synth.themes.map((t, k) => <div key={k} className="rw-theme"><strong>{t.title}</strong><span className="rw-count">{t.count} of {responses.length} people{t.segments ? ` · ${t.segments}` : ''}</span><p>{t.detail}</p>{t.quotes.slice(0, 2).map((q, j) => <blockquote key={j}>“{q.text}” <em>— {q.participant}</em></blockquote>)}</div>)}
      {synth.forces && Object.values(synth.forces).some(f => f?.length) && <><h5>What drives change (four forces)</h5><div className="rw-forces">{(Object.keys(FORCE_LABEL) as Array<keyof typeof FORCE_LABEL>).map(f => <div key={f} className="rw-force"><b>{FORCE_LABEL[f][0]}</b><small>{FORCE_LABEL[f][1]}</small><ul>{(synth.forces?.[f] ?? []).map((x, j) => <li key={j}>{x.point}{x.count ? ` (${x.count})` : ''}</li>)}</ul></div>)}</div></>}
      {!!synth.pains?.length && <><h5>Pain scores</h5><p className="rw-note" style={{ margin: 0 }}>Each pain scored 1–10 from what people said and did: how often it happens, how much it hurts, and whether they already spend money or effort to fix it. The best pains to build for score high on all three.</p>
        <div className="rw-pains">{synth.pains.map((x, k) => <div key={k} className="rw-pain"><div className="rw-pain-head"><strong>{x.pain}</strong><b className={x.score >= 7 ? 'is-hot' : x.score >= 5 ? 'is-warm' : ''}>{x.score.toFixed(1)}</b></div>
          <div className="rw-pain-bars">{([['How often', x.frequency], ['How much it hurts', x.intensity], ['Already paying to fix', x.spending]] as Array<[string, number]>).map(([l, v]) => <div key={l}><span>{l}</span><i><em style={{ width: `${v * 10}%` }} /></i><small>{v}</small></div>)}</div>
          <span className="rw-count">{x.people} of {responses.length} people{x.cost ? ` · cost: ${x.cost}` : ''}</span>
          {x.quote && <blockquote>“{x.quote}”{x.participant ? <em> — {x.participant}</em> : null}</blockquote>}</div>)}</div></>}
      {!!synth.surprises?.length && <><h5>Surprises and contradictions</h5><ul className="rw-flags" style={{ color: 'inherit' }}>{synth.surprises.map((x, j) => <li key={j}>{x}</li>)}</ul></>}
      {!!synth.nextQuestions?.length && <><h5>Worth asking next round</h5><ul className="rw-flags" style={{ color: 'inherit' }}>{synth.nextQuestions.map((x, j) => <li key={j}>{x}</li>)}</ul></>}
      {!!synth.lowEffort?.length && <><h5>Low-effort responses</h5><ul className="rw-flags">{synth.lowEffort.map((x, j) => <li key={j}>{x.participant}: {x.reason}</li>)}</ul></>}
    </>}
  </div>;
}

/* ---------- Groups: the buckets people sorted themselves into. Click to filter everything; compare two groupings. ---------- */
function Groups({ study, all, picks, setPicks }: { study: Study; all: Response[]; picks: Record<string, string>; setPicks: (p: Record<string, string>) => void }) {
  const gqs = groupQuestions(study);
  const nonAge = gqs.filter(q => !AGE_RANGES.some(a => q.options?.includes(a)));
  const [rowQ, setRowQ] = useState(nonAge[0]?.id ?? gqs[0]?.id ?? '');
  const [colQ, setColQ] = useState(nonAge[1]?.id ?? gqs.find(q => q.id !== (nonAge[0]?.id ?? gqs[0]?.id))?.id ?? '');
  if (!gqs.length || !all.length) return null;
  const toggle = (qid: string, opt: string) => { const next = { ...picks }; if (next[qid] === opt) delete next[qid]; else next[qid] = opt; setPicks(next); };
  const short = (p: string) => p.replace(/\?$/, '').replace(/^(what’s|what's|what is|how often do you|which of these describe you right now)\s*/i, '').replace(/^your\s+/i, '') || (/describe/i.test(p) ? 'describes them' : p);
  const R = gqs.find(q => q.id === rowQ), C = gqs.find(q => q.id === colQ && q.id !== rowQ);
  const filtered = filterByGroups(all, picks).length;
  return <div className="rw-res rw-groups">
    <h4>Groups<small>{Object.keys(picks).length ? `Showing ${filtered} of ${all.length} · ` : `${all.length} people · click a group to filter everything below`}{Object.keys(picks).length > 0 && <button type="button" className="rw-linkbtn" onClick={() => setPicks({})}>Show everyone</button>}</small></h4>
    {gqs.map(q => <div key={q.id} className="rw-group-row"><span>{short(q.prompt)}</span><div className="rw-chips">{(q.options ?? []).map(o => { const n = bucketCount(all, q.id, o); const on = picks[q.id] === o; return <button key={o} type="button" aria-pressed={on} className={on ? 'is-on' : ''} disabled={!n && !on} onClick={() => toggle(q.id, o)}>{o} <b>{n}</b></button>; })}</div></div>)}
    {gqs.length > 1 && R && <div className="rw-compare">
      <div className="rw-compare-head">Compare <select value={rowQ} onChange={e => setRowQ(e.target.value)} aria-label="Rows">{gqs.map(q => <option key={q.id} value={q.id}>{short(q.prompt)}</option>)}</select> by <select value={colQ} onChange={e => setColQ(e.target.value)} aria-label="Columns">{gqs.filter(q => q.id !== rowQ).map(q => <option key={q.id} value={q.id}>{short(q.prompt)}</option>)}</select></div>
      {C && <div className="rw-xtab" role="table" style={{ gridTemplateColumns: `minmax(110px,1.2fr) repeat(${(C.options ?? []).length}, minmax(64px,1fr))` }}>
        <span role="columnheader" />{(C.options ?? []).map(o => <span key={o} role="columnheader">{o}</span>)}
        {(R.options ?? []).map(ro => { const rowAll = all.filter(r => { const v = r.answers[R.id]; return Array.isArray(v) ? v.includes(ro) : v === ro; }); return <Fragment key={ro}>
          <span role="rowheader">{ro} <em>{rowAll.length}</em></span>
          {(C.options ?? []).map(co => { const n = bucketCount(rowAll, C.id, co); const pct = rowAll.length ? n / rowAll.length : 0; return <button key={co} type="button" role="cell" className="rw-xcell" style={{ ['--a' as string]: String(Math.max(0.06, pct)) }} disabled={!n} title={`${n} of ${rowAll.length} who said “${ro}” also said “${co}”. Click to see them.`} onClick={() => setPicks({ [R.id]: ro, [C.id]: co })}>{n || '·'}</button>; })}
        </Fragment>; })}
      </div>}
      {C && <small className="rw-note">Each cell: how many people are in both groups. Darker = a bigger share of that row. Click a cell to see just those people. People can be in more than one group when the question allows several answers.</small>}
    </div>}
  </div>;
}
