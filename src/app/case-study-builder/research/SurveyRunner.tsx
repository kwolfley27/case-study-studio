import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BOOKED, OPENED, onColor, bookingUrl, call, readDrafts, contactErrors, contactModes, CONTACT_FIELDS, isCalendly, isShown, splitPrompt, canFollowUp, wantsFollowUp, estimateMinutes, answerWords, isOtherOption, pickedOther, isScreen, sectionOf, DEFAULT_FOLLOWUP_BUDGET, type ContactKey, type EndingAnswer, type ResultType, type FollowUp, type Question, type Study } from './research';
import './research.css';

const hasValue = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v as object).some(x => String(x ?? '').trim()));

/* One question per screen. Used by the participant link and the builder's live preview.
   Questions with "Show only if" are skipped when the earlier answer doesn't match (the preview shows every question).
   Open questions with AI follow-ups: after an answer, onFollowUp may return a follow-up question, shown as its own screen. */
type AskFollowUp = (q: Question, answer: string, history: FollowUp[], context: FollowUp[], used: number) => Promise<string | null>;
type UploadPhoto = (q: Question, file: File) => Promise<string>;
type Saved = { ref: string; token: string };
type Submit = (answers: Record<string, unknown>, ms: number, followups: Record<string, FollowUp[]>, others: Record<string, string>, part?: 'core', ending?: EndingAnswer, early?: boolean) => Promise<unknown>;
/** Ask the AI for a short recap of their answers and which result type fits them best. */
type AskEnding = (context: Array<{ q: string; a: string }>) => Promise<{ recap?: string; type?: string }>;
type Extend = (saved: Saved, answers: Record<string, unknown>, ms: number, followups: Record<string, FollowUp[]>, others: Record<string, string>, early?: boolean) => Promise<unknown>;


