import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BOOKED, OPENED, onColor, bookingUrl, call, contactErrors, contactModes, CONTACT_FIELDS, isCalendly, isShown, type ContactKey, type Question, type Study } from './research';
import './research.css';

const hasValue = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v as object).some(x => String(x ?? '').trim()));

/* One question per screen. Used by the participant link and the builder's live preview.
   Questions with "Show only if" are skipped when the earlier answer doesn't match (the preview shows every question). */
export function SurveyRunner({ study, preview, onSubmit, startAt }: { study: Study; preview?: boolean; onSubmit?: (answers: Record<string, unknown>, ms: number) => Promise<void>; startAt?: number }) {
  const [step, setStep] = useState(startAt ?? -1); // -1 intro, 0..n-1 questions, n thanks
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const started = useRef(Date.now());
  useEffect(() => { if (startAt !== undefined) setStep(startAt); }, [startAt]);
  const qs = preview ? study.questions : study.questions.filter(q => isShown(q, answers));
  const n = qs.length;
  const q = step >= 0 && step < n ? qs[step] : null;
  const value = q ? answers[q.id] : undefined;
  const answered = !!q && hasValue(value);
  const fieldErrors = q?.type === 'contact' ? contactErrors(q, value) : {};
  const contactOk = !Object.keys(fieldErrors).length;
  const canNext = !q || (q.type === 'contact' ? (contactOk || (!q.required && !answered)) : (!q.required || answered));
  const set = (v: unknown) => q && setAnswers(a => ({ ...a, [q.id]: v }));
  const contact = study.questions.filter(x => x.type === 'contact').map(x => answers[x.id]).find(hasValue) as Partial<Record<ContactKey, string>> | undefined;
  const go = (s: number) => { setTouched(false); setStep(s); };
  const next = async () => {
    if (!canNext) { setTouched(true); return; }
    if (busy) return;
    if (step === n - 1) {
      setBusy(true); setError('');
      // Only send answers to questions the participant actually saw.
      const shown = new Set(qs.map(x => x.id));
      try { await onSubmit?.(Object.fromEntries(Object.entries(answers).filter(([k]) => shown.has(k))), Date.now() - started.current); go(n); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not send your answers. Please try again.'); }
      finally { setBusy(false); }
    } else { if (step === -1) started.current = Date.now(); go(step + 1); }
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') { e.preventDefault(); void next(); } };
  const condition = preview && q?.showIf?.anyOf?.length ? (() => { const i = study.questions.findIndex(x => x.id === q.showIf!.questionId); return i >= 0 ? `Only shown if Q${i + 1} is ${q.showIf!.anyOf.map(o => `“${o}”`).join(' or ')}` : ''; })() : '';

  const t = study.theme ?? {};
  const themeStyle = { ...(t.accent ? { '--rs-accent': t.accent, '--rs-on': onColor(t.accent) } : {}), ...(t.background ? { '--rs-bg': t.background } : {}) } as React.CSSProperties;
  return <div className={`rs ${preview ? 'is-preview' : ''}`} style={themeStyle} onKeyDown={onKey}>
    {step >= 0 && step < n && <div className="rs-progress" aria-hidden="true"><i style={{ width: `${((step + (answered ? 1 : 0)) / n) * 100}%` }} /></div>}
    <AnimatePresence mode="wait">
      <motion.div key={step} className="rs-screen" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}>
        {step === -1 && <div className="rs-intro">
          {t.cover && <img className="rs-cover" src={t.cover} alt="" />}
          <h1>{study.title}</h1>
          {study.intro && <p>{study.intro}</p>}
          <button type="button" className="rs-primary" onClick={() => void next()} disabled={!n}>Start</button>
          <small>{n} question{n === 1 ? '' : 's'} · about {Math.max(1, Math.round(n * 0.3))} min</small>
        </div>}
        {q && <>{condition && <p className="rs-condition">{condition}</p>}<QuestionView q={q} index={step} total={n} value={value} set={set} errors={touched ? fieldErrors : {}} contact={contact} preview={preview} /></>}
        {step === n && <div className="rs-intro rs-thanks"><span className="rs-check" aria-hidden="true">✓</span><h1>{study.thanks || 'Thank you.'}</h1><p>You can close this page now.</p></div>}
      </motion.div>
    </AnimatePresence>
    {q && <div className="rs-nav">
      <button type="button" className="rs-ghost" onClick={() => go(Math.max(-1, step - 1))}>Back</button>
      <div className="rs-nav-right">
        {error && <span className="rs-error" role="alert">{error}</span>}
        {!q.required && !answered && step < n - 1 && <button type="button" className="rs-ghost" onClick={() => go(step + 1)}>{q.type === 'schedule' ? 'Not now' : 'Skip'}</button>}
        <button type="button" className="rs-primary" disabled={busy || (!canNext && q.type !== 'contact')} onClick={() => void next()}>{busy ? 'Sending…' : step === n - 1 ? 'Submit' : 'Next'}</button>
      </div>
    </div>}
  </div>;
}

function QuestionView({ q, index, total, value, set, errors, contact, preview }: { q: Question; index: number; total: number; value: unknown; set: (v: unknown) => void; errors: Partial<Record<ContactKey, string>>; contact?: Partial<Record<ContactKey, string>>; preview?: boolean }) {
  const list = Array.isArray(value) ? value as string[] : [];
  return <div className="rs-q">
    <small className="rs-count">{index + 1} / {total}{q.required ? '' : ' · optional'}</small>
    {q.image && <img className="rs-qimg" src={q.image} alt="" />}
    <h2>{q.prompt}</h2>
    {q.type === 'multi' && <p className="rs-hint">Choose all that apply</p>}
    {(q.type === 'single' || q.type === 'multi') && (() => { const pics = (q.optionImages ?? []).some(Boolean); return <div className={`rs-options ${pics ? 'has-images' : ''}`} role={q.type === 'single' ? 'radiogroup' : 'group'} aria-label={q.prompt}>
      {(q.options ?? []).map((o, i) => { const on = q.type === 'single' ? value === o : list.includes(o); const mark = <span className={`rs-mark ${q.type === 'multi' ? 'is-box' : ''}`} aria-hidden="true" />; const img = q.optionImages?.[i]; return <button key={i} type="button" role={q.type === 'single' ? 'radio' : 'checkbox'} aria-checked={on} className={`rs-option ${on ? 'is-on' : ''} ${pics ? 'is-card' : ''}`}
        onClick={() => set(q.type === 'single' ? o : on ? list.filter(x => x !== o) : [...list, o])}>{pics ? <>{img ? <img src={img} alt="" /> : <span className="rs-card-ph" aria-hidden="true" />}<span className="rs-card-label">{mark}{o}</span></> : <>{mark}{o}</>}</button>; })}
    </div>; })()}
    {(q.type === 'scale' || q.type === 'nps') && (() => { const lo = q.type === 'nps' ? 0 : q.min ?? 1, hi = q.type === 'nps' ? 10 : q.max ?? 5; return <div className={`rs-scale ${q.type === 'nps' ? 'is-nps' : ''}`}>
      <div className="rs-scale-row" role="radiogroup" aria-label={q.prompt}>{Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map(v => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => set(v)}>{v}</button>)}</div>
      <div className="rs-scale-labels"><span>{q.type === 'nps' ? 'Not at all likely' : q.minLabel}</span><span>{q.type === 'nps' ? 'Extremely likely' : q.maxLabel}</span></div>
    </div>; })()}
    {q.type === 'text' && <input className="rs-input" autoFocus value={String(value ?? '')} onChange={e => set(e.target.value)} placeholder="Type your answer" aria-label={q.prompt} />}
    {q.type === 'long' && <LongAnswer label={q.prompt} value={String(value ?? '')} set={set} />}
    {q.type === 'contact' && <ContactFields q={q} value={value} set={set} errors={errors} />}
    {q.type === 'schedule' && <Booking q={q} value={value} set={set} contact={contact} preview={preview} />}
  </div>;
}

