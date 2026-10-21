import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BOOKED, OPENED, onColor, bookingUrl, call, contactErrors, contactModes, CONTACT_FIELDS, isCalendly, isShown, splitPrompt, canFollowUp, wantsFollowUp, estimateMinutes, answerWords, DEFAULT_FOLLOWUP_BUDGET, type ContactKey, type FollowUp, type Question, type Study } from './research';
import './research.css';

const hasValue = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v as object).some(x => String(x ?? '').trim()));

/* One question per screen. Used by the participant link and the builder's live preview.
   Questions with "Show only if" are skipped when the earlier answer doesn't match (the preview shows every question).
   Open questions with AI follow-ups: after an answer, onFollowUp may return a follow-up question, shown as its own screen. */
type AskFollowUp = (q: Question, answer: string, history: FollowUp[], context: FollowUp[], used: number) => Promise<string | null>;
type UploadPhoto = (q: Question, file: File) => Promise<string>;


export function SurveyRunner({ study, preview, onSubmit, onFollowUp, onUploadPhoto, startAt }: { study: Study; preview?: boolean; onSubmit?: (answers: Record<string, unknown>, ms: number, followups: Record<string, FollowUp[]>) => Promise<void>; onFollowUp?: AskFollowUp; onUploadPhoto?: UploadPhoto; startAt?: number }) {
  const [step, setStep] = useState(startAt ?? -1); // -1 intro, 0..n-1 questions, n thanks
  const [sub, setSub] = useState<number | null>(null); // which follow-up of the current question is showing
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fu, setFu] = useState<Record<string, FollowUp[]>>({});
  const [fuDone, setFuDone] = useState<Record<string, boolean>>({}); // the AI said there's nothing more to ask
  const [busy, setBusy] = useState<'' | 'thinking' | 'sending'>('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const started = useRef(Date.now());
  useEffect(() => { if (startAt !== undefined) { setStep(startAt); setSub(null); } }, [startAt]);
  const qs = preview ? study.questions : study.questions.filter(q => isShown(q, answers));
  const n = qs.length;
  const q = step >= 0 && step < n ? qs[step] : null;
  const value = q ? answers[q.id] : undefined;
  const answered = !!q && hasValue(value);
  const fuList = q ? fu[q.id] ?? [] : [];
  const fuItem = sub !== null ? fuList[sub] : undefined;
  const used = Object.values(fu).reduce((n, list) => n + list.length, 0);
  const budget = study.followupBudget ?? DEFAULT_FOLLOWUP_BUDGET;
  const maxFu = q && canFollowUp(q) && onFollowUp && wantsFollowUp(q, value) ? Math.min(3, q.followups ?? 0) : 0;
  const fieldErrors = q?.type === 'contact' ? contactErrors(q, value) : {};
  const contactOk = !Object.keys(fieldErrors).length;
  const rankDone = q?.type === 'rank' ? (Array.isArray(value) ? value.length : 0) >= (q.options?.length ?? 0) : true;
  const canNext = !q || !!fuItem || (q.type === 'contact' ? (contactOk || (!q.required && !answered)) : q.type === 'rank' ? (q.required ? rankDone : true) : (!q.required || answered));
  const set = (v: unknown) => { if (!q) return; setAnswers(a => ({ ...a, [q.id]: v })); if (fu[q.id]?.length) setFu(f => { const { [q.id]: _gone, ...rest } = f; return rest; }); setFuDone(d => ({ ...d, [q.id]: false })); };
  const setFuAnswer = (a: string) => { if (!q || sub === null) return; setFu(f => ({ ...f, [q.id]: (f[q.id] ?? []).map((x, i) => i === sub ? { ...x, a } : x) })); setFuDone(d => ({ ...d, [q.id]: false })); };
  const contact = study.questions.filter(x => x.type === 'contact').map(x => answers[x.id]).find(hasValue) as Partial<Record<ContactKey, string>> | undefined;
  const go = (s: number) => { setTouched(false); setSub(null); setStep(s); };
  const shownIds = () => new Set(qs.map(x => x.id));
  const advance = async () => {
    if (step === n - 1) {
      setBusy('sending'); setError('');
      // Only send answers to questions the participant actually saw.
      const shown = shownIds();
      const sentFu = Object.fromEntries(Object.entries(fu).filter(([k]) => shown.has(k)).map(([k, list]) => [k, list.filter(x => x.a.trim())]).filter(([, list]) => (list as FollowUp[]).length));
      try { await onSubmit?.(Object.fromEntries(Object.entries(answers).filter(([k]) => shown.has(k))), Date.now() - started.current, sentFu); go(n); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not send your answers. Please try again.'); }
      finally { setBusy(''); }
    } else { if (step === -1) started.current = Date.now(); go(step + 1); }
  };
  /** Ask the AI for the next follow-up; false when there isn't one. */
  const askMore = async (history: FollowUp[]) => {
    if (!q || !onFollowUp || history.length >= maxFu || fuDone[q.id] || used - (fu[q.id]?.length ?? 0) + history.length >= budget) return false;
    setBusy('thinking');
    try {
      const context = qs.slice(0, step).map(x => ({ q: x.prompt, a: answerWords(answers[x.id], x) })).filter(x => x.a);
      const question = await onFollowUp(q, answerWords(value, q), history, context, used - (fu[q.id]?.length ?? 0) + history.length);
      if (!question) { setFuDone(d => ({ ...d, [q.id]: true })); return false; }
      setFu(f => ({ ...f, [q.id]: [...history, { q: question, a: '' }] })); setSub(history.length); setTouched(false);
      return true;
    } catch { return false; } finally { setBusy(''); }
  };
  const next = async () => {
    if (!canNext) { setTouched(true); return; }
    if (busy) return;
    if (q && sub === null && maxFu && answered) {
      if (fuList.length) { setSub(0); return; }
      if (await askMore([])) return;
    } else if (q && sub !== null) {
      if (sub + 1 < fuList.length) { setSub(sub + 1); return; }
      if (fuItem?.a.trim() && await askMore(fuList)) return;
    }
    await advance();
  };
  const back = () => {
    setTouched(false);
    if (sub !== null) { setSub(sub > 0 ? sub - 1 : null); return; }
    const prev = step > 0 ? qs[step - 1] : null; const prevFu = prev ? fu[prev.id] ?? [] : [];
    go(Math.max(-1, step - 1)); if (prevFu.length) setSub(prevFu.length - 1); // land on the last follow-up they saw
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') { e.preventDefault(); void next(); } };
  const condition = preview && q?.showIf?.anyOf?.length ? (() => { const i = study.questions.findIndex(x => x.id === q.showIf!.questionId); return i >= 0 ? `Only shown if Q${i + 1} is ${q.showIf!.anyOf.map(o => `“${o}”`).join(' or ')}` : ''; })() : '';
  const fuNote = preview && q && canFollowUp(q) && (q.followups ?? 0) > 0 ? `After they answer${q.followIf?.length ? ` ${q.followIf.map(o => `“${o}”`).join(' or ')}` : ''}, AI asks up to ${q.followups} follow-up${q.followups === 1 ? '' : 's'} about what they said` : '';
  const lastLabel = step === n - 1 && !(maxFu && (sub === null ? answered : fuList.length < maxFu)) ? 'Submit' : 'Next';

  const t = study.theme ?? {};
  const themeStyle = { ...(t.accent ? { '--rs-accent': t.accent, '--rs-on': onColor(t.accent) } : {}), ...(t.background ? { '--rs-bg': t.background } : {}) } as React.CSSProperties;
  return <div className={`rs ${preview ? 'is-preview' : ''}`} style={themeStyle} onKeyDown={onKey}>
    {step >= 0 && step < n && <div className="rs-progress" aria-hidden="true"><i style={{ width: `${((step + (answered ? 1 : 0)) / n) * 100}%` }} /></div>}
    <AnimatePresence mode="wait">
      <motion.div key={`${step}-${sub ?? 'q'}`} className="rs-screen" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}>
        {step === -1 && <div className="rs-intro">
          {t.cover && <img className="rs-cover" src={t.cover} alt="" />}
          <h1>{study.title}</h1>
          {study.intro && <p>{study.intro}</p>}
          {(() => { const talk = study.questions.some(x => x.type === 'long'); const ai = study.questions.some(x => x.followups); return (talk || ai) && <ul className="rs-howto">
            {talk && <li>Answer out loud or type — whatever’s easier. Talk like you’re leaving a voice memo; rambling is welcome.</li>}
            {ai && <li>An AI may ask a quick follow-up about what you said. Skip any you don’t want to answer.</li>}
            <li>There are no right answers, and your answers are anonymous.</li>
          </ul>; })()}
          <button type="button" className="rs-primary" onClick={() => void next()} disabled={!n}>Start</button>
          <small>{n} question{n === 1 ? '' : 's'} · about {estimateMinutes(study.questions)} min</small>
        </div>}
        {q && !fuItem && <>{condition && <p className="rs-condition">{condition}</p>}{fuNote && <p className="rs-condition">{fuNote}</p>}<QuestionView q={q} index={step} total={n} value={value} set={set} errors={touched ? fieldErrors : {}} contact={contact} preview={preview} onUploadPhoto={onUploadPhoto} /></>}
        {q && fuItem && <div className="rs-q">
          <small className="rs-count">{step + 1} / {n} · follow-up</small>
          <blockquote className="rs-echo">{answerWords(sub === 0 ? value : fuList[sub! - 1]?.a, sub === 0 ? q : undefined).slice(0, 160)}{answerWords(sub === 0 ? value : fuList[sub! - 1]?.a, sub === 0 ? q : undefined).length > 160 ? '…' : ''}</blockquote>
          <h2>{fuItem.q}</h2>
          <LongAnswer label={fuItem.q} value={fuItem.a} set={setFuAnswer} />
        </div>}
        {step === n && <div className="rs-intro rs-thanks"><span className="rs-check" aria-hidden="true">✓</span><h1>{study.thanks || 'Thank you.'}</h1><p>You can close this page now.</p></div>}
      </motion.div>
    </AnimatePresence>
    {q && <div className="rs-nav">
      <button type="button" className="rs-ghost" onClick={back}>Back</button>
      <div className="rs-nav-right">
        {error && <span className="rs-error" role="alert">{error}</span>}
        {fuItem ? !fuItem.a.trim() && <button type="button" className="rs-ghost" disabled={!!busy} onClick={() => void advance()}>Skip</button>
          : !q.required && !answered && step < n - 1 && <button type="button" className="rs-ghost" onClick={() => go(step + 1)}>{q.type === 'schedule' ? 'Not now' : 'Skip'}</button>}
        <button type="button" className="rs-primary" disabled={!!busy || (!canNext && q.type !== 'contact')} onClick={() => void next()}>{busy === 'thinking' ? 'One sec…' : busy === 'sending' ? 'Sending…' : lastLabel}</button>
      </div>
    </div>}
  </div>;
}

function QuestionView({ q, index, total, value, set, errors, contact, preview, onUploadPhoto }: { q: Question; index: number; total: number; value: unknown; set: (v: unknown) => void; errors: Partial<Record<ContactKey, string>>; contact?: Partial<Record<ContactKey, string>>; preview?: boolean; onUploadPhoto?: UploadPhoto }) {
  const list = Array.isArray(value) ? value as string[] : [];
  return <div className="rs-q">
    <small className="rs-count">{index + 1} / {total}{q.required ? '' : ' · optional'}</small>
    {q.image && <img className="rs-qimg" src={q.image} alt="" />}
    {(() => { const { title, sub } = splitPrompt(q); return <><h2>{title}</h2>{sub && <p className="rs-sub">{sub}</p>}</>; })()}
    {q.type === 'multi' && <p className="rs-hint">Choose all that apply</p>}
    {q.type === 'rank' && <RankAnswer q={q} value={value} set={set} shuffle={!preview} />}
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
    {q.type === 'photo' && <PhotoAnswer q={q} value={value} set={set} upload={onUploadPhoto} />}
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
      <span>{micError || (listening ? 'Say as much as you like, like a voice memo. You can edit after.' : 'Talking is often easier than typing.')}</span>
    </div>}
  </div>;
}