export function SurveyRunner({ study, preview, onSubmit, onExtend, onFollowUp, onUploadPhoto, onEnding, startAt }: { study: Study; preview?: boolean; onSubmit?: Submit; onExtend?: Extend; onFollowUp?: AskFollowUp; onUploadPhoto?: UploadPhoto; onEnding?: AskEnding; startAt?: number }) {
  const [step, setStep] = useState(startAt ?? -1); // -1 intro, 0..n-1 questions, n thanks
  const [sub, setSub] = useState<number | null>(null); // which follow-up of the current question is showing
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fu, setFu] = useState<Record<string, FollowUp[]>>({});
  const [others, setOthers] = useState<Record<string, string>>({}); // what they typed after picking "Other"
  const [fuDone, setFuDone] = useState<Record<string, boolean>>({}); // the AI said there's nothing more to ask
  const [busy, setBusy] = useState<'' | 'thinking' | 'sending'>('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const started = useRef(Date.now());
  // Short version first; at the end, an optional bonus round (their short answers are already saved by then).
  const [bonusMode, setBonusMode] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [finished, setFinished] = useState(false);
  // The end: a recap to confirm or correct, and a result ("You're a Sunday Prepper").
  const ending = study.ending;
  const types = (ending?.types ?? []).filter(t => t.name.trim());
  const endingOn = !preview && !!onEnding && (!!ending?.recap || types.length > 0);
  const [endPhase, setEndPhase] = useState<null | 'loading' | 'recap' | 'fix' | 'early'>(null);
  const [endAns, setEndAns] = useState<EndingAnswer | null>(null);
  const result: ResultType | undefined = preview ? types[0] : types.find(t => t.name === endAns?.type);
  const hasBonus = !preview && !!onExtend && study.questions.some(x => x.bonus);
  useEffect(() => { if (startAt !== undefined) { setStep(startAt); setSub(null); } }, [startAt]);
  const visible = study.questions.filter(q => isShown(q, answers));
  const coreQs = visible.filter(x => !x.bonus), bonusQs = visible.filter(x => x.bonus);
  const qs = preview ? study.questions : hasBonus ? (bonusMode ? [...coreQs, ...bonusQs] : coreQs) : visible;
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
  // Ranking is done once every real option is placed (the last one places itself); "Other" is optional.
  const rankDone = q?.type === 'rank' ? (q.options ?? []).filter(o => !isOtherOption(o)).every(o => Array.isArray(value) && value.includes(o)) : true;
  const needsOther = !!q && (q.type === 'single' || q.type === 'multi' || q.type === 'rank') && pickedOther(value) && !(others[q.id] ?? '').trim();
  const canNext = !q || !!fuItem || (!needsOther && (q.type === 'contact' ? (contactOk || (!q.required && !answered)) : q.type === 'rank' ? (q.required ? rankDone : true) : (!q.required || answered)));
  const set = (v: unknown) => { if (!q) return; setAnswers(a => ({ ...a, [q.id]: v })); if (fu[q.id]?.length) setFu(f => { const { [q.id]: _gone, ...rest } = f; return rest; }); setFuDone(d => ({ ...d, [q.id]: false })); };
  const setFuAnswer = (a: string) => { if (!q || sub === null) return; setFu(f => ({ ...f, [q.id]: (f[q.id] ?? []).map((x, i) => i === sub ? { ...x, a } : x) })); setFuDone(d => ({ ...d, [q.id]: false })); };
  const contact = study.questions.filter(x => x.type === 'contact').map(x => answers[x.id]).find(hasValue) as Partial<Record<ContactKey, string>> | undefined;
  const go = (s: number) => { setTouched(false); setSub(null); setStep(s); };
  const shownIds = () => new Set(qs.map(x => x.id));
  /** What they said, in plain words, for the recap (names and contact details never go to the AI). */
  const recapContext = () => qs.filter(x => !isScreen(x) && x.preset !== 'name' && x.type !== 'contact' && x.type !== 'schedule' && x.type !== 'photo').map(x => {
    const a = answerWords(answers[x.id], x, others[x.id]); const f = (fu[x.id] ?? []).filter(y => y.a.trim()).map(y => ` / asked "${y.q}": ${y.a}`).join('');
    return { q: x.prompt, a: a ? a + f : '' };
  }).filter(x => x.a);
  const advance = async (endNow?: EndingAnswer) => {
    if (step === n - 1 && endingOn && !bonusMode && !endNow) {
      setEndPhase('loading'); setError('');
      const r: { recap?: string; type?: string } = await Promise.race([onEnding!(recapContext()).catch(() => ({})), new Promise<{ recap?: string; type?: string }>(res => window.setTimeout(() => res({}), 9000))]);
      const type = types.find(t => t.name === r.type)?.name ?? (types.length === 1 ? types[0].name : undefined);
      const got: EndingAnswer = { ...(r.recap ? { recap: r.recap.slice(0, 800) } : {}), ...(type ? { type } : {}) };
      setEndAns(got);
      if (ending?.recap && got.recap) { setEndPhase('recap'); return; }
      setEndPhase(null); await advance(got); return;
    }
    if (step === n - 1) {
      setBusy('sending'); setError('');
      // Only send answers to questions the participant actually saw.
      const shown = shownIds();
      const sentOthers = Object.fromEntries(Object.entries(others).filter(([k, t]) => shown.has(k) && t.trim() && pickedOther(answers[k])).map(([k, t]) => [k, t.trim()]));
      const sentFu = Object.fromEntries(Object.entries(fu).filter(([k]) => shown.has(k)).map(([k, list]) => [k, list.filter(x => x.a.trim())]).filter(([, list]) => (list as FollowUp[]).length));
      const sent = Object.fromEntries(Object.entries(answers).filter(([k]) => shown.has(k)));
      try {
        if (hasBonus && bonusMode && saved) { const b = new Set(bonusQs.map(x => x.id)); const only = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => b.has(k))); await onExtend!(saved, only(sent), Date.now() - started.current, only(sentFu), only(sentOthers)); setFinished(true); }
        else if (hasBonus) { const r = await onSubmit?.(sent, Date.now() - started.current, sentFu, sentOthers, 'core', endNow) as Partial<Saved> | undefined; if (r?.ref && r.token) setSaved({ ref: r.ref, token: r.token }); else setFinished(true); }
        else { await onSubmit?.(sent, Date.now() - started.current, sentFu, sentOthers, undefined, endNow); setFinished(true); }
        setEndPhase(null); go(n);
      }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not send your answers. Please try again.'); }
      finally { setBusy(''); }
    } else { if (step === -1) started.current = Date.now(); go(step + 1); }
  };
  /** “Finish early”: save what they've answered so far (no recap; they still get their result). */
  const finishEarly = async () => {
    setBusy('sending'); setError('');
    const reached = new Set(qs.slice(0, step + 1).map(x => x.id));
    const keep = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => reached.has(k)));
    const sent = keep(answers);
    const sentFu = Object.fromEntries(Object.entries(keep(fu)).map(([k, list]) => [k, list.filter(x => x.a.trim())]).filter(([, list]) => (list as FollowUp[]).length));
    const sentOthers = Object.fromEntries(Object.entries(keep(others)).filter(([k, t]) => t.trim() && pickedOther(answers[k])));
    try {
      if (bonusMode && saved) { const b = new Set(bonusQs.map(x => x.id)); const only = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => b.has(k))); await onExtend!(saved, only(sent), Date.now() - started.current, only(sentFu), only(sentOthers), true); }
      else {
        let end: EndingAnswer | undefined;
        if (endingOn && types.length) { const r: { type?: string } = await Promise.race([onEnding!(recapContext().filter((_, i) => i < 60)).catch(() => ({})), new Promise<{ type?: string }>(res => window.setTimeout(() => res({}), 8000))]); const type = types.find(t => t.name === r.type)?.name; if (type) { end = { type }; setEndAns(end); } }
        await onSubmit?.(sent, Date.now() - started.current, sentFu, sentOthers, undefined, end, true);
      }
      setFinished(true); setEndPhase(null); setSub(null); setStep(n);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your answers. Please try again.'); }
    finally { setBusy(''); }
  };
  /* Follow-ups are fetched while they're still answering (after a short pause), so Next is usually instant.
     The same answer is never asked about twice, and Next never waits more than a couple of seconds. */
  const fuCache = useRef(new Map<string, Promise<string | null>>());
  const fetchFu = (qq: Question, ans: string, history: FollowUp[], usedNow: number) => {
    const key = `${qq.id}|${ans}|${history.map(h => h.a).join('§')}`;
    let p = fuCache.current.get(key);
    if (!p) {
      const context = qs.slice(0, step).filter(x => x.preset !== 'name').map(x => ({ q: x.prompt, a: answerWords(answers[x.id], x, others[x.id]) })).filter(x => x.a); // names never go to the AI
      p = onFollowUp!(qq, ans, history, context, usedNow).catch(() => null);
      fuCache.current.set(key, p);
    }
    return p;
  };
  const curAns = q ? answerWords(value, q, others[q.id]) : '';
  const curFu = fuItem?.a ?? '';
  useEffect(() => {
    if (!q || !onFollowUp || !maxFu || fuDone[q.id]) return;
    if (sub !== null && (sub + 1 < fuList.length || fuList.length >= maxFu || !curFu.trim())) return;
    if (sub === null && (!curAns || ((q.type === 'long' || q.type === 'text') && curAns.length < 12))) return;
    const history = sub === null ? [] : fuList;
    const usedNow = used - (fu[q.id]?.length ?? 0) + history.length;
    if (usedNow >= budget) return;
    const t = window.setTimeout(() => { void fetchFu(q, curAns, history, usedNow); }, q.type === 'long' || q.type === 'text' || sub !== null ? 1200 : 150);
    return () => window.clearTimeout(t);
  }, [q?.id, curAns, curFu, sub, maxFu]);
  /** Ask the AI for the next follow-up; false when there isn't one. */
  const askMore = async (history: FollowUp[]) => {
    if (!q || !onFollowUp || history.length >= maxFu || fuDone[q.id] || used - (fu[q.id]?.length ?? 0) + history.length >= budget) return false;
    setBusy('thinking');
    try {
      const question = await Promise.race([fetchFu(q, answerWords(value, q, others[q.id]), history, used - (fu[q.id]?.length ?? 0) + history.length), new Promise<null>(r => window.setTimeout(() => r(null), 2200))]);
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
  const secOf = sectionOf(qs);
  const coreSections = qs.filter(x => x.type === 'section' && !x.bonus);
  /** "Part 2 of 5" on a section screen; the section's name on its questions. */
  const sectionLabel = (x: Question) => x.type === 'section' ? (x.bonus ? 'Bonus round' : `Part ${coreSections.indexOf(x) + 1} of ${coreSections.length}`) : secOf.get(x.id)?.prompt ?? '';
  const lastLabel = step === n - 1 && !(maxFu && (sub === null ? answered : fuList.length < maxFu)) ? 'Submit' : 'Next';

  const t = study.theme ?? {};
  const themeStyle = { ...(t.accent ? { '--rs-accent': t.accent, '--rs-on': onColor(t.accent) } : {}), ...(t.background ? { '--rs-bg': t.background } : {}) } as React.CSSProperties;
  return <div className={`rs ${preview ? 'is-preview' : ''}`} style={themeStyle} onKeyDown={onKey}>
    {step >= 0 && step < n && <div className="rs-progress" aria-hidden="true"><i style={{ width: `${((step + (answered ? 1 : 0)) / n) * 100}%` }} /></div>}
    {!preview && q && !endPhase && step >= 2 && step < n - 1 && <button type="button" className="rs-early" onClick={() => setEndPhase('early')}>Finish early</button>}
    <AnimatePresence mode="wait">
      <motion.div key={`${step}-${sub ?? 'q'}-${endPhase ?? ''}`} className="rs-screen" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}>
        {step === -1 && <div className="rs-intro">
          {t.cover && <img className="rs-cover" src={t.cover} alt="" />}
          <h1>{study.title}</h1>
          {study.intro && <p>{study.intro}</p>}
          <button type="button" className="rs-primary" onClick={() => void next()} disabled={!n}>Start</button>
          {(() => { const talk = study.questions.some(x => x.type === 'long'); const ai = study.questions.some(x => x.followups); return <div className="rs-meta">
            <span>About {estimateMinutes(preview ? study.questions.filter(x => !x.bonus) : hasBonus ? coreQs : visible, study.followupBudget)} min{talk ? ' · Talk or type' : ''} · Anonymous</span>
            {ai && <span>An AI may ask a quick follow-up about what you say.</span>}
          </div>; })()}
        </div>}
        {q && !fuItem && !endPhase && <>{condition && <p className="rs-condition">{condition}</p>}{fuNote && <p className="rs-condition">{fuNote}</p>}{preview && q.bonus && <p className="rs-condition">Bonus round: only if they choose to keep going after the short version</p>}<QuestionView q={q} index={step} total={n} section={sectionLabel(q)} value={value} set={set} other={others[q.id] ?? ''} setOther={t => { setOthers(o => ({ ...o, [q.id]: t })); setFuDone(d => ({ ...d, [q.id]: false })); if (fu[q.id]?.length) setFu(f => { const { [q.id]: _gone, ...rest } = f; return rest; }); }} errors={touched ? fieldErrors : {}} contact={contact} preview={preview} onUploadPhoto={onUploadPhoto} onDone={preview ? undefined : () => void next()} /></>}
        {q && fuItem && !endPhase && <div className="rs-q">
          <small className="rs-count">{sectionLabel(q) ? <span className="rs-count-sec">{sectionLabel(q)}</span> : null}follow-up</small>
          <blockquote className="rs-echo">{answerWords(sub === 0 ? value : fuList[sub! - 1]?.a, sub === 0 ? q : undefined).slice(0, 160)}{answerWords(sub === 0 ? value : fuList[sub! - 1]?.a, sub === 0 ? q : undefined).length > 160 ? '…' : ''}</blockquote>
          <h2>{fuItem.q}</h2>
          <LongAnswer label={fuItem.q} value={fuItem.a} set={setFuAnswer} onDone={() => void next()} />
        </div>}
        {endPhase === 'early' && <div className="rs-intro rs-ending">
          <h1>Finish now?</h1>
          <p>We’ll save everything you’ve answered so far. It all helps, thank you!</p>
          <div className="rs-offer-actions"><button type="button" className="rs-primary" disabled={!!busy} onClick={() => void finishEarly()}>{busy === 'sending' ? 'Saving…' : 'Save and finish'}</button><button type="button" className="rs-ghost" disabled={!!busy} onClick={() => setEndPhase(null)}>Keep going</button></div>
          {error && <p className="rs-error" role="alert">{error}</p>}
        </div>}
        {endPhase === 'loading' && <div className="rs-intro rs-ending"><span className="rs-dots" aria-hidden="true"><i /><i /><i /></span><h1>Putting it together…</h1><p>A quick recap of what you told us.</p></div>}
        {(endPhase === 'recap' || endPhase === 'fix') && endAns?.recap && <div className="rs-q rs-recap">
          <small className="rs-count">Before you go</small>
          <h2>Here’s what we heard</h2>
          <p className="rs-recap-text">{endAns.recap}</p>
          {endPhase === 'recap' ? <>
            <p className="rs-hint">Did we get that right?</p>
            <div className="rs-recap-actions">
              <button type="button" className="rs-primary" disabled={!!busy} onClick={() => { const a = { ...endAns, ok: 'yes' as const }; setEndAns(a); void advance(a); }}>{busy === 'sending' ? 'Sending…' : 'Yes, that’s right'}</button>
              <button type="button" className="rs-ghost" disabled={!!busy} onClick={() => setEndPhase('fix')}>Not quite</button>
            </div>
          </> : <>
            <p className="rs-hint">What did we get wrong, or miss?</p>
            <LongAnswer label="What did we get wrong?" value={endAns.fix ?? ''} set={v => setEndAns(a => ({ ...a!, fix: v }))} />
            <div className="rs-recap-actions">
              <button type="button" className="rs-primary" disabled={!!busy} onClick={() => { const a = { ...endAns, ok: 'no' as const, fix: (endAns.fix ?? '').trim() || undefined }; void advance(a); }}>{busy === 'sending' ? 'Sending…' : 'Send my answers'}</button>
              <button type="button" className="rs-ghost" disabled={!!busy} onClick={() => setEndPhase('recap')}>Back</button>
            </div>
          </>}
          {error && <p className="rs-error" role="alert">{error}</p>}
        </div>}
        {step === n && hasBonus && saved && !bonusMode && !finished && <div className="rs-intro rs-offer">
          {result ? <ResultCard title={ending?.title} type={result} /> : <span className="rs-check" aria-hidden="true">✓</span>}
          <h1>That’s it, thank you!</h1>
          {(() => { const m = estimateMinutes(bonusQs, Math.max(0, (study.followupBudget ?? DEFAULT_FOLLOWUP_BUDGET) - used)); return <p>Your answers are saved. Got about {m} more minute{m === 1 ? '' : 's'} for a few bonus questions?</p>; })()}
          <div className="rs-offer-actions"><button type="button" className="rs-primary" onClick={() => { setBonusMode(true); started.current = Date.now(); go(coreQs.length); }}>Keep going</button><button type="button" className="rs-ghost" onClick={() => setFinished(true)}>I’m done</button></div>
        </div>}
        {step === n && (!hasBonus || finished || !saved) && <div className="rs-intro rs-thanks">{result && !(hasBonus && bonusMode) ? <ResultCard title={ending?.title} type={result} /> : <span className="rs-check" aria-hidden="true">✓</span>}<h1>{study.thanks || 'Thank you.'}</h1><p>You can close this page now.</p></div>}
      </motion.div>
    </AnimatePresence>
    {q && !endPhase && <div className="rs-nav">
      {bonusMode && step === coreQs.length && sub === null ? <span /> : <button type="button" className="rs-ghost" onClick={back}>Back</button>}
      <div className="rs-nav-right">
        {error && <span className="rs-error" role="alert">{error}</span>}
        {fuItem ? !fuItem.a.trim() && <button type="button" className="rs-ghost" disabled={!!busy} onClick={() => void advance()}>Skip</button>
          : !isScreen(q) && !q.required && !answered && step < n - 1 && <button type="button" className="rs-ghost" onClick={() => go(step + 1)}>{q.type === 'schedule' ? 'Not now' : 'Skip'}</button>}
        <button type="button" className="rs-primary" disabled={!!busy || (!canNext && q.type !== 'contact')} onClick={() => void next()}>{busy === 'thinking' ? 'One sec…' : busy === 'sending' ? 'Sending…' : lastLabel}</button>
      </div>
    </div>}
  </div>;
}