/* ---------- Long answer, with a mic for speaking instead of typing ---------- */
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SpeechAPI = (): (new () => Recognition) | undefined => typeof window === 'undefined' ? undefined : ((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Recognition) | undefined;

function LongAnswer({ label, value, set }: { label: string; value: string; set: (v: string) => void }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [micError, setMicError] = useState('');
  const rec = useRef<Recognition | null>(null);
  const base = useRef(value);
  const latest = useRef(value); latest.current = value;
  const supported = !!SpeechAPI();
  useEffect(() => () => rec.current?.stop(), []);
  const toggle = () => {
    if (listening) { rec.current?.stop(); return; }
    const API = SpeechAPI(); if (!API) return;
    const r = new API(); rec.current = r;
    r.lang = navigator.language || 'en-US'; r.continuous = true; r.interimResults = true;
    base.current = latest.current;
    r.onresult = e => {
      let finalText = '', live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else live += t; }
      if (finalText) { const joined = `${base.current}${base.current && !/\s$/.test(base.current) ? ' ' : ''}${finalText.trim()}`; base.current = joined; set(joined); }
      setInterim(live);
    };
    r.onerror = e => setMicError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access was blocked. You can still type.' : e.error === 'no-speech' ? '' : 'Dictation stopped. Tap the mic to keep going.');
    r.onend = () => { setListening(false); setInterim(''); };
    setMicError(''); setListening(true);
    try { r.start(); } catch { setListening(false); }
  };
  return <div className="rs-long">
    <textarea className="rs-input" rows={5} autoFocus={!supported} value={value + (interim ? `${value && !/\s$/.test(value) ? ' ' : ''}${interim}` : '')} onChange={e => { if (!listening) set(e.target.value); }} readOnly={listening} placeholder={supported ? 'Type, or tap the mic and talk' : 'Type your answer'} aria-label={label} />
    {supported && <div className="rs-dictate">
      <button type="button" className={`rs-mic ${listening ? 'is-on' : ''}`} onClick={toggle} aria-pressed={listening}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></svg>
        {listening ? 'Listening… tap to stop' : 'Tap to talk'}
      </button>
      <span>{micError || (listening ? 'Say as much as you like. You can edit after.' : 'Talking is often easier than typing.')}</span>
    </div>}
  </div>;
}