/* ---------- Rank: tap in order, best first. Shuffled per person so list order doesn't bias the result. ---------- */
function RankAnswer({ q, value, set, shuffle }: { q: Question; value: unknown; set: (v: unknown) => void; shuffle?: boolean }) {
  const order = Array.isArray(value) ? value as string[] : [];
  const opts = q.options ?? [];
  const shown = useMemo(() => { const list = opts.map((o, i) => ({ o, img: q.optionImages?.[i] })); if (shuffle) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; }, [q.id, opts.join('|'), shuffle]);
  const toggle = (o: string) => set(order.includes(o) ? order.filter(x => x !== o) : [...order, o]);
  return <div className="rs-rank" role="group" aria-label={q.prompt}>
    <p className="rs-hint">Tap them in order, best first. Tap again to undo.</p>
    {shown.map(({ o, img }) => { const pos = order.indexOf(o); return <button key={o} type="button" className={`rs-rank-item ${pos >= 0 ? 'is-on' : ''}`} aria-pressed={pos >= 0} aria-label={pos >= 0 ? `${o}, ranked ${pos + 1}` : o} onClick={() => toggle(o)}>
      <span className="rs-rank-badge" aria-hidden="true">{pos >= 0 ? pos + 1 : ''}</span>{img && <img src={img} alt="" />}{o}</button>; })}
    {order.length > 0 && <div className="rs-rank-foot"><span>{order.length === opts.length ? 'All ranked' : `${order.length} of ${opts.length} ranked`}</span><button type="button" onClick={() => set([])}>Start over</button></div>}
  </div>;
}

