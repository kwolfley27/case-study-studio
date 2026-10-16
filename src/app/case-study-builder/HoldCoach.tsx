import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

/*
  The first thing someone sees on their phone: a short how-to drawn in thin outlines —
  a hand on a phone, showing scroll, then swipe left and swipe right (only when there are two versions).
  It plays on its own and goes away the moment they touch the screen.
*/
type Step = { k: 'scroll' | 'left' | 'right'; title: string; sub: string };

const INK = '#000';
// A pointing hand, fingertip at (0,0), drawn as one outline.
const HAND = 'M-6 6C-6-2 6-2 6 6L6 38C6 33 17 33 17 40C17 35 27 35 27 43C27 38 36 39 36 47L36 66C36 84 26 94 10 94L2 94C-8 94-14 88-19 80L-33 58C-36 53-30 48-25 52L-6 66Z';

/*
  Each loop acts out the gesture: the hand comes in, the fingertip presses (a ring appears),
  drags while a trail grows behind it and the screen moves with it, then lifts and goes.
*/
const T = [0, .14, .24, .7, .8, 1];             // in, press, drag…, lift, out
function Drawing({ k, reduce }: { k: Step['k']; reduce: boolean }) {
  const loop = { duration: 2.6, repeat: Infinity, ease: 'easeInOut' as const, times: T, repeatDelay: .15 };
  const D = k === 'scroll' ? { x: 0, y: -52 } : { x: k === 'left' ? -58 : 58, y: 0 };
  const sx = k === 'scroll' ? 0 : -D.x / 2, sy = k === 'scroll' ? 26 : 0;   // where the finger lands
  // Offsets from where the finger lands: drift in, hold, drag, hold, drift on.
  const move = (b: number) => b === 0 ? [0, 0, 0, 0, 0, 0] : [-.12 * b, 0, 0, b, b, b * 1.12];
  const hand = { x: move(D.x), y: move(D.y), opacity: [0, 1, 1, 1, 1, 0] };
  const press = { scale: [1, 1, .9, .9, 1, 1] };
  const ring = { scale: [.4, .4, 1, 1, 1.6, 1.6], opacity: [0, 0, .55, .55, 0, 0] };
  const trail = { scale: [0, 0, 0, 1, 1, 1], opacity: [0, 0, .35, .35, 0, 0] };
  const page = k === 'scroll' ? { y: [0, 0, 0, -52, -52, -52] } : {};
  const card = k === 'scroll' ? {} : { x: [0, 0, 0, k === 'left' ? -76 : 76, k === 'left' ? -76 : 76, k === 'left' ? -76 : 76] };
  const X = 86 + sx, Y = 100 + sy;              // fingertip on the phone
  const len = Math.abs(D.x || D.y);
  return <svg viewBox="0 0 160 200" className="hold-coach-svg" aria-hidden="true">
    <defs><clipPath id="hc-screen"><rect x="45" y="22" width="70" height="140" rx="9" /></clipPath></defs>
    <rect x="40" y="16" width="80" height="152" rx="15" fill="#fdfcfc" stroke={INK} strokeWidth="1.6" />
    <rect x="68" y="23" width="24" height="6" rx="3" fill={INK} />
    <g clipPath="url(#hc-screen)">
      {k === 'scroll'
        ? <motion.g animate={reduce ? undefined : page} transition={loop}>
            {[0, 1, 2, 3, 4, 5, 6].map(i => <g key={i}><rect x="52" y={38 + i * 34} width="56" height="20" rx="4" fill="none" stroke={INK} strokeWidth="1.2" opacity={i % 2 ? .35 : .7} /><line x1="52" y1={64 + i * 34} x2={i % 2 ? 90 : 100} y2={64 + i * 34} stroke={INK} strokeWidth="1.2" opacity=".3" /></g>)}
          </motion.g>
        : <motion.g animate={reduce ? undefined : card} transition={loop}>
            {[-1, 0, 1].map(o => <g key={o} transform={`translate(${o * 76} 0)`}>
              <rect x="52" y="40" width="56" height="64" rx="5" fill={o === 0 ? 'none' : INK} fillOpacity=".06" stroke={INK} strokeWidth="1.2" opacity={o === 0 ? .7 : .45} />
              <line x1="52" y1="116" x2="100" y2="116" stroke={INK} strokeWidth="1.2" opacity=".35" />
              <line x1="52" y1="126" x2="88" y2="126" stroke={INK} strokeWidth="1.2" opacity=".25" />
            </g>)}
          </motion.g>}
    </g>
    {/* the trail the fingertip leaves behind */}
    {!reduce && <motion.rect x={k === 'scroll' ? X - 3 : D.x < 0 ? X - len : X} y={k === 'scroll' ? Y - len : Y - 3} width={k === 'scroll' ? 6 : len} height={k === 'scroll' ? len : 6} rx="3" fill={INK}
      style={{ originX: k === 'scroll' ? .5 : D.x < 0 ? 1 : 0, originY: k === 'scroll' ? 1 : .5 }} animate={trail} transition={loop} />}
    <motion.g animate={reduce ? { opacity: 1 } : hand} transition={loop}>
      <g transform={`translate(${X} ${Y})`}>
        {!reduce && <motion.circle r="11" fill="none" stroke={INK} strokeWidth="1.4" animate={ring} transition={loop} />}
        <motion.g animate={reduce ? undefined : press} transition={loop} style={{ originX: '48%', originY: '3%' }}>
          <g transform="rotate(-14)">
            <path d={HAND} fill="#fdfcfc" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M6 38V48M17 40V49M27 43V50" stroke={INK} strokeWidth="1.2" strokeLinecap="round" opacity=".5" />
          </g>
        </motion.g>
      </g>
    </motion.g>
  </svg>;
}

export function HoldCoach({ versions, onDone, reduce }: { versions?: [string, string]; onDone: () => void; reduce: boolean }) {
  const steps: Step[] = [
    { k: 'scroll', title: 'Drag up to scroll', sub: 'Move down the page with one finger. The big screen explains each part as you reach it.' },
    ...(versions ? [
      { k: 'left' as const, title: 'Swipe left', sub: `Flick across to see the ${versions[1].toLowerCase()}.` },
      { k: 'right' as const, title: 'Swipe right', sub: `Flick back to see the ${versions[0].toLowerCase()}.` },
    ] : []),
  ];
  const [at, setAt] = useState(0);
  useEffect(() => { if (steps.length < 2) return; const t = setInterval(() => setAt(a => (a + 1) % steps.length), 5600); return () => clearInterval(t); }, [steps.length]);
  const s = steps[at];
  return <motion.div className="hold-coach" role="dialog" aria-label="How to use this" onPointerDown={onDone}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .3 } }} transition={{ duration: .4, delay: .9 }}>
    <AnimatePresence mode="wait">
      <motion.div key={s.k} className="hold-coach-step" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .35 }}>
        <Drawing k={s.k} reduce={reduce} />
        <h2>{s.title}</h2>
        <p>{s.sub}</p>
      </motion.div>
    </AnimatePresence>
    {steps.length > 1 && <div className="hold-coach-dots" aria-hidden="true">{steps.map((_, i) => <i key={i} className={i === at ? 'is-on' : ''} />)}</div>}
    <button type="button" className="hold-coach-go" onClick={onDone}>Start</button>
  </motion.div>;
}
