import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { figmaEmbedUrl } from './PrototypeEmbed';
import { HoldCoach } from './HoldCoach';
import { useReducedMotion } from './MotionKit';
import { mobileNotes, openHold, type HoldChannel, type HoldMsg, type TaskRun, type TaskState } from './HoldSync';
import { publishedJsonUrl } from './Publish';
import { listStudies } from './studyLibrary';
import { useScreens } from './ScrollSite';
import type { BuilderStudy, CaseStudySection } from './model';
import './hold.css';

/*
  The phone side of "Hold it": #/hold/<slug>/<section id>/<code>[/p].
  Visitors: a short how-to, an optional timed task on each version, then free scrolling while the laptop explains.
  Presenter (/p): no how-to; speaker notes at the bottom; you set the pace for the room.
  Either way it ends on purpose: "I'm done" → the laptop recaps the key decisions → "Look back at the screen".
*/
async function loadStudy(slug: string): Promise<BuilderStudy | null> {
  try { const r = await fetch(publishedJsonUrl(slug), { cache: 'no-store' }); if (r.ok) return await r.json() as BuilderStudy; } catch { /* not published or offline */ }
  try { const all = await listStudies(); return all.find(s => s.slug === slug) ?? null; } catch { return null; }
}
const fmt = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;
const parseBox = (b?: string) => { const v = String(b ?? '').split(',').map(Number); return v.length === 4 && v.every(Number.isFinite) ? v : null; };