function QuestionView({ q, section, index, total, value, set, other, setOther, errors, contact, preview, onUploadPhoto, onDone }: { section?: string; onDone?: () => void; q: Question; other: string; setOther: (t: string) => void; index: number; total: number; value: unknown; set: (v: unknown) => void; errors: Partial<Record<ContactKey, string>>; contact?: Partial<Record<ContactKey, string>>; preview?: boolean; onUploadPhoto?: UploadPhoto }) {
  const list = Array.isArray(value) ? value as string[] : [];
  if (q.type === 'section') return <div className="rs-q rs-section">
    <small className="rs-section-part">{section}</small>
    {q.image && <img className="rs-qimg" src={q.image} alt="" />}
    <h2>{q.prompt}</h2>
    {q.hint && <p className="rs-sub">{q.hint}</p>}
  </div>;
  return <div className="rs-q">
    <small className="rs-count">{section ? <span className="rs-count-sec is-only">{section}</span> : `${index + 1} / ${total}`}{q.type === 'note' ? '' : q.required ? '' : section ? 'optional' : ' · optional'}</small>
    {q.image && <img className="rs-qimg" src={q.image} alt="" />}
    {q.type === 'note' ? <><h2>{q.prompt}</h2>{q.hint && <div className="rs-note-body">{q.hint.split(/\n{2,}/).map((para, k) => <p key={k} className={/^for example/i.test(para.trim()) ? 'rs-note-example' : ''}>{para}</p>)}</div>}</>
      : (() => { const { title, sub } = splitPrompt(q); return <><h2>{title}</h2>{sub && <p className="rs-sub">{sub}</p>}</>; })()}
    {q.type === 'multi' && <p className="rs-hint">Choose all that apply</p>}
    {q.type === 'rank' && <RankAnswer q={q} value={value} set={set} shuffle={!preview} other={other} setOther={setOther} />}
    {(q.type === 'single' || q.type === 'multi') && (() => { const pics = (q.optionImages ?? []).some(Boolean); return <div className={`rs-options ${pics ? 'has-images' : ''}`} role={q.type === 'single' ? 'radiogroup' : 'group'} aria-label={q.prompt}>
      {(q.options ?? []).map((o, i) => { const on = q.type === 'single' ? value === o : list.includes(o); const mark = <span className={`rs-mark ${q.type === 'multi' ? 'is-box' : ''}`} aria-hidden="true" />; const img = q.optionImages?.[i]; return <button key={i} type="button" role={q.type === 'single' ? 'radio' : 'checkbox'} aria-checked={on} className={`rs-option ${on ? 'is-on' : ''} ${pics ? 'is-card' : ''}`}
        onClick={() => set(q.type === 'single' ? o : on ? list.filter(x => x !== o) : [...list, o])}>{pics ? <>{img ? <img src={img} alt="" /> : <span className="rs-card-ph" aria-hidden="true" />}<span className="rs-card-label">{mark}{o}</span></> : <>{mark}{o}</>}</button>; })}
      {pickedOther(value) && (q.options ?? []).some(isOtherOption) && <OtherBox value={other} set={setOther} prompt={q.prompt} />}
    </div>; })()}
    {q.type === 'scale' && q.slider && <SliderAnswer q={q} value={value} set={set} />}
    {(q.type === 'scale' && !q.slider || q.type === 'nps') && (() => { const lo = q.type === 'nps' ? 0 : q.min ?? 1, hi = q.type === 'nps' ? 10 : q.max ?? 5; return <div className={`rs-scale ${q.type === 'nps' ? 'is-nps' : ''}`}>
      <div className="rs-scale-row" role="radiogroup" aria-label={q.prompt}>{Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map(v => <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => set(v)}>{v}</button>)}</div>
      <div className="rs-scale-labels"><span>{q.type === 'nps' ? 'Not at all likely' : q.minLabel}</span><span>{q.type === 'nps' ? 'Extremely likely' : q.maxLabel}</span></div>
    </div>; })()}
    {q.type === 'text' && <input className="rs-input" autoFocus value={String(value ?? '')} onChange={e => set(e.target.value)} placeholder="Type your answer" aria-label={q.prompt} />}
    {q.type === 'long' && <LongAnswer label={q.prompt} value={String(value ?? '')} set={set} onDone={onDone} />}
    {q.type === 'contact' && <ContactFields q={q} value={value} set={set} errors={errors} />}
    {q.type === 'schedule' && <Booking q={q} value={value} set={set} contact={contact} preview={preview} />}
    {q.type === 'photo' && <PhotoAnswer q={q} value={value} set={set} upload={onUploadPhoto} />}
  </div>;
}

