import { IPhone } from './IPhone';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Maximize2, Film, Images, LayoutGrid, Pause, Play, Plus, RefreshCw, RotateCcw, Star, Trash2, Upload, X } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { useReducedMotion } from './MotionKit';
import { StudyMeta } from './StudyMeta';
import type { CaseStudySection } from './model';

/*
  Recorded flows: core tasks (flows), each recorded in every app, playing side by side.
  · One tab per flow ("Log a meal", "Fix an estimate"…), each with its own colour.
  · Upload a screen recording (MP4 or MOV) per app. On the page it plays like a GIF but stays a light video.
  · The studio finds every new screen in the recording and keeps a picture of it (the reference), so each
    app gets a time and a screen count, and AI names the screens.
  · Pause on a screen and click it to drop a numbered note. Notes appear on that screen while it plays.
  · "Screens" shows every saved screen as a contact sheet, tagged with the colour of its flow.
  · "Play together" races all apps in a flow from the start.
*/
export type RacePin = { id: string; x: number; y: number; text: string; title?: string };
export type RaceStep = { label: string; at: number; pain?: boolean; note?: string; thumb?: string; pins?: RacePin[] };
export type RaceApp = { id: string; name: string; video?: string; duration?: number; steps?: RaceStep[]; ours?: boolean };
export type RaceFlow = { id: string; name: string; apps: RaceApp[] };
export type FlowRaceData = { flows?: RaceFlow[]; view?: 'play' | 'screens'; /** older single-flow shape */ task?: string; apps?: RaceApp[] };

