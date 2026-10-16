import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { figmaEmbedUrl } from './PrototypeEmbed';
import { HoldCoach } from './HoldCoach';
import { useReducedMotion } from './MotionKit';
import { openHold, type HoldChannel, type HoldMsg } from './HoldSync';
import { publishedJsonUrl } from './Publish';
import { listStudies } from './studyLibrary';
import { useScreens } from './ScrollSite';
import type { BuilderStudy, CaseStudySection } from './model';
import './hold.css';

/*
  The phone side of "Hold it": #/hold/<slug>/<section id>/<code>.
  Shows the real mobile screen full size; scrolling it moves the highlight and notes on the laptop.
  The case study comes from the published page (or, on the same computer, from your saved drafts).
*/
async function loadStudy(slug: string): Promise<BuilderStudy | null> {
  try { const r = await fetch(publishedJsonUrl(slug), { cache: 'no-store' }); if (r.ok) return await r.json() as BuilderStudy; } catch { /* not published or offline */ }
  try { const all = await listStudies(); return all.find(s => s.slug === slug) ?? null; } catch { return null; }
}

export default function HoldPage({ slug, sectionId, code }: { slug: string; sectionId: string; code: string }) {
  const [section, setSection] = useState<CaseStudySection | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState<string>('a');
  const [linked, setLinked] = useState(false);
  const ch = useRef<HoldChannel | null>(null);
  const readyRef = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
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
    const onMsg = (m: HoldMsg) => { if (m.t === 'hi') { setLinked(true); if (m.stage) setStage(m.stage); } if (m.t === 'stage') setStageFrom(m.stage); };
    void openHold(code, onMsg).then(c => { if (!alive) { c.close(); return; } ch.current = c; c.send({ t: 'hello', ua: navigator.userAgent.slice(0, 60), ready: readyRef.current }); });
    // Say hello again a few times in case the laptop joined late.
    const again = setInterval(() => ch.current?.send({ t: 'hello', ready: readyRef.current }), 1500);
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
  const [coach, setCoach] = useState(true);
  const [hud, setHud] = useState(0);
  const reduce = useReducedMotion();
  // The laptop waits until they've finished the how-to before it goes full screen.
  const [dir, setDir] = useState(1);
  useEffect(() => { ch.current?.send({ t: 'mode', live: live && !!liveSrc }); }, [live, liveSrc]);
  // Keep the place on the page when the screen swaps.
  const frac = useRef(0);
  const restore = () => { const el = scroller.current; if (!el) return; const max = el.scrollHeight - el.clientHeight; if (max > 0) el.scrollTop = frac.current * max; report(); };
  function setStageFrom(st: string) { setStage(prev => { if (prev !== st) { setDir(st === 'b' ? 1 : -1); setHud(h => h + 1); } return st; }); }
  const pick = (st: 'a' | 'b') => { if (!compare || st === stage) return; setDir(st === 'b' ? 1 : -1); setStage(st); setHud(h => h + 1); setCoach(false); ch.current?.send({ t: 'pick', stage: st }); try { navigator.vibrate?.(10); } catch { /* ignore */ } };
  // Swipe left for the second stage (new), right for the first (old).
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, t: Date.now() }; };
  const onTouchEnd = (e: React.TouchEvent) => { const s0 = touch.current; touch.current = null; if (!s0 || !compare) return; const t = e.changedTouches[0]; const dx = t.clientX - s0.x, dy = t.clientY - s0.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - s0.t < 700) pick(dx < 0 ? 'b' : 'a'); };
  // About 20 updates a second is smooth on the laptop and well inside the live channel's limits.
  const lastSent = useRef(0);
  const report = () => { const el0 = scroller.current; if (el0) { const m = el0.scrollHeight - el0.clientHeight; if (m > 0) frac.current = el0.scrollTop / m; } if (frame.current) return; const wait = Math.max(0, 50 - (Date.now() - lastSent.current)); frame.current = window.setTimeout(() => { frame.current = 0; lastSent.current = Date.now(); const el = scroller.current; if (!el) return; const max = el.scrollHeight - el.clientHeight; ch.current?.send({ t: 'scroll', f: max > 0 ? Math.round(el.scrollTop / max * 1000) / 1000 : 0, v: el.scrollHeight ? Math.round(el.clientHeight / el.scrollHeight * 1000) / 1000 : 1 }); }, wait); };

  const ready = !!section && (!coach || !mob?.image || (live && !!liveSrc));
  useEffect(() => { readyRef.current = ready; if (ready) ch.current?.send({ t: 'ready' }); }, [ready]);
  if (error) return <div className="hold-msg"><h1>Hmm</h1><p>{error}</p></div>;
  if (!section) return <div className="hold-msg"><p>Loading…</p></div>;
  const image = mob?.image;
  const showLive = live && !!liveSrc;
  return <div className={`hold ${showLive ? 'is-live' : ''}`}>
    {/* Only while it's still connecting; once linked it gets out of the way. */}
    <AnimatePresence>{!linked && <motion.div key="pill" className="hold-pill" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }} transition={{ delay: .9, duration: .4 }}>
      <i />Connecting to the laptop…
    </motion.div>}</AnimatePresence>
    {showLive
      ? <iframe key={liveSrc} className="hold-live" src={liveSrc} title="Live prototype" allow="fullscreen; clipboard-write" />
      : <motion.div className="hold-screen" ref={scroller} onScroll={report} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      initial={{ y: '-110%', rotate: -14, scale: .9 }} animate={{ y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay: .15 }}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div key={stage} className="hold-page" custom={dir}
          variants={{ in: (d: number) => ({ x: `${d * 100}%`, opacity: .4 }), on: { x: 0, opacity: 1 }, out: (d: number) => ({ x: `${d * -100}%`, opacity: .4 }) }}
          initial="in" animate="on" exit="out" transition={{ type: 'spring', stiffness: 260, damping: 32 }}>
          {!image ? <p className="hold-empty">No mobile screen in this section yet.</p>
            : segs ? <div className="hold-stack" ref={() => requestAnimationFrame(restore)}>{segs.list.map((sg, k) => <div key={k} style={{ aspectRatio: `${sg.w} / ${sg.h}`, backgroundImage: `url("${image}")`, backgroundSize: `${(segs.W / sg.w) * 100}% auto`, backgroundPosition: `${segs.W === sg.w ? 0 : (sg.x / (segs.W - sg.w)) * 100}% ${segs.H === sg.h ? 0 : (sg.y / (segs.H - sg.h)) * 100}%` }} />)}</div>
            : <img src={image} alt={mob?.title || 'Screen'} draggable={false} onLoad={restore} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>}
    <div className="hold-dock">
      {liveSrc && <button type="button" className="hold-btn" onClick={() => setLive(v => !v)}>{showLive ? 'Back to the screen' : 'Try the prototype'}</button>}
      {showLive && <a className="hold-btn is-ghost" href={liveRaw} target="_blank" rel="noopener">Open full screen</a>}
      {appLink && <a className="hold-btn is-ghost" href={appLink} target="_blank" rel="noopener">Get the app</a>}
    </div>
    <AnimatePresence>{hud > 0 && <motion.div key={hud} className="hold-hud" initial={{ opacity: 0, y: -14 }} animate={{ opacity: [0, 1, 1, 0], y: [-14, 0, 0, -8] }} transition={{ duration: 1.3, times: [0, .15, .75, 1] }} aria-live="polite">
      <small>{stage === 'b' ? '→' : '←'}</small>{stage === 'b' ? nameB : nameA}
    </motion.div>}</AnimatePresence>
    <AnimatePresence>{coach && !showLive && image && <HoldCoach key="coach" versions={compare ? [nameA, nameB] : undefined} reduce={reduce} onDone={() => setCoach(false)} />}</AnimatePresence>
  </div>;
}