/* A 1–10 (or 1–5/7) slider. Nothing is picked until they touch it. */
function SliderAnswer({ q, value, set }: { q: Question; value: unknown; set: (v: unknown) => void }) {
  const lo = q.min ?? 1, hi = q.max ?? 10;
  const has = typeof value === 'number';
  const v = has ? value as number : Math.round((lo + hi) / 2);
  const pct = ((v - lo) / (hi - lo)) * 100;
  return <div className={`rs-slider ${has ? 'has-value' : ''}`}>
    <div className="rs-slider-value" aria-hidden="true">{has ? v : '–'}<small>{has ? ` / ${hi}` : 'Drag or tap'}</small></div>
    <input type="range" min={lo} max={hi} step={1} value={v} aria-label={q.prompt} aria-valuetext={has ? String(v) : 'Not answered'}
      style={{ ['--pct' as string]: `${pct}%` }}
      onChange={e => set(Number(e.target.value))} onPointerUp={e => set(Number((e.target as HTMLInputElement).value))} onKeyDown={e => { if (!has && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) set(v); }} />
    <div className="rs-slider-ticks" aria-hidden="true">{Array.from({ length: hi - lo + 1 }, (_, i) => <span key={i} className={has && lo + i === v ? 'is-on' : ''}>{lo + i}</span>)}</div>
    <div className="rs-scale-labels"><span>{q.minLabel}</span><span>{q.maxLabel}</span></div>
  </div>;
}