const rid = () => crypto.randomUUID().slice(0, 8);
/* Every flow uses the case study's accent colour (no rainbow of flow colours). */
export const FLOW_COLORS = ['var(--csb-accent)'];
const APPS = ['Competitor 1', 'Competitor 2', 'Competitor 3'];
export const defaultFlowRace = (): FlowRaceData => ({ flows: [{ id: rid(), name: 'Log a meal', apps: [...APPS.map(name => ({ id: rid(), name })), { id: rid(), name: 'Our design', ours: true }] }] });
export const flowsOf = (d?: FlowRaceData): RaceFlow[] => d?.flows?.length ? d.flows : [{ id: 'f1', name: d?.task || 'Log a meal', apps: d?.apps?.length ? d.apps : defaultFlowRace().flows![0].apps }];
const fmt = (s?: number) => s === undefined || !isFinite(s) ? '–' : s < 60 ? `${s < 10 ? s.toFixed(1) : Math.round(s)}s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const DWELL = 1600; // spacing used for screenshot steps (they don't play; visitors step through them)
const shotsOf = (a: RaceApp) => !a.video && !!a.steps?.some(s => s.thumb);
const LIMIT = 50e6; // the storage plan's limit per file
const SHRINK_OVER = 12e6;
const stepAt = (steps: RaceStep[] | undefined, ms: number) => { if (!steps?.length) return -1; let k = 0; for (let i = 0; i < steps.length; i++) if (steps[i].at <= ms + 60) k = i; return k; };

type Status = { text: string; error?: boolean };

export function FlowRace({ section, editorMode }: { section: CaseStudySection; editorMode: boolean }) {
  const flows = flowsOf(section.flowRace);
  const savedView = section.flowRace?.view ?? 'play';
  const [viewHere, setViewHere] = useState<'play' | 'screens' | null>(null);
  const view = viewHere ?? savedView;
  const { edit } = useContext(EditingContext);
  const { slug } = useContext(StudyMeta);
  const reduce = useReducedMotion();
  const [fi, setFi] = useState(0);
  const f = Math.min(fi, flows.length - 1); const flow = flows[f]; const color = FLOW_COLORS[f % FLOW_COLORS.length];
  const latest = useRef(flows); latest.current = flows;
  const save = (next: RaceFlow[], extra?: Partial<FlowRaceData>) => edit?.('json:flowRace', JSON.stringify({ flows: next, view: savedView, ...extra }));
  const pickView = (v: 'play' | 'screens') => { setViewHere(v); if (edit) save(latest.current, { view: v }); };
  // Sections made with the first version (one task) move to flows, so notes and names can be edited.
  useEffect(() => { if (edit && !section.flowRace?.flows?.length) save(flows); }, []);
  const putApp = (flowId: string, appId: string, patch: Partial<RaceApp> | ((a: RaceApp) => Partial<RaceApp>)) => save(latest.current.map(fl => fl.id !== flowId ? fl : { ...fl, apps: fl.apps.map(a => a.id === appId ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) } : a) }));
  const base = `deep:flowRace.flows.${f}`;
  // Renaming an app renames it in every flow (it's the same app).
  const renameAll = (from: string, to: string) => save(latest.current.map(fl => ({ ...fl, apps: fl.apps.map(a => a.name === from ? { ...a, name: to } : a) })));
  const rename = (id: string, from: string, to: string) => save(latest.current.map(fl => ({ ...fl, apps: fl.apps.map(a => a.id === id || a.name === from ? { ...a, name: to } : a) })));

  const vids = useRef(new Map<string, HTMLVideoElement>());
  const box = useRef<HTMLDivElement>(null);
  const [racing, setRacing] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [inView, setInView] = useState(false);
  const [times, setTimes] = useState<Record<string, number>>({});           // current time (ms) per app, for notes
  const [paused, setPaused] = useState<Record<string, number>>({});         // apps held on one screen (its index)
  const [screensFlow, setScreensFlow] = useState<'all' | number>('all');
  const [focus, setFocus] = useState<{ appId: string; k: number } | null>(null);

  useEffect(() => { const el = box.current; if (!el) return; const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: .2 }); io.observe(el); return () => io.disconnect(); }, []);
  // Like a GIF: loop quietly while on screen (not with reduced motion). Held apps stay put.
  useEffect(() => { if (racing !== null || view !== 'play') return; vids.current.forEach((v, id) => { v.loop = true; if (inView && !reduce && paused[id] === undefined) void v.play().catch(() => undefined); else v.pause(); }); }, [inView, reduce, racing, view, f, paused, flow.apps.map(a => a.video).join()]);
  // Follow each video's time so notes show on the right screen.
  useEffect(() => { let raf = 0; const tick = () => { const t: Record<string, number> = {}; vids.current.forEach((v, id) => { t[id] = Math.round(v.currentTime * 1000); }); setTimes(prev => Object.keys(t).some(k => Math.abs((prev[k] ?? -1) - t[k]) > 80) ? t : prev); if (racing !== null) setNow((performance.now() - racing) / 1000); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [racing, f, view]);
  useEffect(() => { setRacing(null); setDone({}); setPaused({}); }, [f]);
  const openFocus = (appId: string, k: number) => { stop(); vids.current.forEach(v => v.pause()); setFocus({ appId, k }); };

  const race = () => {
    const list = [...vids.current.entries()].filter(([, v]) => v.src); if (!list.length) return;
    setDone({}); setPaused({}); setRacing(performance.now());
    list.forEach(([id, v]) => { v.loop = false; v.currentTime = 0; v.onended = () => setDone(d => ({ ...d, [id]: v.duration })); void v.play().catch(() => undefined); });
  };
  const stop = () => { setRacing(null); vids.current.forEach(v => { v.onended = null; }); };
  const withVideo = flow.apps.filter(a => a.video);
  useEffect(() => { if (racing === null || !withVideo.length) return; if (withVideo.every(a => done[a.id] !== undefined)) { const t = setTimeout(stop, 2400); return () => clearTimeout(t); } }, [done, racing]);
  const hold = (id: string, k: number, at: number) => { const v = vids.current.get(id); if (!v) { setPaused(p => ({ ...p, [id]: k })); return; } stop(); v.pause(); v.currentTime = at / 1000 + .05; setPaused(p => ({ ...p, [id]: k })); };
  const resume = (id: string) => { setPaused(p => { const n = { ...p }; delete n[id]; return n; }); };

  /* Screens: find each new screen in the video, keep its picture, and let AI name them. */
  const analyse = async (flowId: string, app: RaceApp, file: File, say: (t: string, e?: boolean) => void) => {
    const rec = await import('./FlowRecorder');
    say('Finding each screen…');
    const frames = await rec.framesFromVideo(file, p => say(`Finding each screen… ${Math.round(p * 100)}%`));
    const keepPins = (k: number) => app.steps?.[k]?.pins;
    let steps: RaceStep[] = frames.map((fr, i) => ({ label: `Screen ${i + 1}`, at: fr.at ?? 0, thumb: fr.image, ...(keepPins(i) ? { pins: keepPins(i) } : {}) }));
    putApp(flowId, app.id, { steps });
    say('Naming the screens…');
    const flowName = latest.current.find(x => x.id === flowId)?.name ?? '';
    const named = await rec.nameScreensAI(frames.map(fr => fr.image!).filter(Boolean), `${app.name} · ${flowName}`);
    if (named) { steps = steps.map((s, i) => ({ s, a: named[i] })).filter(x => x.a?.keep !== false).map(({ s, a }) => ({ ...s, label: a?.label || s.label })); putApp(flowId, app.id, { steps }); }
    return !!named;
  };
  /* Screenshots, one per step: they become the steps, in order, and play through like a GIF. */
  const uploadShots = async (app: RaceApp, files: File[]) => {
    const flowId = flow.id;
    const say = (text: string, error = false) => setStatus(s => ({ ...s, [app.id]: { text, error } }));
    try {
      const [{ compressIntoDraft }, { toJpeg }, rec] = await Promise.all([import('./ImageSlots'), import('./Built'), import('./FlowRecorder')]);
      const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.lastModified - b.lastModified);
      const thumbs: string[] = [];
      for (let n = 0; n < sorted.length; n++) { say(`Adding screenshots… ${n + 1} of ${sorted.length}`); thumbs.push(await compressIntoDraft(sorted[n], 600_000, 900)); }
      let steps: RaceStep[] = thumbs.map((thumb, n) => ({ label: `Screen ${n + 1}`, at: n * DWELL, thumb }));
      putApp(flowId, app.id, { video: undefined, duration: undefined, steps });
      say('Naming the screens…');
      const small = await Promise.all(thumbs.map(t => toJpeg(t, 560)));
      const named = await rec.nameScreensAI(small, `${app.name} · ${latest.current.find(x => x.id === flowId)?.name ?? ''}`);
      if (named) { steps = steps.map((st, n) => ({ ...st, label: named[n]?.label || st.label })); putApp(flowId, app.id, { steps }); }
      setStatus(s => { const n = { ...s }; delete n[app.id]; return n; });
    } catch (e) { say(e instanceof Error ? e.message : 'Couldn’t add those screenshots.', true); }
  };
  const take = (app: RaceApp, list: FileList | File[] | null | undefined) => {
    const files = [...(list ?? [])]; if (!files.length) return;
    const images = files.filter(fl => /^image\//.test(fl.type) && !/gif/.test(fl.type));
    if (images.length === files.length) { void uploadShots(app, images); return; }
    void upload(app, files.find(fl => /^video\//.test(fl.type) || /\.(mp4|mov|m4v|webm)$/i.test(fl.name)) ?? files[0]);
  };
  const gif = async (app: RaceApp) => {
    const say = (text: string, error = false) => setStatus(s => ({ ...s, [app.id]: { text, error } }));
    try {
      say('Making the GIF…');
      const { screensToGif } = await import('./gif');
      const blob = await screensToGif(app.steps!.filter(st => st.thumb).map(st => ({ src: st.thumb!, pins: st.pins })), { color: (box.current && getComputedStyle(box.current).getPropertyValue('--csb-accent').trim()) || '#1c1917' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${app.name} - ${flow.name}.gif`.replace(/[\\/:*?"<>|]+/g, ''); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setStatus(s => { const n = { ...s }; delete n[app.id]; return n; });
    } catch (e) { say(e instanceof Error ? e.message : 'Couldn’t make the GIF.', true); }
  };
  const upload = async (app: RaceApp, file: File) => {
    const flowId = flow.id;
    const say = (text: string, error = false) => setStatus(s => ({ ...s, [app.id]: { text, error } }));
    const clear = () => setStatus(s => { const n = { ...s }; delete n[app.id]; return n; });
    if (/\.gif$/i.test(file.name) || file.type === 'image/gif') { say('Use the screen recording itself (MP4 or MOV). It plays like a GIF on the page, and the studio can find and save each screen.', true); return; }
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) { say('That isn’t a video. Use an MP4 or MOV screen recording.', true); return; }
    try {
      const { uploadToStudio } = await import('./media');
      const durationP = new Promise<number>(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res(v.duration); v.onerror = () => res(NaN); v.src = URL.createObjectURL(file); });
      // Big or HEVC recordings are shrunk to a light, plays-everywhere MP4 first (the original is used to find the screens).
      let web: File = file;
      if (file.size > SHRINK_OVER || /quicktime|hevc/i.test(file.type) || /\.mov$/i.test(file.name)) {
        say('Shrinking for the web… keep this tab open');
        try { const { shrinkVideo } = await import('./shrinkVideo'); const small = await shrinkVideo(file, p => say(`Shrinking for the web… ${Math.round(p * 100)}% · keep this tab open`)); if (small.size < file.size) web = small; }
        catch (e) { if (file.size > LIMIT) throw e; }
      }
      if (web.size > LIMIT) { say(`Even shrunk, that recording is ${(web.size / 1e6).toFixed(0)} MB (the limit is 50 MB). Trim it to just the task first (Photos → Edit).`, true); return; }
      say('Uploading…');
      const url = await uploadToStudio(web, slug || 'flows', p => say(`Uploading… ${Math.round(p * 100)}%`));
      const duration = await durationP;
      putApp(flowId, app.id, { video: url, duration: isFinite(duration) ? duration : undefined, steps: [] });
      const ok = await analyse(flowId, { ...app, steps: [] }, file, say);
      if (ok) clear(); else say('Screens found. Click a name under the video to rename it.');
    } catch (e) { say(e instanceof Error ? e.message : 'Upload failed. Try again.', true); }
  };
  const reanalyse = async (app: RaceApp) => {
    const say = (text: string, error = false) => setStatus(s => ({ ...s, [app.id]: { text, error } }));
    try { const blob = await (await fetch(app.video!)).blob(); const ok = await analyse(flow.id, app, new File([blob], 'recording.mp4', { type: blob.type || 'video/mp4' }), say); if (ok) setStatus(s => { const n = { ...s }; delete n[app.id]; return n; }); else say('Screens found.'); }
    catch (e) { say(e instanceof Error ? e.message : 'Couldn’t read that recording.', true); }
  };

  /* Notes: click a held screen to drop one; drag to move. */
  const addPin = (app: RaceApp, k: number, e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pin: RacePin = { id: rid(), x: Math.round((e.clientX - r.left) / r.width * 1000) / 10, y: Math.round((e.clientY - r.top) / r.height * 1000) / 10, title: 'Label', text: 'Explain what happens here.' };
    putApp(flow.id, app.id, a => ({ steps: a.steps!.map((s, j) => j === k ? { ...s, pins: [...(s.pins ?? []), pin] } : s) }));
  };
  const movePin = (app: RaceApp, k: number, pinId: string, x: number, y: number) => putApp(flow.id, app.id, a => ({ steps: a.steps!.map((s, j) => j === k ? { ...s, pins: s.pins!.map(p => p.id === pinId ? { ...p, x, y } : p) } : s) }));
  const dropPin = (app: RaceApp, k: number, pinId: string) => putApp(flow.id, app.id, a => ({ steps: a.steps!.map((s, j) => j === k ? { ...s, pins: s.pins!.filter(p => p.id !== pinId) } : s) }));
  const dragPin = (app: RaceApp, k: number, pin: RacePin, e: React.PointerEvent) => {
    if (!editorMode) return; e.stopPropagation(); e.preventDefault();
    const layer = (e.currentTarget as HTMLElement).parentElement!; const r = layer.getBoundingClientRect(); let moved = false; let x = pin.x, y = pin.y;
    const el = e.currentTarget as HTMLElement;
    const mv = (ev: PointerEvent) => { moved = true; x = Math.max(2, Math.min(98, (ev.clientX - r.left) / r.width * 100)); y = Math.max(2, Math.min(98, (ev.clientY - r.top) / r.height * 100)); el.style.left = `${x}%`; el.style.top = `${y}%`; };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) movePin(app, k, pin.id, Math.round(x * 10) / 10, Math.round(y * 10) / 10); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  // Summary under the row.
  const counted = flow.apps.filter(a => (a.video || shotsOf(a)) && a.steps?.length);
  const byScreens = flow.apps.some(shotsOf);
  const timed = byScreens ? [] : flow.apps.filter(a => a.video && a.duration);
  const ours = timed.find(a => a.ours); const others = timed.filter(a => !a.ours);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const summary = ours && others.length ? (() => {
    const t = avg(others.map(a => a.duration!)); const n = avg(others.map(a => a.steps?.length ?? 0));
    const faster = Math.round((1 - ours.duration! / t) * 100);
    return <><b>{ours.name}</b> takes <b>{fmt(ours.duration)}</b>{ours.steps?.length ? <> and <b>{ours.steps.length}</b> screens</> : null}, against an average of <b>{fmt(t)}</b>{n ? <> and <b>{Number.isInteger(n) ? n : n.toFixed(1)}</b> screens</> : null}{faster > 0 ? <> · {faster}% faster</> : null}</>;
  })() : timed.length > 1 ? (() => { const s = [...timed].sort((a, b) => a.duration! - b.duration!); return <>Fastest: <b>{s[0].name}</b>, {fmt(s[0].duration)}. Slowest: <b>{s[s.length - 1].name}</b>, {fmt(s[s.length - 1].duration)}.</>; })() : null;
  const oursN = counted.find(a => a.ours); const othersN = counted.filter(a => !a.ours);
  const screensSummary = byScreens && oursN && othersN.length ? (() => { const m = avg(othersN.map(a => a.steps!.length)); const fewer = Math.round((1 - oursN.steps!.length / m) * 100); return <><b>{oursN.name}</b> takes <b>{oursN.steps!.length}</b> screens, against an average of <b>{Number.isInteger(m) ? m : m.toFixed(1)}</b>{fewer > 0 ? <> · {fewer}% fewer</> : null}</>; })() : null;
  const pains = flow.apps.reduce((n, a) => n + (a.steps?.filter(s => s.pain).length ?? 0), 0);

  const tabs = <div className="csb-race-tabs" role="tablist" aria-label="Flows">
    {view === 'screens' && flows.length > 1 && <button type="button" role="tab" aria-selected={screensFlow === 'all'} onClick={() => setScreensFlow('all')}>All flows</button>}
    {flows.map((fl, i) => <button key={fl.id} type="button" role="tab" aria-selected={view === 'screens' ? screensFlow === i : i === f} onClick={() => { setFi(i); setScreensFlow(i); }} style={{ '--flow': FLOW_COLORS[i % FLOW_COLORS.length] } as React.CSSProperties}>
      {i === f && editorMode && view === 'play' ? <EditableText field={`deep:flowRace.flows.${i}.name`} value={fl.name} /> : fl.name}
      {editorMode && flows.length > 1 && i === f && view === 'play' && <span className="csb-race-tab-x" role="button" tabIndex={0} aria-label={`Remove ${fl.name}`} onClick={e => { e.stopPropagation(); if (confirm(`Remove the “${fl.name}” flow and its recordings?`)) { save(flows.filter(x => x.id !== fl.id)); setFi(0); } }}><X size={11} /></span>}
    </button>)}
    {editorMode && view === 'play' && flows.length < 6 && <button type="button" className="csb-race-tab-add" onClick={() => { save([...flows, { id: rid(), name: 'New flow', apps: flow.apps.map(a => ({ id: rid(), name: a.name, ours: a.ours })) }]); setFi(flows.length); }}><Plus size={13} />Add a flow</button>}
  </div>;

  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => { const s = swipe.current; swipe.current = null; if (!s || flows.length < 2) return; const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y; const row = box.current?.querySelector('.csb-race-row') as HTMLElement | null; const scrollable = row && row.scrollWidth > row.clientWidth + 4; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5 && !scrollable) setFi(i => Math.max(0, Math.min(flows.length - 1, i + (dx < 0 ? 1 : -1)))); };

  return <div ref={box} className={`csb-race is-${view}`} style={{ '--race-n': Math.max(2, flow.apps.length), '--flow': color } as React.CSSProperties} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    <div className="csb-race-bar">
      {tabs}
      <div className="csb-race-actions">
        <div className="csb-race-view" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'play'} onClick={() => pickView('play')} title="Recordings side by side"><Film size={13} />Play</button>
          <button type="button" aria-pressed={view === 'screens'} onClick={() => pickView('screens')} title="Every saved screen"><LayoutGrid size={13} />Screens</button>
        </div>
        {view === 'play' && withVideo.length > 0 && (racing === null
          ? <button type="button" className="csb-race-play" onClick={race}><Play size={13} fill="currentColor" />Play together</button>
          : <button type="button" className="csb-race-play" onClick={stop}><Pause size={13} fill="currentColor" />Stop</button>)}
      </div>
    </div>

    {focus && flow.apps.some(a => a.id === focus.appId) ? (() => { const ai = flow.apps.findIndex(a => a.id === focus.appId); const app = flow.apps[ai]; const k = Math.min(focus.k, (app.steps?.length ?? 1) - 1);
      return <Focus app={app} k={k} base={`${base}.apps.${ai}`} flowName={flow.name} editorMode={editorMode} setK={j => setFocus({ appId: app.id, k: j })} close={() => { setPaused(p => ({ ...p, [app.id]: k })); setFocus(null); }}
        onAdd={e => addPin(app, k, e)} onDrag={(pin, e) => dragPin(app, k, pin, e)} onDrop={id => dropPin(app, k, id)} />; })()
    : view === 'play' ? <>
      <div className="csb-race-row" key={flow.id}>
        {flow.apps.map((app, i) => {
          const st = status[app.id]; const finished = done[app.id];
          const shots = shotsOf(app); const n = app.steps?.length ?? 0;
          const t = racing !== null && app.video ? Math.min(now, finished ?? app.duration ?? now) : null;
          const held = !shots && paused[app.id] !== undefined;
          const k = shots ? Math.min(n - 1, paused[app.id] ?? 0) : held ? paused[app.id] : stepAt(app.steps, times[app.id] ?? 0); const step = k >= 0 ? app.steps?.[k] : undefined;
          const go = (d: number) => setPaused(p => ({ ...p, [app.id]: Math.max(0, Math.min(n - 1, k + d)) }));
          const adding = editorMode && (held || shots);
          return <figure key={app.id} className={`csb-race-app ${app.ours ? 'is-ours' : ''} ${finished !== undefined ? 'is-done' : ''} ${held ? 'is-held' : ''}`}>
            <IPhone className="csb-race-phone" data-no-slot onDragOver={editorMode ? e => e.preventDefault() : undefined} onDrop={editorMode ? e => { e.preventDefault(); e.stopPropagation(); take(app, e.dataTransfer.files); } : undefined}>
              {app.video ? <video ref={el => { if (el) vids.current.set(app.id, el); else vids.current.delete(app.id); }} src={app.video} muted playsInline preload="metadata" aria-label={`${app.name}: ${flow.name}`} />
                : shots && step?.thumb ? <img className="csb-race-shot-img" src={step.thumb} alt={`${app.name}: ${step.label}`} key={k} />
                : editorMode ? <label className="csb-race-drop"><Upload size={18} strokeWidth={1.6} /><b>Drop screenshots or a recording</b><span>One screenshot per step, or an MP4 / MOV</span><input type="file" accept="image/*,video/*" multiple hidden onChange={e => { const fl = e.target.files; take(app, fl ? [...fl] : []); e.target.value = ''; }} /></label>
                : <span className="csb-race-empty" />}
              {(app.video || shots) && step?.thumb && <button type="button" className="csb-race-pins is-open" onClick={() => openFocus(app.id, k)} aria-label={`Open ${step.label} large${step.pins?.length ? ' with its notes' : ''}`} title={step.pins?.length ? 'See the notes' : editorMode ? 'Open large to add notes' : 'Open large'}>
                {(step.pins ?? []).map((p, n) => <span key={p.id} className="csb-race-pin" style={{ left: `${p.x}%`, top: `${p.y}%` }}><b>{n + 1}</b></span>)}
              </button>}
              
              {held && <button type="button" className="csb-race-resume" onClick={() => resume(app.id)}><Play size={11} fill="currentColor" />Resume</button>}
              {t !== null && <span className="csb-race-clock">{finished !== undefined ? `Done · ${fmt(finished)}` : fmt(t)}</span>}
              {st && <span className={`csb-race-status ${st.error ? 'is-error' : ''}`} role="status">{st.text}</span>}
            </IPhone>
            <figcaption>
              <strong><Name value={app.name} editable={editorMode && !!edit} onRename={v => rename(app.id, app.name, v)} />{app.ours && <i>Ours</i>}</strong>
              <span className="csb-race-stats">{app.video ? fmt(app.duration) : !shots && editorMode ? 'Nothing added yet' : ''}</span>
              {step && <div className={`csb-race-cur ${step.pain ? 'is-pain' : ''}`}>
                {n > 1 && <button type="button" className="csb-race-arrow" aria-label="Previous screen" disabled={k <= 0} onClick={() => hold(app.id, k - 1, app.steps![k - 1].at)}><ChevronLeft size={14} /></button>}<em>{k + 1}</em><span><EditableText field={`${base}.apps.${i}.steps.${k}.label`} value={step.label} /></span>{n > 1 && <button type="button" className="csb-race-arrow" aria-label="Next screen" disabled={k >= n - 1} onClick={() => hold(app.id, k + 1, app.steps![k + 1].at)}><ChevronRight size={14} /></button>}
                {editorMode && <button type="button" className="csb-race-pain" aria-pressed={!!step.pain} title={step.pain ? 'Friction point (click to clear)' : 'Mark this screen as a friction point'} onClick={() => putApp(flow.id, app.id, a => ({ steps: a.steps!.map((x, y) => y === k ? { ...x, pain: !x.pain } : x) }))} />}
              </div>}
              {step?.thumb && (step.pins?.length || editorMode) ? <button type="button" className="csb-race-open" onClick={() => openFocus(app.id, k)}><Maximize2 size={12} />{step.pins?.length ? `View ${step.pins.length} ${step.pins.length === 1 ? 'note' : 'notes'}` : 'Add notes'}</button> : null}
              {step?.pain && (editorMode || step.note) && <small className="csb-race-cur-note"><EditableText field={`${base}.apps.${i}.steps.${k}.note`} value={step.note || ''} /></small>}
              {n > 1 && <div className="csb-race-strip" role="group" aria-label={`${app.name} screens`} ref={el => { const cur = el?.querySelector('[aria-current]') as HTMLElement | null; if (el && cur) { const l = cur.offsetLeft - el.offsetLeft; if (l < el.scrollLeft || l + cur.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollTo({ left: l - el.clientWidth / 2 + cur.offsetWidth / 2, behavior: 'smooth' }); } }}>{app.steps!.map((s, j) => <button key={j} type="button" className={`${s.pain ? 'is-pain' : ''} ${s.pins?.length ? 'has-notes' : ''}`} aria-label={`Screen ${j + 1}: ${s.label}`} aria-current={j === k ? 'true' : undefined} title={`${j + 1}. ${s.label}`} onClick={() => hold(app.id, j, s.at)}>{s.thumb ? <img src={s.thumb} alt="" loading="lazy" draggable={false} /> : <span>{j + 1}</span>}</button>)}</div>}
              {editorMode && <span className="csb-race-tools">
                {(app.video || shots) && <label title="Replace with new screenshots or a recording"><RotateCcw size={13} /><input type="file" accept="image/*,video/*" multiple hidden onChange={e => { const fl = e.target.files; take(app, fl ? [...fl] : []); e.target.value = ''; }} /></label>}
                {shots && <label title="Add more screenshots at the end"><Images size={13} /><input type="file" accept="image/*" multiple hidden onChange={e => { const fl = [...(e.target.files ?? [])]; e.target.value = ''; if (fl.length) void (async () => { const { compressIntoDraft } = await import('./ImageSlots'); const add: RaceStep[] = []; for (const x of fl.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) add.push({ label: `Screen ${n + add.length + 1}`, at: 0, thumb: await compressIntoDraft(x, 600_000, 900) }); putApp(flow.id, app.id, a => ({ steps: [...(a.steps ?? []), ...add].map((st, y) => ({ ...st, at: y * DWELL })) })); })(); }} /></label>}
                {!!app.steps?.some(st => st.thumb) && <button type="button" title="Download these screens as a GIF" onClick={() => void gif(app)}><Download size={13} /></button>}
                {app.video && <button type="button" title="Find the screens again" onClick={() => void reanalyse(app)}><RefreshCw size={13} /></button>}
                <button type="button" aria-pressed={!!app.ours} title={app.ours ? 'This is your design' : 'Mark as your design'} onClick={() => save(flows.map(fl => fl.id !== flow.id ? fl : { ...fl, apps: fl.apps.map(a => ({ ...a, ours: a.id === app.id ? !a.ours : false })) }))}><Star size={13} /></button>
                {flow.apps.length > 2 && <button type="button" title="Remove this app" onClick={() => save(flows.map(fl => fl.id !== flow.id ? fl : { ...fl, apps: fl.apps.filter(a => a.id !== app.id) }))}><Trash2 size={13} /></button>}
              </span>}
            </figcaption>
          </figure>;
        })}
        {editorMode && flow.apps.length < 5 && <button type="button" className="csb-race-add" onClick={() => save(flows.map(fl => fl.id !== flow.id ? fl : { ...fl, apps: [...fl.apps, { id: rid(), name: `Competitor ${fl.apps.length}` }] }))}><Plus size={16} />Add an app</button>}
      </div>
      {(summary || pains > 0 || editorMode) && <div className="csb-race-sum">
        {(screensSummary || summary) && <p>{screensSummary || summary}</p>}
        {pains > 0 && <p className="csb-race-sum-pain"><i aria-hidden="true" />{pains} friction {pains === 1 ? 'point' : 'points'} marked. Click a screen name to hold it.</p>}
        {editorMode && !summary && !screensSummary && <p className="csb-race-hint">Do the same task in each app and drop its screenshots (one per step) or a screen recording on its phone. Click a screen name to hold it, then click the screen to add a note. Star your own design.</p>}
      </div>}
    </> : <Screens flows={flows} only={screensFlow} onOpen={(fl, appId, j) => { setFi(fl); setFocus({ appId, k: j }); }} rename={editorMode && edit ? (from, to) => renameAll(from, to) : undefined} />}
  </div>;
}

