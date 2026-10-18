import { useContext, useEffect, useRef, useState } from 'react';
import { Pause, Play, Plus, RotateCcw, Star, Trash2, Upload } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { useReducedMotion } from './MotionKit';
import { StudyMeta } from './StudyMeta';
import type { CaseStudySection } from './model';

/*
  Recorded flows: the same task, recorded in each app, playing side by side.
  Upload a screen recording (MP4 or MOV) per app. On the page it plays like a GIF (silent, looping, no
  controls) but stays a light video. The studio finds each new screen in the recording, so every app gets a
  time and a screen count, and AI names the screens. "Play together" races them from the start.
*/
export type RaceStep = { label: string; at: number; pain?: boolean; note?: string };
export type RaceApp = { id: string; name: string; video?: string; duration?: number; steps?: RaceStep[]; ours?: boolean };
export type FlowRaceData = { task: string; apps: RaceApp[] };

const rid = () => crypto.randomUUID().slice(0, 8);
export const defaultFlowRace = (): FlowRaceData => ({
  task: 'Log a meal',
  apps: [{ id: rid(), name: 'Competitor 1' }, { id: rid(), name: 'Competitor 2' }, { id: rid(), name: 'Competitor 3' }, { id: rid(), name: 'Our design', ours: true }],
});
const fmt = (s?: number) => s === undefined || !isFinite(s) ? '–' : s < 60 ? `${s < 10 ? s.toFixed(1) : Math.round(s)}s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const LIMIT = 50e6;

type Status = { text: string; error?: boolean };

export function FlowRace({ section, editorMode }: { section: CaseStudySection; editorMode: boolean }) {
  const data = section.flowRace ?? defaultFlowRace();
  const { edit } = useContext(EditingContext);
  const { slug } = useContext(StudyMeta);
  const reduce = useReducedMotion();
  const save = (next: FlowRaceData) => edit?.('json:flowRace', JSON.stringify(next));
  const setApp = (id: string, patch: Partial<RaceApp>) => save({ ...data, apps: data.apps.map(a => a.id === id ? { ...a, ...patch } : a) });
  const latest = useRef(data); latest.current = data;
  const vids = useRef(new Map<string, HTMLVideoElement>());
  const box = useRef<HTMLDivElement>(null);
  const [racing, setRacing] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [inView, setInView] = useState(false);

  // Like a GIF: loop quietly while on screen (not with reduced motion), pause when scrolled away.
  useEffect(() => { const el = box.current; if (!el) return; const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: .2 }); io.observe(el); return () => io.disconnect(); }, []);
  useEffect(() => { if (racing !== null) return; vids.current.forEach(v => { v.loop = true; if (inView && !reduce) void v.play().catch(() => undefined); else v.pause(); }); }, [inView, reduce, racing, data.apps.map(a => a.video).join()]);

  // Play together: everyone starts at 0; each stops on its last screen; then back to looping.
  const race = () => {
    const list = [...vids.current.entries()].filter(([, v]) => v.src);
    if (!list.length) return;
    setDone({}); const start = performance.now(); setRacing(start);
    list.forEach(([id, v]) => { v.loop = false; v.currentTime = 0; v.onended = () => setDone(d => ({ ...d, [id]: v.duration })); void v.play().catch(() => undefined); });
  };
  const stop = () => { setRacing(null); vids.current.forEach(v => { v.onended = null; }); };
  useEffect(() => {
    if (racing === null) return; let raf = 0;
    const tick = () => { setNow((performance.now() - racing) / 1000); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [racing]);
  const withVideo = data.apps.filter(a => a.video);
  useEffect(() => { if (racing === null || !withVideo.length) return; if (withVideo.every(a => done[a.id] !== undefined)) { const t = setTimeout(stop, 2400); return () => clearTimeout(t); } }, [done, racing]);

  const seek = (id: string, at: number) => { const v = vids.current.get(id); if (!v) return; stop(); v.currentTime = at / 1000; v.pause(); };

  const upload = async (app: RaceApp, file: File) => {
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) { setStatus(s => ({ ...s, [app.id]: { text: 'That isn’t a video. Use an MP4 or MOV screen recording.', error: true } })); return; }
    if (file.size > LIMIT) { setStatus(s => ({ ...s, [app.id]: { text: `That recording is ${(file.size / 1e6).toFixed(0)} MB; the limit is 50 MB. Trim it to just the task, or record at a lower resolution.`, error: true } })); return; }
    const say = (text: string, error = false) => setStatus(s => ({ ...s, [app.id]: { text, error } }));
    say('Uploading…');
    try {
      const [{ uploadToStudio }, rec] = await Promise.all([import('./media'), import('./FlowRecorder')]);
      const durationP = new Promise<number>(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res(v.duration); v.onerror = () => res(NaN); v.src = URL.createObjectURL(file); });
      const url = await uploadToStudio(file, slug || 'flows', p => say(`Uploading… ${Math.round(p * 100)}%`));
      const duration = await durationP;
      const cur = () => latest.current.apps.find(a => a.id === app.id) ?? app;
      const put = (patch: Partial<RaceApp>) => save({ ...latest.current, apps: latest.current.apps.map(a => a.id === app.id ? { ...a, ...patch } : a) });
      put({ video: url, duration: isFinite(duration) ? duration : undefined, steps: [] });
      say('Finding each screen…');
      const frames = await rec.framesFromVideo(file, p => say(`Finding each screen… ${Math.round(p * 100)}%`));
      let steps: RaceStep[] = frames.map((f, i) => ({ label: `Screen ${i + 1}`, at: f.at ?? 0 }));
      put({ steps });
      say('Naming the screens…');
      const named = await rec.nameScreensAI(frames.map(f => f.image!).filter(Boolean), `${cur().name} · ${latest.current.task}`);
      if (named) { steps = frames.map((f, i) => ({ f, a: named[i] })).filter(x => x.a?.keep !== false).map(({ f, a }, i) => ({ label: a?.label || `Screen ${i + 1}`, at: f.at ?? 0 })); put({ steps }); }
      say(named ? '' : 'Screens found. Click a name under the video to rename it.');
      if (named) setStatus(s => { const n = { ...s }; delete n[app.id]; return n; });
    } catch (e) { say(e instanceof Error ? e.message : 'Upload failed. Try again.', true); }
  };

  // Summary line under the row.
  const timed = data.apps.filter(a => a.video && a.duration);
  const ours = timed.find(a => a.ours); const others = timed.filter(a => !a.ours);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const summary = ours && others.length ? (() => {
    const t = avg(others.map(a => a.duration!)); const n = avg(others.map(a => a.steps?.length ?? 0));
    const faster = Math.round((1 - ours.duration! / t) * 100);
    return <><b>{ours.name}</b> takes <b>{fmt(ours.duration)}</b>{ours.steps?.length ? <> and <b>{ours.steps.length}</b> screens</> : null}, against an average of <b>{fmt(t)}</b>{n ? <> and <b>{Number.isInteger(n) ? n : n.toFixed(1)}</b> screens</> : null}{faster > 0 ? <> · {faster}% faster</> : null}</>;
  })() : timed.length > 1 ? (() => { const s = [...timed].sort((a, b) => a.duration! - b.duration!); return <>Fastest: <b>{s[0].name}</b>, {fmt(s[0].duration)}. Slowest: <b>{s[s.length - 1].name}</b>, {fmt(s[s.length - 1].duration)}.</>; })() : null;
  const pains = data.apps.reduce((n, a) => n + (a.steps?.filter(s => s.pain).length ?? 0), 0);

  return <div ref={box} className="csb-race" style={{ '--race-n': Math.max(2, data.apps.length) } as React.CSSProperties}>
    <div className="csb-race-bar">
      <p className="csb-race-task"><small>Task</small><span><EditableText field="deep:flowRace.task" value={data.task} /></span></p>
      {withVideo.length > 0 && (racing === null
        ? <button type="button" className="csb-race-play" onClick={race}><Play size={14} fill="currentColor" />Play together</button>
        : <button type="button" className="csb-race-play" onClick={stop}><Pause size={14} fill="currentColor" />Stop</button>)}
    </div>
    <div className="csb-race-row">
      {data.apps.map((app, i) => {
        const st = status[app.id]; const finished = done[app.id];
        const t = racing !== null && app.video ? Math.min(now, finished ?? app.duration ?? now) : null;
        return <figure key={app.id} className={`csb-race-app ${app.ours ? 'is-ours' : ''} ${finished !== undefined ? 'is-done' : ''}`}>
          <div className="csb-race-phone" onDragOver={editorMode ? e => e.preventDefault() : undefined} onDrop={editorMode ? e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) void upload(app, f); } : undefined} data-no-slot>
            {app.video ? <video ref={el => { if (el) vids.current.set(app.id, el); else vids.current.delete(app.id); }} src={app.video} muted playsInline preload="metadata" aria-label={`${app.name}: ${data.task}`} />
              : editorMode ? <label className="csb-race-drop"><Upload size={18} strokeWidth={1.6} /><b>Drop a screen recording</b><span>MP4 or MOV, up to 50 MB</span><input type="file" accept="video/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(app, f); }} /></label>
              : <span className="csb-race-empty" />}
            {t !== null && <span className="csb-race-clock">{finished !== undefined ? `Done · ${fmt(finished)}` : fmt(t)}</span>}
            {st && <span className={`csb-race-status ${st.error ? 'is-error' : ''}`} role="status">{st.text}</span>}
          </div>
          <figcaption>
            <strong><EditableText field={`deep:flowRace.apps.${i}.name`} value={app.name} />{app.ours && <i>Ours</i>}</strong>
            <span className="csb-race-stats">{app.video ? <>{fmt(app.duration)}{app.steps?.length ? ` · ${app.steps.length} screens` : ''}</> : editorMode ? 'No recording yet' : ''}</span>
            {!!app.steps?.length && <ol className="csb-race-steps">{app.steps.map((s, k) => <li key={k} className={s.pain ? 'is-pain' : ''}>
              <button type="button" className="csb-race-step" onClick={() => seek(app.id, s.at)} title={s.pain && s.note ? s.note : 'Show this screen'}><em>{k + 1}</em><span><EditableText field={`deep:flowRace.apps.${i}.steps.${k}.label`} value={s.label} /></span></button>
              {editorMode && <button type="button" className="csb-race-pain" aria-pressed={!!s.pain} title={s.pain ? 'Friction point (click to clear)' : 'Mark as a friction point'} onClick={() => setApp(app.id, { steps: app.steps!.map((x, j) => j === k ? { ...x, pain: !x.pain } : x) })} />}
              {s.pain && (editorMode || s.note) && <small><EditableText field={`deep:flowRace.apps.${i}.steps.${k}.note`} value={s.note || ''} /></small>}
            </li>)}</ol>}
            {editorMode && <span className="csb-race-tools">
              {app.video && <label title="Replace the recording"><RotateCcw size={13} /><input type="file" accept="video/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(app, f); }} /></label>}
              <button type="button" aria-pressed={!!app.ours} title={app.ours ? 'This is your design' : 'Mark as your design'} onClick={() => save({ ...data, apps: data.apps.map(a => ({ ...a, ours: a.id === app.id ? !a.ours : false })) })}><Star size={13} /></button>
              {data.apps.length > 2 && <button type="button" title="Remove this app" onClick={() => save({ ...data, apps: data.apps.filter(a => a.id !== app.id) })}><Trash2 size={13} /></button>}
            </span>}
          </figcaption>
        </figure>;
      })}
      {editorMode && data.apps.length < 5 && <button type="button" className="csb-race-add" onClick={() => save({ ...data, apps: [...data.apps, { id: rid(), name: `Competitor ${data.apps.length}` }] })}><Plus size={16} />Add an app</button>}
    </div>
    {(summary || pains > 0 || editorMode) && <div className="csb-race-sum">
      {summary && <p>{summary}</p>}
      {pains > 0 && <p className="csb-race-sum-pain"><i aria-hidden="true" />{pains} friction {pains === 1 ? 'point' : 'points'} marked. Click a screen name to jump to it.</p>}
      {editorMode && !summary && <p className="csb-race-hint">Record the same task in each app (on iPhone: Control Center → Screen Recording), trim it to just the task, and drop it on its phone. Mark your own design with the star.</p>}
    </div>}
  </div>;
}