/* The fun result at the end: "What kind of meal planner are you?" → "You're a Sunday Prepper". */
function ResultCard({ title, type }: { title?: string; type: ResultType }) {
  return <div className="rs-result">
    {title && <small>{title}</small>}
    <h2>You’re {/^(a|an|the)\s/i.test(type.name) ? '' : /^[aeiou]/i.test(type.name) ? 'an ' : 'a '}{type.name}</h2>
    {type.image && <img src={type.image} alt="" />}
    {type.blurb && <p>{type.blurb}</p>}
  </div>;
}

/* ---------- Long answer, with a mic for speaking instead of typing ---------- */
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SpeechAPI = (): (new () => Recognition) | undefined => typeof window === 'undefined' ? undefined : ((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Recognition) | undefined;

/* A live voice wave. Uses the real microphone level where the browser allows it alongside dictation;
   on iPhone (where that can interrupt dictation) it animates with speech instead. */
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function Wave({ active, speaking }: { active: boolean; speaking: boolean }) {
  const BARS = 24;
  const bars = useRef<Array<HTMLSpanElement | null>>([]);
  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null, ctx: AudioContext | null = null, raf = 0, stopped = false;
    let analyser: AnalyserNode | null = null; const data = new Uint8Array(64);
    const level = (k: number) => {
      if (analyser) { analyser.getByteFrequencyData(data); return Math.min(1, (data[2 + (k % 30)] ?? 0) / 180); }
      return speakingRef.current ? 0.25 + Math.random() * 0.75 : 0.08 + Math.random() * 0.08;
    };
    const tick = () => { if (stopped) return; bars.current.forEach((b, k) => { if (b) b.style.transform = `scaleY(${Math.max(0.1, level(k)).toFixed(2)})`; }); raf = requestAnimationFrame(tick); };
    (async () => {
      if (!isIOS() && navigator.mediaDevices?.getUserMedia) {
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); if (stopped) { stream.getTracks().forEach(t => t.stop()); return; } ctx = new AudioContext(); analyser = ctx.createAnalyser(); analyser.fftSize = 128; ctx.createMediaStreamSource(stream).connect(analyser); } catch { /* fall back to the animated wave */ }
      }
      tick();
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); void ctx?.close().catch(() => undefined); };
  }, [active]);
  const speakingRef = useRef(speaking); speakingRef.current = speaking;
  return <div className="rs-wave" aria-hidden="true">{Array.from({ length: BARS }, (_, k) => <span key={k} ref={el => { bars.current[k] = el; }} />)}</div>;
}