/* ---------- Contact info ---------- */
function ContactFields({ q, value, set, errors }: { q: Question; value: unknown; set: (v: unknown) => void; errors: Partial<Record<ContactKey, string>> }) {
  const v = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Partial<Record<ContactKey, string>>;
  const modes = contactModes(q);
  const shown = CONTACT_FIELDS.filter(([k]) => modes[k] !== 'off');
  const meta: Record<ContactKey, { type: string; auto: string; mode?: 'email' | 'tel'; ph: string }> = { name: { type: 'text', auto: 'name', ph: 'Your name' }, email: { type: 'email', auto: 'email', mode: 'email', ph: 'you@example.com' }, phone: { type: 'tel', auto: 'tel', mode: 'tel', ph: '(555) 123-4567' } };
  return <div className="rs-contact">
    {shown.map(([k, label], i) => <label key={k} className={`rs-field ${errors[k] ? 'has-error' : ''}`}>
      <span>{label}{modes[k] === 'optional' ? <em> · optional</em> : ''}</span>
      <input className="rs-input" type={meta[k].type} inputMode={meta[k].mode} autoComplete={meta[k].auto} autoFocus={i === 0} placeholder={meta[k].ph} value={v[k] ?? ''} onChange={e => set({ ...v, [k]: e.target.value })} aria-invalid={!!errors[k]} />
      {errors[k] && <small role="alert">{errors[k]}</small>}
    </label>)}
    <p className="rs-hint rs-privacy">Only the researcher sees this. It’s kept separate from your answers.</p>
  </div>;
}

/* ---------- Book a time (Calendly inline, or any booking link) ---------- */
function Booking({ q, value, set, contact, preview }: { q: Question; value: unknown; set: (v: unknown) => void; contact?: Partial<Record<ContactKey, string>>; preview?: boolean }) {
  const url = (q.url ?? '').trim();
  const embed = isCalendly(url) && !preview;
  useEffect(() => {
    if (!embed) return;
    const on = (e: MessageEvent) => { if (/^https:\/\/([a-z0-9-]+\.)*calendly\.com$/.test(e.origin) && (e.data as { event?: string })?.event === 'calendly.event_scheduled') set(BOOKED); };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, [embed]);
  if (!url) return <p className="rs-hint">{preview ? 'Add your Calendly (or other booking) link in the builder.' : 'We’ll reach out to find a time.'}</p>;
  if (value === BOOKED) return <div className="rs-booked"><span className="rs-check" aria-hidden="true">✓</span><p>You’re booked. Check your email for the invite.</p></div>;
  return <div className="rs-booking">
    {embed && <iframe className="rs-calendly" title="Pick a time" src={bookingUrl(url, contact, true)} loading="lazy" />}
    {preview && isCalendly(url) && <div className="rs-calendly is-placeholder">Your Calendly calendar appears here</div>}
    <a className={embed ? 'rs-link' : 'rs-primary rs-book'} href={bookingUrl(url, contact)} target="_blank" rel="noreferrer" onClick={() => { if (value !== BOOKED) set(OPENED); }}>{embed ? 'Open the calendar in a new tab' : 'Pick a time'}</a>
  </div>;
}

/* The page participants open: #/r/<study id> */
export default function ParticipantPage({ id }: { id: string }) {
  const [study, setStudy] = useState<Study | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Research study'; call<{ study: Study }>('get', { id }).then(d => { setStudy(d.study); document.title = d.study.title; }, e => setError(e instanceof Error ? e.message : 'Could not open this study.')); }, [id]);
  return <main className={`rs-page ${study?.theme?.background ? 'has-theme' : ''}`} style={study?.theme?.background ? { '--rs-bg': study.theme.background } as React.CSSProperties : undefined}>
    {error ? <div className="rs-intro"><h1>Sorry</h1><p>{error}</p></div>
      : !study ? <div className="rs-loading">Loading…</div>
      : <SurveyRunner study={study} onSubmit={async (answers, ms) => { await call('submit', { id, answers, ms }); }} />}
  </main>;
}
