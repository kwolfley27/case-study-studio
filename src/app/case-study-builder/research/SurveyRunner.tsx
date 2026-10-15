import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { call, type Question, type Study } from './research';
import './research.css';

/* One question per screen. Used by the participant link and the builder's live preview. */
export function SurveyRunner({ study, preview, onSubmit, startAt }: { study: Study; preview?: boolean; onSubmit?: (answers: Record<string, unknown>, ms: number) => Promise<void>; startAt?: number }) {
  const [step, setStep] = useState(startAt ?? -1); // -1 intro, 0..n-1 questions, n thanks
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(Date.now());
  useEffect(() => { if (startAt !== undefined) setStep(startAt); }, [startAt]);
  const qs = study.questions; const n = qs.length;
  const q = step >= 0 && step < n ? qs[step] : null;
  const value = q ? answers[q.id] : undefined;
  const answered = !!q && value != null && value !== '' && !(Array.isArray(value) && !value.length);
  const canNext = !q || !q.required || answered;
  const set = (v: unknown) => q && setAnswers(a => ({ ...a, [q.id]: v }));
  const next = async () => {
    if (!canNext || busy) return;
    if (step === n - 1) {
      setBusy(true); setError('');
      try { await onSubmit?.(answers, Date.now() - started.current); setStep(n); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not send your answers. Please try again.'); }
      finally { setBusy(false); }
    } else { if (step === -1) started.current = Date.now(); setStep(s => s + 1); }
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') { e.preventDefault(); void next(); } };

  return <div className={`rs ${preview ? 'is-preview' : ''}`} onKeyDown={onKey}>
    {step >= 0 && step < n && <div className="rs-progress" aria-hidden="true"><i style={{ width: `${((step + (answered ? 1 : 0)) / n) * 100}%` }} /></div>}
    <AnimatePresence mode="wait">
      <motion.div key={step} className="rs-screen" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}>
        {step === -1 && <div className="rs-intro">
          <h1>{study.title}</h1>
          {study.intro && <p>{study.intro}</p>}
          <button type="button" className="rs-primary" onClick={() => void next()} disabled={!n}>Start</button>
          <small>{n} question{n === 1 ? '' : 's'} · about {Math.max(1, Math.round(n * 0.3))} min</small>
        </div>}
        {q && <QuestionView q={q} index={step} total={n} value={value} set={set} />}
        {step === n && <div className="rs-intro rs-thanks"><span className="rs-check" aria-hidden="true">✓</span><h1>{study.thanks || 'Thank you.'}</h1><p>You can close this page now.</p></div>}
      </motion.div>
    </AnimatePresence>
    {q && <div className="rs-nav">
      <button type="button" className="rs-ghost" onClick={() => setStep(s => Math.max(-1, s - 1))}>Back</button>
      <div className="rs-nav-right">
        {error && <span className="rs-error" role="alert">{error}</span>}
        {!q.required && !answered && step < n - 1 && <button type="button" className="rs-ghost" onClick={() => setStep(s => s + 1)}>Skip</button>}
        <button type="button" className="rs-primary" disabled={!canNext || busy} onClick={() => void next()}>{busy ? 'Sending…' : step === n - 1 ? 'Submit' : 'Next'}</button>
      </div>
    </div>}
  </div>;
}

function QuestionView({ q, index, total, value, set }: { q: Question; index: number; total: number; value: unknown; set: (v: unknown) => void }) {
  const list = Array.isArray(value) ? value as string[] : [];
  return <div className="rs-q">
    <small className="rs-count">{index + 1} / {total}{q.required ? '' : ' · optional'}</small>
    <h2>{q.prompt}</h2>
    {q.type === 'multi' && <p className="rs-hint">Choose all that apply</p>}
    {(q.type === 'single' || q.type === 'multi') && <div className="rs-options" role={q.type === 'single' ? 'radiogroup' : 'group'} aria-label={q.prompt}>
      {(q.options ?? []).map((o, i) => { const on = q.type === 'single' ? value === o : list.includes(o); return <button key={i} type="button" role={q.type === 'single' ? 'radio' : 'checkbox'} aria-checked={on} className={`rs-option ${on ? 'is-on' : ''}`}
        onClick={() => set(q.type === 'single' ? o : on ? list.filter(x => x !== o) : [...list, o])}><span className={`rs-mark ${q.type === 'multi' ? 'is-box' : ''}`} aria-hidden="true" />{o}</button>; })}
    </div>}
    {(q.type === 'scale' || q.type === 'nps') && (() => { const lo = q.type === 'nps' ? 0 : q.min ?? 1, hi = q.type === 'nps' ? 10 : q.max ?? 5; return <div className={`rs-scale ${q.type === 'nps' ? 'is-nps' : ''}`}>
      <div className="rs-scale-row" role="radiogroup" aria-label={q.prompt}>{Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map(v => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => set(v)}>{v}</button>)}</div>
      <div className="rs-scale-labels"><span>{q.type === 'nps' ? 'Not at all likely' : q.minLabel}</span><span>{q.type === 'nps' ? 'Extremely likely' : q.maxLabel}</span></div>
    </div>; })()}
    {q.type === 'text' && <input className="rs-input" autoFocus value={String(value ?? '')} onChange={e => set(e.target.value)} placeholder="Type your answer" aria-label={q.prompt} />}
    {q.type === 'long' && <textarea className="rs-input" rows={5} autoFocus value={String(value ?? '')} onChange={e => set(e.target.value)} placeholder="Type your answer" aria-label={q.prompt} />}
  </div>;
}

/* The page participants open: #/r/<study id> */
export default function ParticipantPage({ id }: { id: string }) {
  const [study, setStudy] = useState<Study | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Research study'; call<{ study: Study }>('get', { id }).then(d => { setStudy(d.study); document.title = d.study.title; }, e => setError(e instanceof Error ? e.message : 'Could not open this study.')); }, [id]);
  return <main className="rs-page">
    {error ? <div className="rs-intro"><h1>Sorry</h1><p>{error}</p></div>
      : !study ? <div className="rs-loading">Loading…</div>
      : <SurveyRunner study={study} onSubmit={async (answers, ms) => { await call('submit', { id, answers, ms }); }} />}
  </main>;
}