/* Voice first: a big "Tap to talk" button, with "Type instead" underneath.
   Choosing to type twice makes typing the default for the rest of the survey (they may be somewhere quiet).
   While talking: words appear live, and a bar like Claude's voice mode offers cancel, a live wave, pause and done. */
const TYPE_KEY = 'csb-chose-typing';
const typeCount = () => { try { return Number(sessionStorage.getItem(TYPE_KEY) || 0); } catch { return 0; } };
const bumpType = () => { try { sessionStorage.setItem(TYPE_KEY, String(typeCount() + 1)); } catch { /* ignore */ } };
const MicIcon = ({ size = 16 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></svg>;

function LongAnswer({ label, value, set, onDone }: { label: string; value: string; set: (v: string) => void; onDone?: () => void }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [micError, setMicError] = useState('');
  const rec = useRef<Recognition | null>(null);
  const base = useRef(value);
  const before = useRef(value); // the text before this recording, for cancel
  const after = useRef<'keep' | 'next' | 'cancel'>('keep');
  const latest = useRef(value); latest.current = value;
  const quiet = useRef(0);
  const supported = !!SpeechAPI();
  const [typing, setTyping] = useState(() => !supported || typeCount() >= 2);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => () => { after.current = 'keep'; rec.current?.stop(); }, []);
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [value, interim]);
  const start = () => {
    const API = SpeechAPI(); if (!API) { setTyping(true); return; }
    const r = new API(); rec.current = r;
    r.lang = navigator.language || 'en-US'; r.continuous = true; r.interimResults = true;
    base.current = latest.current; before.current = latest.current; after.current = 'keep';
    r.onresult = e => {
      let finalText = '', live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else live += t; }
      if (finalText) { const joined = `${base.current}${base.current && !/\s$/.test(base.current) ? ' ' : ''}${finalText.trim()}`; base.current = joined; set(joined); }
      setInterim(live); setSpeaking(true); window.clearTimeout(quiet.current); quiet.current = window.setTimeout(() => setSpeaking(false), 700);
    };
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setMicError('Microphone access is off, so you can type instead.'); setTyping(true); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setMicError('That stopped early. Tap the mic to keep going.');
    };
    r.onend = () => {
      setListening(false); setInterim(''); setSpeaking(false);
      if (after.current === 'cancel') set(before.current);
      if (after.current === 'next') window.setTimeout(() => onDone?.(), 0);
      after.current = 'keep';
    };
    setMicError(''); setListening(true);
    try { r.start(); } catch { setListening(false); }
  };
  const stop = (then: 'keep' | 'next' | 'cancel') => { after.current = then; rec.current?.stop(); };
  const shownFinal = value, shownLive = interim;
  if (typing) return <div className="rs-long">
    <textarea className="rs-input" rows={5} autoFocus value={value} onChange={e => set(e.target.value)} placeholder="The more detail, the better" aria-label={label} />
    {micError && <p className="rs-hint">{micError}</p>}
    {supported && !micError && <button type="button" className="rs-switch" onClick={() => { setTyping(false); start(); }}><MicIcon size={14} /> Talk instead</button>}
  </div>;
  const has = (value + interim).trim().length > 0;
  if (listening) return <div className="rs-voice is-live">
    <div className="rs-transcript" ref={box} aria-live="polite">{shownFinal || shownLive ? <>{shownFinal}{shownLive && <span className="rs-live">{shownFinal && !/\s$/.test(shownFinal) ? ' ' : ''}{shownLive}</span>}</> : <span className="rs-live">Listening…</span>}</div>
    <div className="rs-voicebar">
      <button type="button" className="rs-vb-btn" onClick={() => stop('cancel')} aria-label="Cancel this recording"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      <Wave active={listening} speaking={speaking} />
      <button type="button" className="rs-vb-btn" onClick={() => stop('keep')} aria-label="Pause"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg></button>
      <button type="button" className="rs-vb-btn is-done" onClick={() => stop(onDone ? 'next' : 'keep')} aria-label="Done"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></button>
    </div>
  </div>;
  return <div className="rs-voice">
    {has ? <>
      <textarea className="rs-input" rows={5} value={value} onChange={e => set(e.target.value)} aria-label={label} />
      <div className="rs-voice-row"><button type="button" className="rs-mic" onClick={start}><MicIcon size={14} /> Keep talking</button><span>You can fix any words above.</span></div>
    </> : <>
      <button type="button" className="rs-mic-big" onClick={start} aria-label="Tap to talk"><MicIcon size={34} /></button>
      <p className="rs-voice-label">Tap to talk</p>
      <button type="button" className="rs-switch" onClick={() => { bumpType(); setTyping(true); }}>Type instead</button>
    </>}
    {micError && <p className="rs-error" role="alert">{micError}</p>}
  </div>;
}

