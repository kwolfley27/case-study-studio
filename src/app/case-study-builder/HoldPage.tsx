import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
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
    const onMsg = (m: HoldMsg) => { if (m.t === 'hi') { setLinked(true); if (m.stage) setStage(m.stage); } if (m.t === 'stage') setStage(m.stage); };
    void openHold(code, onMsg).then(c => { if (!alive) { c.close(); return; } ch.current = c; c.send({ t: 'hello', ua: navigator.userAgent.slice(0, 60) }); });
    // Say hello again a few times in case the laptop joined late.
    const again = setInterval(() => ch.current?.send({ t: 'hello' }), 1500);
    const bye = () => ch.current?.send({ t: 'bye' });
    window.addEventListener('pagehide', bye);
    return () => { alive = false; clearInterval(again); window.removeEventListener('pagehide', bye); bye(); ch.current?.close(); };
  }, [code]);
  useEffect(() => { if (linked) { try { navigator.vibrate?.([12, 40, 18]); } catch { /* ignore */ } } }, [linked]);

  const off = section?.options?.compare === true && stage === 'b' ? 2 : 0;
  const mob = section?.items[off + 1];
  const segs = useScreens(mob?.image, section?.options?.stackMob === true);
  // About 20 updates a second is smooth on the laptop and well inside the live channel's limits.
  const lastSent = useRef(0);
  const report = () => { if (frame.current) return; const wait = Math.max(0, 50 - (Date.now() - lastSent.current)); frame.current = window.setTimeout(() => { frame.current = 0; lastSent.current = Date.now(); const el = scroller.current; if (!el) return; const max = el.scrollHeight - el.clientHeight; ch.current?.send({ t: 'scroll', f: max > 0 ? Math.round(el.scrollTop / max * 1000) / 1000 : 0 }); }, wait); };

  if (error) return <div className="hold-msg"><h1>Hmm</h1><p>{error}</p></div>;
  if (!section) return <div className="hold-msg"><p>Loading…</p></div>;
  const image = mob?.image;
  return <div className="hold">
    <motion.div className="hold-pill" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .9, duration: .4 }}>
      <i className={linked ? 'is-on' : ''} />{linked ? `Connected to ${title || 'the case study'}` : 'Connecting to the laptop…'}
    </motion.div>
    <motion.div className="hold-screen" ref={scroller} onScroll={report}
      initial={{ y: '-110%', rotate: -14, scale: .9 }} animate={{ y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay: .15 }}>
      {!image ? <p className="hold-empty">No mobile screen in this section yet.</p>
        : segs ? <div className="hold-stack">{segs.list.map((sg, k) => <div key={k} style={{ aspectRatio: `${sg.w} / ${sg.h}`, backgroundImage: `url("${image}")`, backgroundSize: `${(segs.W / sg.w) * 100}% auto`, backgroundPosition: `${segs.W === sg.w ? 0 : (sg.x / (segs.W - sg.w)) * 100}% ${segs.H === sg.h ? 0 : (sg.y / (segs.H - sg.h)) * 100}%` }} />)}</div>
        : <img src={image} alt={mob?.title || 'Screen'} draggable={false} onLoad={report} />}
    </motion.div>
    <p className="hold-hint">Scroll here. The notes follow on the laptop.</p>
  </div>;
}