/* Contact sheet: every saved screen, per app, tagged with its flow's colour. */
function Screens({ flows, only, rename, onOpen }: { flows: RaceFlow[]; only: 'all' | number; rename?: (from: string, to: string) => void; onOpen?: (flow: number, appId: string, k: number) => void }) {
  const shown = flows.map((fl, i) => ({ fl, i })).filter(({ i }) => only === 'all' || only === i);
  const names = [...new Set(shown.flatMap(({ fl }) => fl.apps.map(a => a.name)))];
  const any = shown.some(({ fl }) => fl.apps.some(a => a.steps?.some(s => s.thumb)));
  if (!any) return <p className="csb-race-hint csb-race-sheet-empty">Screens appear here once recordings are added. Each one is saved as a picture, tagged with its flow.</p>;
  return <div className="csb-race-sheet">
    {names.map(name => <div className="csb-race-sheet-app" key={name}>
      <strong><Name value={name} editable={!!rename} onRename={v => rename?.(name, v)} /></strong>
      {!shown.some(({ fl }) => fl.apps.find(a => a.name === name)?.steps?.some(st => st.thumb)) ? <p className="csb-race-sheet-none">No screens yet</p> : <div className="csb-race-sheet-strip">
        {shown.map(({ fl, i }) => { const app = fl.apps.find(a => a.name === name); const steps = app?.steps?.filter(s => s.thumb) ?? []; if (!steps.length) return null; const c = FLOW_COLORS[i % FLOW_COLORS.length];
          return <div className="csb-race-sheet-flow" key={fl.id} style={{ '--flow': c } as React.CSSProperties}>
            <Pager label={fl.name} count={steps.length}>{steps.map((s, j) => <figure key={j} className={s.pain ? 'is-pain' : ''}>
              <div className="csb-race-shot" role="button" tabIndex={0} onClick={() => app && onOpen?.(i, app.id, app.steps!.indexOf(s))} onKeyDown={e => { if (e.key === 'Enter' && app) onOpen?.(i, app.id, app.steps!.indexOf(s)); }} title="Open large with notes"><img src={s.thumb} alt={`${name}, ${fl.name}: ${s.label}`} loading="lazy" />{(s.pins ?? []).map((p, n) => <b key={p.id} style={{ left: `${p.x}%`, top: `${p.y}%` }} title={p.text}>{n + 1}</b>)}</div>
              <figcaption><em>{j + 1}</em>{s.label}</figcaption>
              {!!s.pins?.length && <ol>{s.pins.map(p => <li key={p.id}>{p.text}</li>)}</ol>}
            </figure>)}</Pager>
          </div>; })}
      </div>}
    </div>)}
  </div>;
}