/* ---------- Rank: tap in order, best first. Shuffled per person so list order doesn't bias the result. ---------- */
function RankAnswer({ q, value, set, shuffle, other, setOther }: { q: Question; value: unknown; set: (v: unknown) => void; shuffle?: boolean; other: string; setOther: (t: string) => void }) {
  const order = Array.isArray(value) ? value as string[] : [];
  const opts = q.options ?? [];
  const shown = useMemo(() => { const list = opts.map((o, i) => ({ o, img: q.optionImages?.[i] })); if (shuffle) for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; }, [q.id, opts.join('|'), shuffle]);
  const real = opts.filter(o => !isOtherOption(o));
  // Once all but one real option are placed, the last one places itself.
  const toggle = (o: string) => {
    if (order.includes(o)) { set(order.filter(x => x !== o)); return; }
    let next = [...order, o];
    const left = real.filter(x => !next.includes(x));
    if (left.length === 1 && !isOtherOption(o)) next = [...next.filter(x => !isOtherOption(x)), left[0], ...next.filter(isOtherOption)];
    set(next);
  };
  return <div className="rs-rank" role="group" aria-label={q.prompt}>
    <p className="rs-hint">Tap them in order, best first. The last one fills in by itself. Tap again to undo.</p>
    {shown.map(({ o, img }) => { const pos = order.indexOf(o); return <button key={o} type="button" className={`rs-rank-item ${pos >= 0 ? 'is-on' : ''}`} aria-pressed={pos >= 0} aria-label={pos >= 0 ? `${o}, ranked ${pos + 1}` : o} onClick={() => toggle(o)}>
      <span className="rs-rank-badge" aria-hidden="true">{pos >= 0 ? pos + 1 : ''}</span>{img && <img src={img} alt="" />}{o}</button>; })}
    {pickedOther(order) && <OtherBox value={other} set={setOther} prompt={q.prompt} />}
    {order.length > 0 && <div className="rs-rank-foot"><span>{real.every(o => order.includes(o)) ? 'All ranked' : `${order.filter(o => !isOtherOption(o)).length} of ${real.length} ranked`}</span><button type="button" onClick={() => set([])}>Start over</button></div>}
  </div>;
}

