import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { call, fmtMs, getPasscode, NeedsPasscode, OUTCOME_LABEL, QUICK_TAGS, setPasscode, type Outcome, type Session, type Study, type TaskRecord } from './research';
import './research.css';

/*
  Run a moderated usability session from your phone:
  participant → (optional) record audio → each task with a timer, outcome, tags and notes → save.
  Unsaved sessions are kept on the phone so nothing is lost if the connection drops.
*/

const PENDING = 'csb-pending-sessions';
/* Recordings that couldn't upload wait in IndexedDB, so a dropped connection never loses a session. */
const idb = () => new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('csb-sessions', 1); r.onupgradeneeded = () => r.result.createObjectStore('audio'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const keepAudio = async (id: string, blob: Blob) => { try { const db = await idb(); db.transaction('audio', 'readwrite').objectStore('audio').put(blob, id); } catch { /* ignore */ } };
const takeAudio = async (id: string) => { try { const db = await idb(); return await new Promise<Blob | null>(res => { const q = db.transaction('audio').objectStore('audio').get(id); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); }); } catch { return null; } };
const dropAudio = async (id: string) => { try { const db = await idb(); db.transaction('audio', 'readwrite').objectStore('audio').delete(id); } catch { /* ignore */ } };
type Pending = Session & { studyId: string };
const readPending = (): Pending[] => { try { return JSON.parse(localStorage.getItem(PENDING) || '[]'); } catch { return []; } };
const writePending = (list: Pending[]) => { try { localStorage.setItem(PENDING, JSON.stringify(list)); } catch { /* ignore */ } };

/* Upload the recording (if any), then save the session. */
async function upload(study: Study, session: Session, audio: Blob | null, onStage: (s: string) => void) {
  if (audio && audio.size) {
    onStage('Uploading the recording…');
    const type = audio.type.split(';')[0] || 'audio/webm';
    const up = await call<{ uploadUrl: string; path: string }>('audioUpload', { id: study.id, sessionId: session.id, type }, true);
    const res = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': type, 'x-upsert': 'true' }, body: audio });
    if (!res.ok) throw new Error(res.status === 413 ? 'The recording is too large for your storage plan.' : `Audio upload failed (${res.status}).`);
    session = { ...session, audioPath: up.path };
  }
  onStage('Saving the session…');
  return call<{ ok: boolean; notionError?: string }>('session', { id: study.id, session }, true);
}

const pickType = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) || '';