export default function HoldPage({ slug, sectionId, code, presenter = false }: { slug: string; sectionId: string; code: string; presenter?: boolean }) {
  const [section, setSection] = useState<CaseStudySection | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState<string>('a');
  const [linked, setLinked] = useState(false);
  const [stale, setStale] = useState(false);
  const [ended, setEnded] = useState(false);
  const ch = useRef<HoldChannel | null>(null);
  const readyRef = useRef(false);
  const lastHi = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  useEffect(() => {
    document.title = 'Hold it';
    void loadStudy(slug).then(study => {
      const sec = study?.sections.find(s => s.id === sectionId);
      if (!study || !sec) { setError('This case study isn’t published yet, or the link is old. Ask for a fresh code.'); return; }
      setTitle(study.title); setSection(sec);
    });
  }, [slug, sectionId]);

  useEffect(() => {
    let alive = true;
    const onMsg = (m: HoldMsg) => {
      if (m.t === 'hi') { lastHi.current = Date.now(); setLinked(true); setStale(false); if (m.stage) setStageFrom(m.stage); }
      if (m.t === 'stage') setStageFrom(m.stage);
      if (m.t === 'end') setEnded(true);
    };
    void openHold(code, onMsg).then(c => { if (!alive) { c.close(); return; } ch.current = c; c.send({ t: 'hello', ua: navigator.userAgent.slice(0, 60), ready: readyRef.current, presenter }); });
    // Hello every 1.5s: it finds a laptop that joined late, and every answer tells us the link is still up.
    const again = setInterval(() => { ch.current?.send({ t: 'hello', ready: readyRef.current, presenter }); if (lastHi.current && Date.now() - lastHi.current > 5000) setStale(true); }, 1500);
    const bye = () => ch.current?.send({ t: 'bye' });
    window.addEventListener('pagehide', bye);
    return () => { alive = false; clearInterval(again); window.removeEventListener('pagehide', bye); bye(); ch.current?.close(); };
  }, [code]);
  useEffect(() => { if (linked) { try { navigator.vibrate?.([12, 40, 18]); } catch { /* ignore */ } } }, [linked]);

  const o = section?.options ?? {};
  const compare = o.compare === true;
  const nameA = String(o.stageA || 'Wireframe'), nameB = String(o.stageB || 'High fidelity');
  const off = compare && stage === 'b' ? 2 : 0;
  const mob = section?.items[off + 1];
  const segs = useScreens(mob?.image, o.stackMob === true);
  const liveRaw = String((compare ? o[stage === 'b' ? 'liveB' : 'liveA'] : o.live) ?? '').trim();
  const liveSrc = !liveRaw ? '' : figmaEmbedUrl(liveRaw) ?? (/^https:\/\//.test(liveRaw) ? liveRaw : '');
  const appLink = /^https:\/\//.test(String(o.appLink ?? '')) ? String(o.appLink) : '';
  const [live, setLive] = useState(false);
  const [coach, setCoach] = useState(!presenter);
  const [hud, setHud] = useState(0);
  const reduce = useReducedMotion();
  const [dir, setDir] = useState(1);
  useEffect(() => { ch.current?.send({ t: 'mode', live: live && !!liveSrc }); }, [live, liveSrc]);

  /* ---------- the timed task ---------- */
  const taskText = String(o.task ?? '').trim();
  const target = (v: 'a' | 'b') => section?.items[Number(o[v === 'a' ? 'taskA' : 'taskB'])];
  const hasTask = !!taskText && !!target('a') && (!compare || !!target('b'));
  const [task, setTask] = useState<TaskState | null>(null);
  const t0 = useRef(0);
  useEffect(() => { if (section && hasTask && !presenter) setTask({ phase: 'intro', run: 'a', taps: 0, ms: 0, results: {} }); }, [section?.id, hasTask]);
  useEffect(() => { ch.current?.send({ t: 'task', s: task }); }, [task]);
  const startRun = (run: 'a' | 'b') => {
    if (compare && run !== stage) { setDir(run === 'b' ? 1 : -1); setStage(run); ch.current?.send({ t: 'pick', stage: run }); }
    requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = 0; });
    t0.current = Date.now(); setTask(s => s && { ...s, phase: 'running', run, taps: 0, ms: 0 });
  };
  const finishRun = (found: boolean) => setTask(s => {
    if (!s) return s;
    const r: TaskRun = { taps: s.taps + (found ? 1 : 0), ms: Date.now() - t0.current, found };
    const results = { ...s.results, [s.run]: r };
    try { navigator.vibrate?.(found ? [16, 50, 24] : 30); } catch { /* ignore */ }
    return { ...s, taps: r.taps, ms: r.ms, results, phase: compare && s.run === 'a' ? 'between' : 'summary' };
  });
  const onTap = (e: React.MouseEvent) => {
    if (task?.phase !== 'running') return;
    // The page that was tapped (during a version swap two pages briefly overlap, so go by the tap itself).
    const page = ((e.target as Element).closest('.hold-page') ?? pageRef.current)?.getBoundingClientRect(); if (!page) return;
    const x = (e.clientX - page.left) / page.width * 100, y = (e.clientY - page.top) / page.height * 100;
    const n = target(task.run); const bx = parseBox(n?.box as string | undefined); const at = Number(n?.point) || 0;
    const hit = bx ? x >= bx[0] - 3 && x <= bx[0] + bx[2] + 3 && y >= bx[1] - 1.5 && y <= bx[1] + bx[3] + 1.5 : Math.abs(y - at) <= 6;
    if (hit) finishRun(true); else setTask(s => s && { ...s, taps: s.taps + 1 });
  };
  const [canGiveUp, setCanGiveUp] = useState(false);
  useEffect(() => { setCanGiveUp(false); if (task?.phase !== 'running') return; const t = setTimeout(() => setCanGiveUp(true), 30000); return () => clearTimeout(t); }, [task?.phase, task?.run]);
  const running = task?.phase === 'running';
  const taskOverlay = !!task && task.phase !== 'running' && task.phase !== 'closed';

  /* ---------- scrolling, swiping, reporting ---------- */
  const frac = useRef(0);
  const restore = () => { const el = scroller.current; if (!el) return; const max = el.scrollHeight - el.clientHeight; if (max > 0) el.scrollTop = frac.current * max; report(); };
  function setStageFrom(st: string) { setStage(prev => { if (prev !== st) { setDir(st === 'b' ? 1 : -1); setHud(h => h + 1); } return st; }); }
  const pick = (st: 'a' | 'b') => { if (!compare || st === stage || running || taskOverlay) return; setDir(st === 'b' ? 1 : -1); setStage(st); setHud(h => h + 1); setCoach(false); ch.current?.send({ t: 'pick', stage: st }); try { navigator.vibrate?.(10); } catch { /* ignore */ } };
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, t: Date.now() }; };
  const onTouchEnd = (e: React.TouchEvent) => { const s0 = touch.current; touch.current = null; if (!s0 || !compare) return; const t = e.changedTouches[0]; const dx = t.clientX - s0.x, dy = t.clientY - s0.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s0.t < 700) pick(dx < 0 ? 'b' : 'a'); };
  const [pos, setPos] = useState({ f: 0, v: .3 });
  const lastSent = useRef(0);
  const report = () => {
    const el0 = scroller.current; if (el0) { const m = el0.scrollHeight - el0.clientHeight; if (m > 0) frac.current = el0.scrollTop / m; }
    if (frame.current) return; const wait = Math.max(0, 50 - (Date.now() - lastSent.current));
    frame.current = window.setTimeout(() => { frame.current = 0; lastSent.current = Date.now(); const el = scroller.current; if (!el) return; const max = el.scrollHeight - el.clientHeight; const f = max > 0 ? Math.round(el.scrollTop / max * 1000) / 1000 : 0; const v = el.scrollHeight ? Math.round(el.clientHeight / el.scrollHeight * 1000) / 1000 : 1; setPos({ f, v }); ch.current?.send({ t: 'scroll', f, v }); }, wait);
  };
  const atEnd = pos.f > .96;

  /* ---------- presenter: the note on screen now, and the next one ---------- */
  const notes = useMemo(() => section ? mobileNotes(section as never, stage) : [], [section, stage]);
  const top = pos.f * (1 - pos.v), bottom = top + pos.v;
  const nowNote = notes.filter(n => n.at >= top && n.at <= bottom).sort((a, b) => Math.abs(a.at - (top + bottom) / 2) - Math.abs(b.at - (top + bottom) / 2))[0];
  const nextNote = notes.find(n => n.at > bottom);

  const done = () => { ch.current?.send({ t: 'done' }); setEnded(true); try { navigator.vibrate?.(14); } catch { /* ignore */ } };
  const ready = !!section && (presenter || (!coach && !taskOverlay) || !mob?.image || (live && !!liveSrc));
  useEffect(() => { readyRef.current = ready; if (ready) ch.current?.send({ t: 'ready' }); }, [ready]);
  if (error) return <div className="hold-msg"><h1>Hmm</h1><p>{error}</p></div>;
  if (!section) return <div className="hold-msg"><p>Loading…</p></div>;
  const image = mob?.image;
  const showLive = live && !!liveSrc;
  const vName = (v: 'a' | 'b') => compare ? (v === 'a' ? nameA : nameB) : 'the page';

  if (ended) return <div className="hold-end">
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
      <span className="hold-end-arrow" aria-hidden="true">↑</span>
      <h1>That’s it.</h1>
      <p>Look back at the screen.</p>
      <button type="button" className="hold-btn is-ghost" onClick={() => location.reload()}>Start again</button>
    </motion.div>
  </div>;

  return <div className={`hold ${showLive ? 'is-live' : ''} ${presenter ? 'is-presenter' : ''}`}>
    <AnimatePresence>{(!linked || stale) && <motion.div key={stale ? 'stale' : 'pill'} className="hold-pill" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }} transition={{ delay: stale ? 0 : .9, duration: .4 }}>
      <i className={stale ? 'is-wait' : ''} />{stale ? 'Reconnecting…' : 'Connecting to the laptop…'}
    </motion.div>}</AnimatePresence>
    {linked && !stale && <button type="button" className="hold-close" aria-label={presenter ? 'Wrap up' : 'I’m done'} onClick={done}><X size={16} /></button>}
    {showLive
      ? <iframe key={liveSrc} className="hold-live" src={liveSrc} title="Live prototype" allow="fullscreen; clipboard-write" />
      : <motion.div className="hold-screen" ref={scroller} onScroll={report} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={onTap}
      initial={{ y: '-110%', rotate: -14, scale: .9 }} animate={{ y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay: .15 }}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div key={stage} className="hold-page" ref={pageRef} custom={dir}
          variants={{ in: (d: number) => ({ x: `${d * 100}%`, opacity: .4 }), on: { x: 0, opacity: 1 }, out: (d: number) => ({ x: `${d * -100}%`, opacity: .4 }) }}
          initial="in" animate="on" exit="out" transition={{ type: 'spring', stiffness: 260, damping: 32 }}>
          {!image ? <p className="hold-empty">No mobile screen in this section yet.</p>
            : segs ? <div className="hold-stack" ref={() => requestAnimationFrame(restore)}>{segs.list.map((sg, k) => <div key={k} style={{ aspectRatio: `${sg.w} / ${sg.h}`, backgroundImage: `url("${image}")`, backgroundSize: `${(segs.W / sg.w) * 100}% auto`, backgroundPosition: `${segs.W === sg.w ? 0 : (sg.x / (segs.W - sg.w)) * 100}% ${segs.H === sg.h ? 0 : (sg.y / (segs.H - sg.h)) * 100}%` }} />)}</div>
            : <img src={image} alt={mob?.title || 'Screen'} draggable={false} onLoad={restore} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>}

    {running && <div className="hold-taskbar" role="status"><span><b>{vName(task!.run)}</b> · {taskText}</span>{canGiveUp && <button type="button" onClick={() => finishRun(false)}>I can’t find it</button>}</div>}

    {presenter && !showLive && notes.length > 0 && <div className="hold-speaker" aria-live="polite">
      <small>{nowNote ? `On screen now · ${notes.indexOf(nowNote) + 1} of ${notes.length}` : nextNote ? 'Next' : 'Speaker notes'}</small>
      <strong>{(nowNote ?? nextNote)?.title ?? 'That’s every note.'}</strong>
      {nowNote && nextNote && <span>Then: {nextNote.title}</span>}
    </div>}

    {!running && <div className="hold-dock">
      {liveSrc && <button type="button" className="hold-btn" onClick={() => setLive(v => !v)}>{showLive ? 'Back to the screen' : 'Try the prototype'}</button>}
      {showLive && <a className="hold-btn is-ghost" href={liveRaw} target="_blank" rel="noopener">Open full screen</a>}
      {appLink && <a className="hold-btn is-ghost" href={appLink} target="_blank" rel="noopener">Get the app</a>}
      <AnimatePresence>{(atEnd || presenter) && linked && !taskOverlay && <motion.button key="done" type="button" className="hold-btn" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={done}>{presenter ? 'Wrap up' : 'I’m done'}</motion.button>}</AnimatePresence>
    </div>}

    <AnimatePresence>{hud > 0 && <motion.div key={hud} className="hold-hud" initial={{ opacity: 0, y: -14 }} animate={{ opacity: [0, 1, 1, 0], y: [-14, 0, 0, -8] }} transition={{ duration: 1.3, times: [0, .15, .75, 1] }} aria-live="polite">
      <small>{stage === 'b' ? '→' : '←'}</small>{stage === 'b' ? nameB : nameA}
    </motion.div>}</AnimatePresence>

    <AnimatePresence>{coach && !showLive && image && <HoldCoach key="coach" versions={compare ? [nameA, nameB] : undefined} reduce={reduce} onDone={() => setCoach(false)} />}</AnimatePresence>

    <AnimatePresence>{!coach && taskOverlay && <motion.div key={task!.phase + task!.run} className="hold-task" role="dialog" aria-label="A quick task"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="hold-task-card" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .1, duration: .4 }}>
        {task!.phase === 'intro' && <>
          <small>A quick task{compare ? ', twice' : ''}</small>
          <h2>{taskText}</h2>
          <p>{compare ? `Try it on the ${nameA.toLowerCase()} first, then on the ${nameB.toLowerCase()}. Tap it when you find it. The screen beside you keeps score.` : 'Tap it when you find it. The screen beside you keeps score.'}</p>
          <button type="button" className="hold-coach-go" onClick={() => startRun('a')}>Start{compare ? ` on the ${nameA.toLowerCase()}` : ''}</button>
          <button type="button" className="hold-task-skip" onClick={() => setTask(s => s && { ...s, phase: 'closed' })}>Skip the task</button>
        </>}
        {task!.phase === 'between' && <>
          <small>{task!.results.a?.found ? 'Found it' : 'Fair enough'}</small>
          <h2>{task!.results.a?.found ? `${fmt(task!.results.a.ms)}, ${task!.results.a.taps} tap${task!.results.a.taps === 1 ? '' : 's'}` : 'That one’s hard to find.'}</h2>
          <p>Now the same task on the {nameB.toLowerCase()}.</p>
          <button type="button" className="hold-coach-go" onClick={() => startRun('b')}>Start on the {nameB.toLowerCase()}</button>
        </>}
        {task!.phase === 'summary' && <>
          <small>Your result</small>
          <div className="hold-task-result">
            {(compare ? ['a', 'b'] as const : ['a'] as const).map(v => { const r = task!.results[v]; return <div key={v}><span>{vName(v)}</span><b>{r?.found ? fmt(r.ms) : 'Not found'}</b><i>{r ? `${r.taps} tap${r.taps === 1 ? '' : 's'}` : ''}</i></div>; })}
          </div>
          <p>Look at the screen beside you, then explore freely. Each part is explained as you reach it.</p>
          <button type="button" className="hold-coach-go" onClick={() => setTask(s => s && { ...s, phase: 'closed' })}>Explore freely</button>
        </>}
      </motion.div>
    </motion.div>}</AnimatePresence>
  </div>;
}
