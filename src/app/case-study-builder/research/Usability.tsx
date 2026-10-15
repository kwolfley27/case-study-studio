import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Mic, Plus, X } from 'lucide-react';
import { SessionRunner } from './SessionRunner';
import { aggregateTasks, call, fmtMs, getPasscode, NeedsPasscode, newTask, OUTCOME_LABEL, setPasscode, type Session, type Study, type Transcript } from './research';
import { transcribe } from './transcribe';
import { taskItems } from '../TaskSuccess';
import { createSection, type CaseStudySection } from '../model';

export const runLink = (id: string) => `${location.origin}${location.pathname}#/run/${id}`;

/* ---------- Build: the tasks you'll ask people to do ---------- */
export function UsabilityBuilder({ study, update }: { study: Study; update: (p: Partial<Study>) => void }) {
  const tasks = study.tasks ?? [];
  const [at, setAt] = useState(0);
  const setT = (i: number, patch: Partial<NonNullable<Study['tasks']>[number]>) => update({ tasks: tasks.map((t, k) => k === i ? { ...t, ...patch } : t) });
  const move = (i: number, j: number) => { const n = [...tasks]; [n[i], n[j]] = [n[j], n[i]]; update({ tasks: n }); setAt(j); };
  const t = tasks[Math.min(at, tasks.length - 1)];
  return <div className="rw-build">
    <div className="rw-editor">
      <label className="rw-field"><span>Test name</span><input value={study.title} onChange={e => update({ title: e.target.value })} /></label>
      <label className="rw-field"><span>Your intro script <small>(only you see this)</small></span><textarea rows={3} value={study.intro ?? ''} placeholder="Thanks for joining. I'm testing the app, not you. Please think out loud as you go…" onChange={e => update({ intro: e.target.value })} /></label>
      <p className="rw-kicker">Tasks · {tasks.length}</p>
      {tasks.map((task, i) => <div key={task.id} className={`rw-q ${at === i ? 'is-on' : ''}`} onFocusCapture={() => setAt(i)} onClick={() => setAt(i)}>
        <div className="rw-q-head">
          <span className="rw-q-num">{i + 1}</span>
          <input className="rw-task-title" value={task.title} aria-label={`Task ${i + 1} name`} placeholder="Short name, e.g. Book a class" onChange={e => setT(i, { title: e.target.value })} />
          <span className="rw-q-tools">
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></button>
            <button type="button" aria-label="Move down" disabled={i === tasks.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></button>
            <button type="button" aria-label="Delete task" onClick={() => update({ tasks: tasks.filter((_, k) => k !== i) })}><X size={13} /></button>
          </span>
        </div>
        <textarea className="rw-prompt" rows={2} value={task.scenario ?? ''} placeholder="What you'll read out: You want to try a yoga class this Friday. Show me how you'd book it." aria-label={`Task ${i + 1} scenario`} onChange={e => setT(i, { scenario: e.target.value })} />
        <label className="rw-inline"><span>Success means</span><input value={task.success ?? ''} placeholder="Reaches the confirmation screen" onChange={e => setT(i, { success: e.target.value })} /></label>
      </div>)}
      <div className="rw-addbar"><button type="button" onClick={() => { update({ tasks: [...tasks, { ...newTask(tasks.length), title: '', scenario: '', success: '' }] }); setAt(tasks.length); }}>+ Add task</button></div>
    </div>
    <div className="rw-preview" aria-label="Phone preview">
      <div className="rw-phone"><div className="ss is-embed is-preview"><header className="ss-top"><span className="ss-title">{study.title}</span><span className="ss-rec is-on"><i aria-hidden="true" />Recording · 2:14</span></header>
        <div className="ss-progress">{tasks.map((x, i) => <i key={x.id} className={i < at ? 'is-success' : i === at ? 'is-now' : ''} />)}</div>
        {t ? <main className="ss-body"><div className="ss-task"><small>Task {at + 1} of {tasks.length} · 0:42</small><h2>{t.title || 'Untitled task'}</h2>{t.scenario && <blockquote>{t.scenario}</blockquote>}{t.success && <p className="ss-success">Success: {t.success}</p>}
          <div className="ss-outcomes">{(['success', 'help', 'fail'] as const).map(o => <button key={o} type="button" tabIndex={-1} className={`is-${o}`}>{OUTCOME_LABEL[o]}</button>)}</div></div></main> : <main className="ss-body"><p className="ss-hint">Add a task.</p></main>}
      </div></div>
      <small>Your screen during the session · on your phone</small>
    </div>
  </div>;
}

/* ---------- Run: save the test, open it on your phone ---------- */
export function UsabilityRun({ study, update, onOpenResults }: { study: Study; update: (p: Partial<Study>) => void; onOpenResults: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [needPass, setNeedPass] = useState(!getPasscode());
  const [pass, setPass] = useState(getPasscode());
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');
  const [here, setHere] = useState(false);
  const link = runLink(study.id);
  useEffect(() => { QRCode.toString(link, { type: 'svg', margin: 0, color: { dark: '#000000', light: '#00000000' } }).then(setQr, () => setQr('')); }, [link]);
  const save = async () => {
    setBusy(true); setNote(null);
    try {
      const { study: saved } = await call<{ study: Study }>('publish', { study }, true);
      update({ published: true, notion: saved.notion });
      setNote(saved.notion?.error ? { text: `Saved. Notion: ${saved.notion.error}`, error: true } : { text: saved.notion?.databaseId ? 'Saved. Each session will be a row in your Notion database.' : 'Saved. Open it on your phone below.' });
    } catch (e) { if (e instanceof NeedsPasscode) setNeedPass(true); setNote({ text: e instanceof Error ? e.message : 'Could not save.', error: true }); }
    finally { setBusy(false); }
  };
  if (here) return <div className="rw-run-here"><div className="rw-laptop-run"><SessionRunner study={study} embedded onDone={() => { setHere(false); onOpenResults(); }} /></div><button type="button" className="csb-quiet-button" onClick={() => setHere(false)}>Close</button></div>;
  return <div className="rw-share">
    <div className="rw-card">
      <h3>1 · Save sessions to Notion <small>(optional)</small></h3>
      <p>Paste a Notion page link. A database named “{study.title} · responses” is made inside it: one row per session, a column per task (Success, With help, Failed), times, your notes, and the transcript inside each row.</p>
      <input className="rw-input" placeholder="https://www.notion.so/…" value={study.notion?.pageUrl ?? ''} onChange={e => update({ notion: { ...study.notion, pageUrl: e.target.value } })} />
      {study.notion?.databaseId && <small className="rw-ok">Connected to a Notion database.</small>}
    </div>
    <div className="rw-card">
      <h3>2 · Save the test</h3>
      <p>Save again whenever you change the tasks.</p>
      {needPass && <input className="rw-input" type="password" placeholder="Studio passcode" value={pass} onChange={e => { setPass(e.target.value); setPasscode(e.target.value); }} aria-label="Studio passcode" />}
      <div className="rw-row"><button type="button" className="csb-primary-button" disabled={busy || !(study.tasks ?? []).length} onClick={() => void save()}>{busy ? 'Saving…' : study.published ? 'Save changes' : 'Save test'}</button></div>
      {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`} role="status">{note.text}</p>}
    </div>
    <div className={`rw-card ${study.published ? '' : 'is-muted'}`}>
      <h3>3 · Run a session</h3>
      <div className="rw-run-choices">
        <div className="rw-run-choice">
          <strong>On this laptop</strong>
          <p>Sit beside them or share your screen on a call. The laptop mic records the room.</p>
          <button type="button" className="csb-primary-button" disabled={!study.published} onClick={() => setHere(true)}>Start a session here</button>
        </div>
        <div className="rw-run-choice">
          <strong>On your phone</strong>
          <div className="rw-qr">
            {qr && <span className="rw-qr-code" aria-label="QR code for the session link" role="img" dangerouslySetInnerHTML={{ __html: qr }} />}
            <p>Scan with your camera, then Share → <b>Add to Home Screen</b> so it opens like an app. Only you use this link; participants never see it.</p>
          </div>
          <div className="rw-link"><input readOnly value={link} aria-label="Session link" onFocus={e => e.target.select()} />
            <button type="button" className="csb-quiet-button" disabled={!study.published} onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy size={13} /> {copied ? 'Copied' : 'Copy'}</button>
            <a className="csb-quiet-button" href={link} target="_blank" rel="noreferrer" aria-disabled={!study.published}><ExternalLink size={13} /> Open</a></div>
        </div>
      </div>
    </div>
  </div>;
}

/* ---------- Results ---------- */
type Picked = { key: string; text: string; who: string };
export function UsabilityResults({ study, onAddSections }: { study: Study; onAddSections: (s: CaseStudySection[], note: string) => void }) {
  const [data, setData] = useState<{ study: Study; sessions: Session[] } | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const load = () => { setError(''); call<{ study: Study; sessions?: Session[] }>('results', { id: study.id }, true).then(d => setData({ study: d.study, sessions: d.sessions ?? [] }), e => setError(e instanceof Error ? e.message : 'Could not load results.')); };
  useEffect(load, [study.id]);
  const s = data?.study ?? study; const sessions = data?.sessions ?? [];
  const results = useMemo(() => aggregateTasks(s, sessions), [data]);
  const attempts = results.reduce((a, r) => a + r.attempts, 0), wins = results.reduce((a, r) => a + r.success, 0);
  const medianSession = sessions.length ? [...sessions].sort((a, b) => a.durationMs - b.durationMs)[Math.floor(sessions.length / 2)].durationMs : 0;
  const togglePick = (p: Picked) => setPicked(m => { const n = { ...m }; if (n[p.key]) delete n[p.key]; else n[p.key] = p; return n; });

  const addRings = () => {
    const sec = { ...createSection('taskSuccess'), title: 'Could people finish the key flows?', eyebrow: 'Testing', items: taskItems(results.slice(0, 6)), taskSource: { studyId: s.id, studyTitle: s.title, taskIds: results.slice(0, 6).map(r => r.task.id), sessions: sessions.length, updatedAt: new Date().toISOString() }, body: `${sessions.length} moderated session${sessions.length === 1 ? '' : 's'}. Each participant tried every task while thinking out loud.` };
    onAddSections([sec], 'Added the task success rings.');
  };
  const addQuotes = () => {
    const chosen = Object.values(picked).slice(0, 6); if (!chosen.length) return;
    const sec = { ...createSection('quotes'), title: 'What we heard in testing', eyebrow: 'Testing', items: chosen.map(q => ({ title: q.who, detail: q.text })) };
    onAddSections([sec], `Added ${chosen.length} quote${chosen.length === 1 ? '' : 's'}.`);
  };
  const setSession = (id: string, patch: Partial<Session>) => setData(d => d && ({ ...d, sessions: d.sessions.map(x => x.id === id ? { ...x, ...patch } : x) }));

  if (error) return <div className="rw-card"><p className="csb-field-note is-error">{error}</p><button type="button" className="csb-quiet-button" onClick={load}>Try again</button></div>;
  if (!data) return <p className="rw-empty">Loading sessions…</p>;
  return <div className="rw-results">
    <div className="rw-stats">
      <div><strong>{sessions.length}</strong><small>Sessions</small></div>
      <div><strong>{attempts ? `${Math.round(wins / attempts * 100)}%` : '—'}</strong><small>Tasks done on their own</small></div>
      <div><strong>{medianSession ? fmtMs(medianSession) : '—'}</strong><small>Median session</small></div>
      <button type="button" className="csb-quiet-button" onClick={load}>Refresh</button>
    </div>
    {!sessions.length ? <p className="rw-empty">No sessions yet. Open the test on your phone from the Run tab.</p> : <>
      <div className="rw-addrow">
        <span>Add to the case study:</span>
        <button type="button" className="csb-quiet-button" onClick={addRings}>Task success rings</button>
        <button type="button" className="csb-quiet-button" disabled={!Object.keys(picked).length} onClick={addQuotes}>Selected quotes{Object.keys(picked).length ? ` (${Object.keys(picked).length})` : ''}</button>
      </div>
      <div className="rw-res">
        <h4>Tasks<small>on their own · with help · failed</small></h4>
        <div className="rw-tasks">{results.map(r => <div key={r.task.id} className="rw-taskrow">
          <span>{r.task.title}</span>
          <i className="rw-stack" aria-label={`${r.success} success, ${r.help} with help, ${r.fail} failed`}>{r.attempts ? <><b className="is-success" style={{ flex: r.success }} /><b className="is-help" style={{ flex: r.help }} /><b className="is-fail" style={{ flex: r.fail }} /></> : null}</i>
          <em>{r.attempts ? `${r.rate}%` : '—'}</em>
          <small>{r.medianMs ? fmtMs(r.medianMs) : ''}</small>
        </div>)}</div>
      </div>
      {[...sessions].reverse().map(ss => <SessionCard key={ss.id} study={s} session={ss} picked={picked} onPick={togglePick} onChange={patch => setSession(ss.id, patch)} />)}
    </>}
  </div>;
}

function SessionCard({ study, session, picked, onPick, onChange }: { study: Study; session: Session; picked: Record<string, Picked>; onPick: (p: Picked) => void; onChange: (p: Partial<Session>) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [open, setOpen] = useState(false);
  const seek = (t: number) => { if (audio.current) { audio.current.currentTime = t; void audio.current.play(); } };
  return <div className="rw-res rw-session">
    <h4><span>{session.participant}</span><small>{new Date(session.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {fmtMs(session.durationMs)}</small></h4>
    <div className="rw-chips">{(study.tasks ?? []).map(t => { const r = session.tasks.find(x => x.taskId === t.id); return <span key={t.id} className={`is-${r?.status ?? 'skipped'}`} title={OUTCOME_LABEL[r?.status ?? 'skipped']}>{t.title}{r?.ms ? ` · ${fmtMs(r.ms)}` : ''}</span>; })}</div>
    {session.audioUrl && <audio ref={audio} controls preload="none" src={session.audioUrl} />}
    {(session.notes || session.tasks.some(t => t.notes || t.tags?.length)) && <button type="button" className="csb-link-button" onClick={() => setOpen(o => !o)}>{open ? 'Hide notes' : 'Show notes'}</button>}
    {open && <ul className="rw-quotes">
      {session.notes && <li><strong>Session</strong> {session.notes}</li>}
      {session.tasks.filter(t => t.notes || t.tags?.length).map(t => { const task = study.tasks?.find(x => x.id === t.taskId); const key = `${session.id}-n-${t.taskId}`; return <li key={t.taskId}><label><input type="checkbox" checked={!!picked[key]} disabled={!t.notes} onChange={() => onPick({ key, text: t.notes || '', who: session.participant })} /> <span><strong>{task?.title}</strong>{t.tags?.length ? <em> [{t.tags.join(', ')}]</em> : null} {t.notes}</span></label></li>; })}
    </ul>}
    {session.audioUrl && <TranscriptBlock study={study} session={session} picked={picked} onPick={onPick} onSeek={seek} onChange={onChange} />}
  </div>;
}

function TranscriptBlock({ study, session, picked, onPick, onSeek, onChange }: { study: Study; session: Session; picked: Record<string, Picked>; onPick: (p: Picked) => void; onSeek: (t: number) => void; onChange: (p: Partial<Session>) => void }) {
  const [t, setT] = useState<Transcript | null>(session.transcript ?? null);
  const [progress, setProgress] = useState<{ stage: string; pct: number } | null>(null);
  const [speakers, setSpeakers] = useState(2);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [show, setShow] = useState(false);
  const cancel = useRef<() => void>(() => undefined);
  useEffect(() => () => cancel.current(), []);
  const save = async (next: Transcript, toNotion = true) => {
    try { const r = await call<{ notionError?: string }>('transcript', { id: study.id, sessionId: session.id, transcript: next, toNotion }, true); onChange({ transcript: next }); setDirty(false); setNote(r.notionError ? { text: `Saved here. Notion: ${r.notionError}`, error: true } : { text: toNotion && study.notion?.databaseId ? 'Saved, and added to the Notion row.' : 'Saved.' }); }
    catch (e) { setNote({ text: e instanceof Error ? e.message : 'Could not save the transcript.', error: true }); }
  };
  const run = async () => {
    if (!session.audioUrl) return; setNote(null); setShow(true);
    const job = transcribe(session.audioUrl, { speakers, onProgress: (stage, pct) => setProgress({ stage, pct }), onPartial: segs => setT({ at: '', speakers: ['You', session.participant], segments: segs }), onWarn: m => setNote({ text: m, error: true }) });
    cancel.current = job.cancel;
    try { const segments = await job.promise; const next: Transcript = { at: new Date().toISOString(), speakers: speakers > 1 ? ['You', session.participant, ...Array.from({ length: speakers - 2 }, (_, i) => `Speaker ${i + 3}`)] : [session.participant], segments }; setT(next); setProgress(null); await save(next); }
    catch (e) { setProgress(null); setNote({ text: e instanceof Error ? e.message : 'Transcription failed.', error: true }); }
  };
  const edit = (next: Transcript) => { setT(next); setDirty(true); };
  if (!t && !progress) return <div className="rw-transcribe">
    <button type="button" className="csb-quiet-button" onClick={() => void run()}><Mic size={13} /> Transcribe</button>
    <label>Voices <select value={speakers} onChange={e => setSpeakers(Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
    <small>Free and private: runs in this browser. The first time downloads about 200 MB of models. Fastest in Chrome on a laptop.</small>
    {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`}>{note.text}</p>}
  </div>;
  return <div className="rw-transcript">
    <div className="rw-transcript-head">
      <button type="button" className="csb-link-button" onClick={() => setShow(v => !v)}>{show ? 'Hide transcript' : `Transcript · ${t?.segments.length ?? 0} lines`}</button>
      {progress && <span className="rw-progress"><i style={{ width: `${progress.pct}%` }} />{progress.stage}… {progress.pct}%</span>}
      {t && !progress && <span className="rw-speakers">{t.speakers.map((name, i) => <input key={i} className={`is-s${i}`} value={name} aria-label={`Speaker ${i + 1} name`} onChange={e => edit({ ...t, speakers: t.speakers.map((x, k) => k === i ? e.target.value : x) })} />)}</span>}
      {dirty && <button type="button" className="csb-quiet-button" onClick={() => t && void save(t, false)}>Save changes</button>}
    </div>
    {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`}>{note.text}</p>}
    {show && t && <ol className="rw-lines">{t.segments.map((seg, i) => { const key = `${session.id}-t-${i}`; const who = t.speakers[seg.spk] ?? `Speaker ${seg.spk + 1}`; return <li key={i}>
      <button type="button" className="rw-time" onClick={() => onSeek(seg.s)} aria-label={`Play from ${fmtMs(seg.s * 1000)}`}>{fmtMs(seg.s * 1000)}</button>
      <button type="button" className={`rw-who is-s${seg.spk}`} title="Wrong speaker? Tap to switch" disabled={!!progress || t.speakers.length < 2} onClick={() => edit({ ...t, segments: t.segments.map((x, k) => k === i ? { ...x, spk: (x.spk + 1) % t.speakers.length } : x) })}>{who}</button>
      <span>{seg.text}</span>
      <label className="rw-pick" title="Use as a quote"><input type="checkbox" checked={!!picked[key]} onChange={() => onPick({ key, text: seg.text, who })} /><span className="csb-sr-only">Use as a quote</span></label>
    </li>; })}</ol>}
    {t && !progress && <button type="button" className="csb-link-button" onClick={() => { if (window.confirm('Transcribe this recording again? Your edits to this transcript will be replaced.')) { setT(null); void run(); } }}>Transcribe again</button>}
  </div>;
}