export function SessionRunner({ study, onDone, embedded }: { study: Study; onDone?: () => void; embedded?: boolean }) {
  const tasks = study.tasks ?? [];
  const [step, setStep] = useState(-1); // -1 setup, 0..n-1 tasks, n wrap-up, n+1 saved
  const [participant, setParticipant] = useState('');
  const [consent, setConsent] = useState(false);
  const [recordAudio, setRecordAudio] = useState(true);
  const [records, setRecords] = useState<Record<string, TaskRecord>>({});
  const [notes, setNotes] = useState('');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [needPass, setNeedPass] = useState(!getPasscode());
  const [pass, setPass] = useState(getPasscode());
  const started = useRef(0); const taskStart = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const stream = useRef<MediaStream | null>(null);
  const sessionId = useRef(crypto.randomUUID());
  const audioBlob = useRef<Blob | null>(null);
  const [pending, setPending] = useState(() => readPending().filter(p => p.studyId === study.id));
  const iv = study.format === 'interview';
  const n = tasks.length; const task = step >= 0 && step < n ? tasks[step] : null;
  const rec = task ? records[task.id] : undefined;
  useEffect(() => { if (step < 0 || step > n) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [step, n]);
  useEffect(() => () => { stream.current?.getTracks().forEach(t => t.stop()); }, []);

  const start = async () => {
    setError('');
    if (recordAudio) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        stream.current = s; const type = pickType();
        const r = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
        chunks.current = []; r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); }; r.start(5000); recorder.current = r;
      } catch { setError('Microphone blocked. Allow it in your browser settings, or turn off audio recording.'); return; }
    }
    started.current = Date.now(); taskStart.current = Date.now(); setStep(0);
  };
  const setRec = (patch: Partial<TaskRecord>) => task && setRecords(r => ({ ...r, [task.id]: { taskId: task.id, status: r[task.id]?.status ?? 'skipped', ms: r[task.id]?.ms ?? 0, notes: r[task.id]?.notes ?? '', tags: r[task.id]?.tags ?? [], ...patch } }));
  const choose = (status: Outcome) => setRec({ status, ms: Date.now() - taskStart.current });
  const next = () => { if (task && (iv || !records[task.id])) setRec({ status: records[task.id]?.status ?? 'skipped', ms: (iv ? records[task.id]?.ms ?? 0 : 0) + Date.now() - taskStart.current }); taskStart.current = Date.now(); setStep(s => s + 1); };

  const stopAudio = () => new Promise<Blob | null>(resolve => {
    const r = recorder.current; if (!r || r.state === 'inactive') { resolve(chunks.current.length ? new Blob(chunks.current, { type: r?.mimeType || 'audio/webm' }) : null); return; }
    r.onstop = () => { stream.current?.getTracks().forEach(t => t.stop()); resolve(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })); };
    r.stop();
  });
  const save = async () => {
    setError(''); setPasscode(pass);
    const session: Session = { id: sessionId.current, at: new Date().toISOString(), participant: participant || 'Participant', durationMs: Date.now() - started.current, notes, tasks: tasks.map(t => records[t.id] ?? { taskId: t.id, status: 'skipped', ms: 0 }) };
    try {
      if (!audioBlob.current) audioBlob.current = await stopAudio();
      const result = await upload(study, session, audioBlob.current, setBusy);
      writePending(readPending().filter(p => p.id !== session.id)); void dropAudio(session.id);
      setStep(n + 1); if (result.notionError) setError(`Saved. Notion said: ${result.notionError}`);
    } catch (e) {
      if (e instanceof NeedsPasscode) setNeedPass(true);
      writePending([...readPending().filter(p => p.id !== session.id), { ...session, studyId: study.id }]);
      if (audioBlob.current) void keepAudio(session.id, audioBlob.current);
      setError(`${e instanceof Error ? e.message : 'Could not save.'} The session is kept on this phone — try Save again.`);
    } finally { setBusy(''); }
  };
  const retryPending = async () => {
    setError(''); setPasscode(pass);
    for (const p of pending) {
      try { const { studyId: _s, ...session } = p; await upload(study, session, await takeAudio(p.id), setBusy); writePending(readPending().filter(x => x.id !== p.id)); void dropAudio(p.id); }
      catch (e) { if (e instanceof NeedsPasscode) setNeedPass(true); setError(e instanceof Error ? e.message : 'Could not save.'); break; }
    }
    setBusy(''); setPending(readPending().filter(p => p.studyId === study.id));
  };

  const elapsed = step >= 0 && step <= n ? fmtMs(now - started.current) : '';
  return <div className={`ss ${embedded ? 'is-embed' : ''}`}>
    <header className="ss-top">
      <span className="ss-title">{study.title}</span>
      {step >= 0 && step <= n && <span className={`ss-rec ${recorder.current ? 'is-on' : ''}`}>{recorder.current ? <i aria-hidden="true" /> : null}{recorder.current ? 'Recording' : 'Not recording'} · {elapsed}</span>}
    </header>
    {step >= 0 && step < n && <div className="ss-progress">{tasks.map((t, i) => <i key={t.id} className={i < step ? (iv ? 'is-success' : `is-${records[t.id]?.status ?? 'skipped'}`) : i === step ? 'is-now' : ''} />)}</div>}
    <AnimatePresence mode="wait">
      <motion.main key={step} className="ss-body" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: .28, ease: [0.22, 1, 0.36, 1] }}>
        {step === -1 && <div className="ss-setup">
          <h1>New session</h1>
          <label className="ss-field"><span>Participant</span><input value={participant} onChange={e => setParticipant(e.target.value)} placeholder="P1, or a first name" autoComplete="off" /></label>
          <label className="ss-check"><input type="checkbox" checked={recordAudio} onChange={e => setRecordAudio(e.target.checked)} /> Record audio for the whole session</label>
          {recordAudio && <label className="ss-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> They agreed to be recorded</label>}
          {study.intro && <details className="ss-script"><summary>Your intro script</summary><p>{study.intro}</p></details>}
          <p className="ss-hint">{iv ? `${n} question${n === 1 ? '' : 's'}. Ask each one, jot the key points, then tap Next question. The recording is split by question so every answer lines up with what you asked.` : `${n} task${n === 1 ? '' : 's'}. Read each task out loud, then tap how it went. Times are measured per task.`}</p>
          <button type="button" className="ss-primary" disabled={!n || (recordAudio && !consent)} onClick={() => void start()}>Start session</button>
          {error && <p className="ss-error" role="alert">{error}</p>}
          {pending.length > 0 && <div className="ss-pending">
            <p className="ss-hint">{pending.length} session{pending.length === 1 ? '' : 's'} on this phone didn’t save yet ({pending.map(p => p.participant).join(', ')}).</p>
            {needPass && <input className="ss-pass" type="password" placeholder="Studio passcode" value={pass} onChange={e => setPass(e.target.value)} aria-label="Studio passcode" />}
            <button type="button" className="ss-ghost" disabled={!!busy} onClick={() => void retryPending()}>{busy || 'Save them now'}</button>
          </div>}
        </div>}
        {task && iv && <div className="ss-task">
          <small>Question {step + 1} of {n} · {fmtMs((rec?.ms ?? 0) + now - taskStart.current)}</small>
          <h2>{task.title}</h2>
          {task.scenario && <p className="ss-success">Follow-up: {task.scenario}</p>}
          <textarea rows={5} placeholder="Key points from their answer, or a line worth quoting" value={rec?.notes ?? ''} onChange={e => setRec({ notes: e.target.value })} />
        </div>}
        {task && !iv && <div className="ss-task">
          <small>Task {step + 1} of {n} · {fmtMs(rec?.ms ?? now - taskStart.current)}</small>
          <h2>{task.title}</h2>
          {task.scenario && <blockquote>{task.scenario}</blockquote>}
          {task.success && <p className="ss-success">Success: {task.success}</p>}
          <div className="ss-outcomes" role="radiogroup" aria-label="How did it go?">
            {(['success', 'help', 'fail'] as const).map(o => <button key={o} type="button" role="radio" aria-checked={rec?.status === o} className={`is-${o} ${rec?.status === o ? 'is-on' : ''}`} onClick={() => choose(o)}>{OUTCOME_LABEL[o]}</button>)}
          </div>
          <div className="ss-tags">{QUICK_TAGS.map(tag => { const on = rec?.tags?.includes(tag); return <button key={tag} type="button" aria-pressed={!!on} onClick={() => setRec({ tags: on ? rec!.tags!.filter(x => x !== tag) : [...(rec?.tags ?? []), tag] })}>{tag}</button>; })}</div>
          <textarea rows={3} placeholder="What did you notice?" value={rec?.notes ?? ''} onChange={e => setRec({ notes: e.target.value })} />
        </div>}
        {step === n && <div className="ss-setup">
          <h1>Wrap up</h1>
          <ul className="ss-summary">{tasks.map(t => <li key={t.id}><span>{t.title}</span>{!iv && <b className={`is-${records[t.id]?.status ?? 'skipped'}`}>{OUTCOME_LABEL[records[t.id]?.status ?? 'skipped']}</b>}<em>{fmtMs(records[t.id]?.ms ?? 0)}</em></li>)}</ul>
          <textarea rows={4} placeholder="Session notes: overall impressions, quotes…" value={notes} onChange={e => setNotes(e.target.value)} />
          {needPass && <input className="ss-pass" type="password" placeholder="Studio passcode" value={pass} onChange={e => setPass(e.target.value)} aria-label="Studio passcode" />}
          <button type="button" className="ss-primary" disabled={!!busy} onClick={() => void save()}>{busy || 'Save session'}</button>
          {error && <p className="ss-error" role="alert">{error}</p>}
        </div>}
        {step === n + 1 && <div className="ss-setup ss-done">
          <span className="rs-check" aria-hidden="true">✓</span><h1>Session saved</h1>
          <p className="ss-hint">{error || 'It’s in your results and Notion.'}</p>
          <button type="button" className="ss-primary" onClick={() => { setStep(-1); setRecords({}); setNotes(''); setParticipant(''); setConsent(false); recorder.current = null; audioBlob.current = null; sessionId.current = crypto.randomUUID(); setError(''); }}>Start another session</button>
          {onDone && <button type="button" className="ss-ghost" onClick={onDone}>Back to results</button>}
        </div>}
      </motion.main>
    </AnimatePresence>
    {task && <footer className="ss-nav">
      <button type="button" className="ss-ghost" onClick={() => { if (iv && task) setRec({ ms: (records[task.id]?.ms ?? 0) + Date.now() - taskStart.current }); taskStart.current = Date.now(); setStep(s => s - 1); }} disabled={step === 0}>Back</button>
      <button type="button" className="ss-primary" onClick={next}>{step === n - 1 ? 'Finish' : iv ? 'Next question' : rec ? 'Next task' : 'Skip task'}</button>
    </footer>}
  </div>;
}

/* #/run/<id> — open this on your phone during a session. */
export default function RunPage({ id }: { id: string }) {
  const [study, setStudy] = useState<Study | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { document.title = 'Run session'; call<{ study: Study }>('get', { id }).then(d => setStudy(d.study), e => setError(e instanceof Error ? e.message : 'Could not open this test.')); }, [id]);
  return <div className="rs-page">{error ? <div className="rs-intro"><h1>Sorry</h1><p>{error}</p></div> : !study ? <div className="rs-loading">Loading…</div> : <SessionRunner study={study} />}</div>;
}
