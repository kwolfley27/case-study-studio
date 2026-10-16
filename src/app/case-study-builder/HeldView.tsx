import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useReducedMotion } from './MotionKit';
import { useScreens } from './ScrollSite';

/*
  What the laptop shows while a visitor scrolls the screen on their own phone.
  The screen goes dark and still so the phone is the thing to look at. Only two things move:
  - the note for the part of the page they're looking at, written large;
  - a soft glow that takes on the colours currently on their phone, so the room changes as they scroll.
  A faint outline of the whole page, with a lit window, shows where they are.
*/
type HeldNote = { title: string; detail: string; at: number; i: number };

/* Average colour of the part of the page in view, read from a tiny copy of the image. */
function usePageColours(image: string | undefined, segs: ReturnType<typeof useScreens>) {
  const [px, setPx] = useState<{ d: Uint8ClampedArray; h: number } | null>(null);
  useEffect(() => {
    setPx(null); if (!image) return;
    let dead = false; const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (dead) return;
      try {
        const W = 24; const parts = segs ? segs.list : [{ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }];
        const H = Math.max(1, Math.round(parts.reduce((s, p) => s + p.h * W / p.w, 0)));
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
        let y = 0; for (const p of parts) { const h = p.h * W / p.w; g.drawImage(img, p.x, p.y, p.w, p.h, 0, y, W, h); y += h; }
        setPx({ d: g.getImageData(0, 0, W, H).data, h: H });
      } catch { /* image from another site without permission: keep the accent glow */ }
    };
    img.src = image; return () => { dead = true; };
  }, [image, segs]);
  return (top: number, bottom: number): string | null => {
    if (!px) return null;
    const a = Math.floor(top * px.h), b = Math.max(a + 1, Math.ceil(bottom * px.h));
    let r = 0, gg = 0, bl = 0, wsum = 0;
    for (let y = a; y < Math.min(b, px.h); y++) for (let x = 0; x < 24; x++) {
      const i = (y * 24 + x) * 4; const R = px.d[i], G = px.d[i + 1], B = px.d[i + 2];
      // Colourful pixels count for more than greys and whites, so the glow picks up the brand colour, not the background.
      const sat = Math.max(R, G, B) - Math.min(R, G, B); const w = 1 + sat / 12;
      r += R * w; gg += G * w; bl += B * w; wsum += w;
    }
    if (!wsum) return null;
    return `rgb(${Math.round(r / wsum)} ${Math.round(gg / wsum)} ${Math.round(bl / wsum)})`;
  };
}