/* A plain editable name (Enter or click away to save). */
function Name({ value, editable, onRename }: { value: string; editable: boolean; onRename: (v: string) => void }) {
  if (!editable) return <>{value}</>;
  return <span className="csb-race-name" contentEditable suppressContentEditableWarning role="textbox" aria-label="App name" spellCheck={false}
    onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') e.currentTarget.textContent = value; e.currentTarget.blur(); } }}
    onBlur={e => { const v = (e.currentTarget.textContent || '').replace(/\s+/g, ' ').trim(); if (v && v !== value) onRename(v.slice(0, 40)); else e.currentTarget.textContent = value; }}>{value}</span>;
}

/* Four screens at a time, big enough to read; arrows page through the rest. */
function Pager({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const per = () => { const el = ref.current; const first = el?.firstElementChild as HTMLElement | null; return el && first ? Math.max(1, Math.round(el.clientWidth / (first.offsetWidth + 16))) : 4; };
  const onScroll = () => { const el = ref.current; const first = el?.firstElementChild as HTMLElement | null; if (el && first) setAt(Math.round(el.scrollLeft / (first.offsetWidth + 16))); };
  const go = (d: number) => { const el = ref.current; if (el) el.scrollBy({ left: d * el.clientWidth, behavior: 'smooth' }); };
  const n = per(); const end = Math.min(count, at + n);
  return <div className="csb-race-pager">
    <div className="csb-race-pager-bar">
      <span className="csb-race-sheet-tag">{label}</span>
      {count > n && <span className="csb-race-pager-nav"><em>{at + 1}–{end} of {count}</em>
        <button type="button" className="csb-race-arrow" aria-label="Previous screens" disabled={at <= 0} onClick={() => go(-1)}><ChevronLeft size={14} /></button>
        <button type="button" className="csb-race-arrow" aria-label="Next screens" disabled={end >= count} onClick={() => go(1)}><ChevronRight size={14} /></button></span>}
    </div>
    <div className="csb-race-sheet-shots" ref={ref} onScroll={onScroll}>{children}</div>
  </div>;
}

/* One screen, big, with its notes beside it on leader lines (like an annotated screen). */
function Focus({ app, k, base, flowName, editorMode, setK, close, onAdd, onDrag, onDrop }: { app: RaceApp; k: number; base: string; flowName: string; editorMode: boolean; setK: (k: number) => void; close: () => void; onAdd: (e: React.MouseEvent) => void; onDrag: (pin: RacePin, e: React.PointerEvent) => void; onDrop: (id: string) => void }) {
  const steps = app.steps ?? []; const step = steps[k]; const pins = step?.pins ?? [];
  const box = useRef<HTMLDivElement>(null); const scr = useRef<HTMLDivElement>(null);
  const labels = useRef<Array<HTMLDivElement | null>>([]);
  const [geo, setGeo] = useState<{ w: number; sx: number; sy: number; sw: number; sh: number; fl: number; fr: number; tops: number[] } | null>(null);
  const measure = () => {
    const b = box.current, s = scr.current; if (!b || !s) return;
    // The editor shows the page scaled down; work in the page's own (unscaled) pixels.
    const br = b.getBoundingClientRect(), sr = s.getBoundingClientRect(); const frame = s.parentElement!.parentElement!.getBoundingClientRect();
    const z = br.width / (b.offsetWidth || br.width) || 1;
    const g = { w: b.offsetWidth, sx: (sr.left - br.left) / z, sy: (sr.top - br.top) / z, sw: sr.width / z, sh: sr.height / z, fl: (frame.left - br.left) / z, fr: (frame.right - br.left) / z, tops: [] as number[] };
    // Each label sits level with its dot; labels on the same side push down so they never overlap.
    const sides: Record<'l' | 'r', Array<{ n: number; y: number }>> = { l: [], r: [] };
    pins.forEach((p, n) => sides[p.x < 50 ? 'l' : 'r'].push({ n, y: g.sy + p.y / 100 * g.sh }));
    (['l', 'r'] as const).forEach(side => { let floor = -Infinity; sides[side].sort((a, b) => a.y - b.y).forEach(({ n, y }) => { const h = labels.current[n]?.offsetHeight ?? 60; const top = Math.max(y - 11, floor); g.tops[n] = top; floor = top + h + 18; }); });
    setGeo(g);
  };
  useLayoutEffect(measure, [k, pins.map(p => `${p.x},${p.y},${(p.title ?? '').length},${p.text.length}`).join('|')]);
  useEffect(() => { const ro = new ResizeObserver(measure); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, [k]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.target as HTMLElement).isContentEditable) return; if (e.key === 'ArrowRight' && k < steps.length - 1) setK(k + 1); if (e.key === 'ArrowLeft' && k > 0) setK(k - 1); if (e.key === 'Escape') close(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [k, steps.length]);
  const stacked = !!geo && geo.w < 640;
  const gap = 28;
  return <div className={`csb-race-focus ${stacked ? 'is-stacked' : ''}`}>
    <div className="csb-race-focus-bar">
      <button type="button" className="csb-race-back" onClick={close}><ArrowLeft size={14} />All apps</button>
      <span className="csb-race-focus-title"><b>{app.name}</b><span>{flowName}</span></span>
      <span className="csb-race-focus-nav">
        <button type="button" className="csb-race-arrow" aria-label="Previous screen" disabled={k <= 0} onClick={() => setK(k - 1)}><ChevronLeft size={14} /></button>
        <em>{k + 1} / {steps.length}</em>
        <button type="button" className="csb-race-arrow" aria-label="Next screen" disabled={k >= steps.length - 1} onClick={() => setK(k + 1)}><ChevronRight size={14} /></button>
      </span>
    </div>
    <p className="csb-race-focus-step"><EditableText field={`${base}.steps.${k}.label`} value={step?.label ?? ''} /></p>
    <div className="csb-race-focus-stage" ref={box}>
      <IPhone className="csb-race-focus-phone">
        <div ref={scr} className="csb-race-focus-screen">
          {step?.thumb && <img src={step.thumb} alt={`${app.name}: ${step.label}`} draggable={false} />}
          <div className={`csb-race-pins ${editorMode ? 'is-adding' : ''}`} onClick={editorMode ? onAdd : undefined} title={editorMode ? 'Click to add a note here' : undefined}>
            {pins.map((p, n) => <span key={p.id} className="csb-race-pin" style={{ left: `${p.x}%`, top: `${p.y}%` }} onPointerDown={e => onDrag(p, e)} onClick={e => e.stopPropagation()}><b>{n + 1}</b></span>)}
          </div>
        </div>
      </IPhone>
      {geo && !stacked && <svg className="csb-race-focus-lines" width={geo.w} height="100%" aria-hidden="true">{pins.map((p, n) => { const px = geo.sx + p.x / 100 * geo.sw, py = geo.sy + p.y / 100 * geo.sh; const left = p.x < 50; const edge = left ? geo.fl - gap + 6 : geo.fr + gap - 6; const ly = (geo.tops[n] ?? py - 11) + 11; const out = left ? geo.fl - 4 : geo.fr + 4; return <polyline key={p.id} points={`${px + (left ? -11 : 11)},${py} ${out},${py} ${edge},${ly}`} fill="none" />; })}</svg>}
      {!stacked && pins.map((p, n) => { const left = p.x < 50; return <div key={p.id} ref={el => { labels.current[n] = el; }} className={`csb-race-note ${left ? 'is-left' : 'is-right'}`} style={geo ? { top: geo.tops[n] ?? 0, ...(left ? { right: geo.w - geo.fl + gap } : { left: geo.fr + gap }) } : { visibility: 'hidden' }}>
        <strong><EditableText field={`${base}.steps.${k}.pins.${n}.title`} value={p.title ?? ''} /></strong>
        <p><EditableText field={`${base}.steps.${k}.pins.${n}.text`} value={p.text} /></p>
        {editorMode && <button type="button" className="csb-race-note-x" aria-label="Remove note" onClick={() => onDrop(p.id)}><X size={11} /></button>}
      </div>; })}
    </div>
    {stacked && pins.length > 0 && <ol className="csb-race-note-list">{pins.map((p, n) => <li key={p.id}><b>{n + 1}</b><div><strong><EditableText field={`${base}.steps.${k}.pins.${n}.title`} value={p.title ?? ''} /></strong><p><EditableText field={`${base}.steps.${k}.pins.${n}.text`} value={p.text} /></p></div>{editorMode && <button type="button" className="csb-race-note-x" aria-label="Remove note" onClick={() => onDrop(p.id)}><X size={11} /></button>}</li>)}</ol>}
    {editorMode && <p className="csb-race-hint">Click the screen to add a note, drag a dot to move it, and type its title and explanation beside the phone. ← → step through the screens.</p>}
  </div>;
}