/* ---------- Show me: a screenshot or photo (up to 3) ---------- */
function PhotoAnswer({ q, value, set, upload }: { q: Question; value: unknown; set: (v: unknown) => void; upload?: UploadPhoto }) {
  const paths = Array.isArray(value) ? value as string[] : [];
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const add = async (files: FileList | null) => {
    if (!files?.length) return; setErr(''); setBusy(true);
    const next = [...paths];
    try {
      for (const file of [...files].slice(0, 3 - paths.length)) {
        if (!file.type.startsWith('image/')) { setErr('Please choose a photo or screenshot.'); continue; }
        const path = upload ? await upload(q, file) : `preview/${crypto.randomUUID()}`;
        next.push(path); setThumbs(t => ({ ...t, [path]: URL.createObjectURL(file) }));
      }
      set(next);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add that photo. Please try again.'); }
    finally { setBusy(false); }
  };
  return <div className="rs-photos">
    {paths.length > 0 && <div className="rs-photo-grid">{paths.map(pth => <div key={pth} className="rs-photo">{thumbs[pth] ? <img src={thumbs[pth]} alt="Your photo" /> : <span>Added</span>}<button type="button" aria-label="Remove photo" onClick={() => set(paths.filter(x => x !== pth))}>×</button></div>)}</div>}
    {paths.length < 3 && <label className={`rs-mic rs-photo-add ${busy ? 'is-busy' : ''}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /></svg>
      {busy ? 'Adding…' : paths.length ? 'Add another' : 'Add a photo or screenshot'}
      <input type="file" accept="image/*" multiple onChange={e => { void add(e.target.files); e.target.value = ''; }} disabled={busy} />
    </label>}
    {err ? <p className="rs-error" role="alert">{err}</p> : <p className="rs-hint">Crop out anything private, like names or addresses.</p>}
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
      : <SurveyRunner study={study} onSubmit={async (answers, ms, followups) => { await call('submit', { id, answers, ms, followups }); }}
          onFollowUp={async (q, answer, history, context, used) => { const r = await call<{ question?: string; done?: boolean }>('followup', { id, questionId: q.id, answer, history, context, used }); return r.question || null; }}
          onUploadPhoto={async (q, file) => {
            const { uploadUrl, path } = await call<{ uploadUrl: string; path: string }>('photoUpload', { id, questionId: q.id, type: file.type || 'image/jpeg', size: file.size });
            const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file }).catch(() => null);
            if (!put?.ok) throw new Error('Could not upload that photo. Please try again.');
            return path;
          }} />}
  </main>;
}