export function HeldView({ image, stackMob, notes, f, v, stage, onStage }: {
  image?: string; stackMob: boolean; notes: HeldNote[]; f: number; v: number;
  stage?: { names: [string, string]; current: 'a' | 'b' };
  onStage?: (s: 'a' | 'b') => void;
}) {
  const reduce = useReducedMotion();
  const segs = useScreens(image, stackMob);
  const colourAt = usePageColours(image, segs);
  const vis = Math.min(1, Math.max(.04, v || .35));
  const top = Math.max(0, Math.min(1 - vis, f * (1 - vis))); const bottom = top + vis; const mid = (top + bottom) / 2;
  const pad = vis * .12;
  const active = useMemo(() => notes.filter(n => n.at >= top + (top > .001 ? pad : -1) && n.at <= bottom - (bottom < .999 ? pad : -1)).sort((a, b) => Math.abs(a.at - mid) - Math.abs(b.at - mid))[0] ?? null, [notes, top, bottom, mid, pad]);
  const glow = colourAt(top, bottom);
  // The first few seconds: a short welcome, then the notes take over.
  const [intro, setIntro] = useState(true);
  useEffect(() => { const t = setTimeout(() => setIntro(false), 2600); return () => clearTimeout(t); }, []);
  const seen = useRef(new Set<number>()); if (active) seen.current.add(active.i);
  const words = (s: string) => s.split(/(\s+)/).filter(Boolean);
  // When the version flips, a wash of colour sweeps across the screen in the direction they swiped.
  const prevStage = useRef(stage?.current);
  const [sweep, setSweep] = useState<{ n: number; to: 'a' | 'b' } | null>(null);
  useEffect(() => { if (!stage) return; if (prevStage.current && prevStage.current !== stage.current) setSweep(sw => ({ n: (sw?.n ?? 0) + 1, to: stage.current })); prevStage.current = stage.current; }, [stage?.current]);

  return <div className={`csb-held ${stage ? `is-v-${stage.current}` : ''}`}>
    <AnimatePresence>{sweep && stage && <motion.div key={sweep.n} className={`csb-held-sweep is-${sweep.to}`} aria-hidden="true"
      initial={{ x: sweep.to === 'b' ? '100%' : '-100%', opacity: 1 }} animate={{ x: sweep.to === 'b' ? '-100%' : '100%' }} exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 1.1, ease: [0.45, 0, 0.2, 1] }} onAnimationComplete={() => setSweep(null)} />}</AnimatePresence>
    <AnimatePresence>{sweep && stage && <motion.div key={`l${sweep.n}`} className={`csb-held-flip is-${sweep.to}`} aria-live="polite"
      initial={{ opacity: 0, scale: .94, filter: 'blur(8px)' }} animate={{ opacity: [0, 1, 1, 0], scale: [.94, 1, 1, 1.02], filter: ['blur(8px)', 'blur(0px)', 'blur(0px)', 'blur(4px)'] }}
      transition={{ duration: 1.4, times: [0, .2, .75, 1] }}>{sweep.to === 'b' ? stage.names[1] : stage.names[0]}</motion.div>}</AnimatePresence>
    <div className="csb-held-glow" style={glow ? { backgroundColor: glow } : undefined} aria-hidden="true" />
    <div className="csb-held-glow is-b" style={glow ? { backgroundColor: glow } : undefined} aria-hidden="true" />

    {stage && <div className="csb-held-stages" role="radiogroup" aria-label="Version">
      {(['a', 'b'] as const).map(s => <button key={s} type="button" role="radio" aria-checked={stage.current === s} onClick={() => onStage?.(s)}>
        {stage.current === s && <motion.i layoutId="held-knob" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}<span>{s === 'a' ? stage.names[0] : stage.names[1]}</span></button>)}
    </div>}

    <div className="csb-held-main">
      <span className="csb-held-spacer" aria-hidden="true" />
      <div className="csb-held-map" aria-hidden="true">
        <div className="csb-held-page">
          {image && (segs ? <div className="csb-held-stack">{segs.list.map((sg, k) => <div key={k} style={{ aspectRatio: `${sg.w} / ${sg.h}`, backgroundImage: `url("${image}")`, backgroundSize: `${(segs.W / sg.w) * 100}% auto`, backgroundPosition: `${segs.W === sg.w ? 0 : (sg.x / (segs.W - sg.w)) * 100}% ${segs.H === sg.h ? 0 : (sg.y / (segs.H - sg.h)) * 100}%` }} />)}</div>
            : <img src={image} alt="" draggable={false} />)}
          <span className="csb-held-window" style={{ top: `${top * 100}%`, height: `${vis * 100}%` }} />
          {notes.map(n => <i key={n.i} className={`csb-held-dot ${active?.i === n.i ? 'is-on' : seen.current.has(n.i) ? 'is-seen' : ''}`} style={{ top: `${n.at * 100}%` }} />)}
        </div>
      </div>

      <div className="csb-held-copy" aria-live="polite">
        <AnimatePresence mode="wait">
          {intro ? <motion.div key="intro" className="csb-held-note" initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }} transition={{ duration: .6, ease: [0.22, 1, 0.36, 1] }}>
            <small>Look down</small>
            <h3>It’s in your hand now.</h3>
            <p>Scroll on your phone. Each design decision appears here as you reach it.</p>
          </motion.div>
          : active ? <motion.div key={active.i} className="csb-held-note" exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }} transition={{ duration: .3 }}>
            <motion.small initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}>{notes.findIndex(n => n.i === active.i) + 1} of {notes.length}</motion.small>
            <h3>{words(active.title).map((w, k) => /^\s+$/.test(w) ? ' ' : <motion.span key={k} initial={reduce ? false : { opacity: 0, y: 12, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: .55, delay: k * .045, ease: [0.22, 1, 0.36, 1] }}>{w}</motion.span>)}</h3>
            {active.detail && <motion.p initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, delay: .25 + words(active.title).length * .03 }}>{active.detail}</motion.p>}
          </motion.div>
          : <motion.div key="idle" className="csb-held-note is-idle" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .4 }}>
            <small>{notes.length ? `${seen.current.size} of ${notes.length} seen` : 'Live'}</small>
            <h3>{notes.length ? (seen.current.size >= notes.length ? 'That’s every decision on this page.' : 'Keep scrolling.') : 'Have a look around.'}</h3>
            {notes.length > 0 && seen.current.size < notes.length && <p>The next note appears when you reach its part of the page.</p>}
          </motion.div>}
        </AnimatePresence>
      </div>
    </div>
  </div>;
}