/* The box that opens after picking "Other": scrolled into view so it's never missed on a phone. */
function OtherBox({ value, set, prompt }: { value: string; set: (t: string) => void; prompt: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, []);
  const store = /store|shop|grocer/i.test(prompt);
  return <label className="rs-field rs-other-wrap"><span>{store ? 'Which store?' : 'Tell us which'}</span>
    <input ref={ref} className="rs-input rs-other" value={value} maxLength={120} onChange={e => set(e.target.value)} placeholder={store ? 'e.g. Sprouts' : 'Type it here'} /></label>;
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
  // Test mode (#/r/<id>?test=1): runs exactly like the real thing, but nothing is saved to Results or Notion.
  // On the computer you build on, it uses your latest unpublished edits.
  const test = /[?&]test=1\b/.test(location.hash);
  const draft = test ? readDrafts().find(s => s.id === id) : undefined;
  const [study, setStudy] = useState<Study | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    document.title = 'Research study';
    if (draft) { setStudy(draft); document.title = `Test: ${draft.title}`; return; }
    call<{ study: Study }>('get', { id }).then(d => { setStudy(d.study); document.title = test ? `Test: ${d.study.title}` : d.study.title; }, e => setError(e instanceof Error ? e.message : 'Could not open this study.'));
  }, [id]);
  const inline = draft ? { questions: draft.questions, goal: draft.goal, followupBudget: draft.followupBudget, ending: draft.ending } : undefined;
  return <main className={`rs-page ${study?.theme?.background ? 'has-theme' : ''} ${test ? 'is-test' : ''}`} style={study?.theme?.background ? { '--rs-bg': study.theme.background } as React.CSSProperties : undefined}>
    {test && <div className="rs-testbar" role="status">Test mode · answers aren’t saved to Results{draft ? ' · using your latest edits' : ''}</div>}
    {error ? <div className="rs-intro"><h1>Sorry</h1><p>{error}</p></div>
      : !study ? <div className="rs-loading">Loading…</div>
      : <SurveyRunner study={study} onSubmit={(answers, ms, followups, others, part, ending, early) => call('submit', { id, answers, ms, followups, others, part, ending, early, test })}
          onEnding={context => call<{ recap?: string; type?: string }>('ending', { id, context, ...(inline ? { test: true, study: inline } : {}) }, !!inline)}
          onExtend={(saved, answers, ms, followups, others, early) => call('extend', { id, ref: saved.ref, token: saved.token, answers, ms, followups, others, early, test })}
          onFollowUp={async (q, answer, history, context, used) => { const r = await call<{ question?: string; done?: boolean }>('followup', { id, questionId: q.id, answer, history, context, used, ...(inline ? { test: true, study: inline } : {}) }, !!inline); return r.question || null; }}
          onUploadPhoto={async (q, file) => {
            const { uploadUrl, path } = await call<{ uploadUrl: string; path: string }>('photoUpload', { id, questionId: q.id, type: file.type || 'image/jpeg', size: file.size });
            const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file }).catch(() => null);
            if (!put?.ok) throw new Error('Could not upload that photo. Please try again.');
            return path;
          }} />}
  </main>;
}
