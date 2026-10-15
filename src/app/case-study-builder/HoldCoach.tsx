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

function Drawing({ k, reduce }: { k: Step['k']; reduce: boolean }) {
  const loop = { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const, times: [0, .18, .78, 1], repeatDelay: .2 };
  const hand = k === 'scroll' ? { x: 0, y: [30, 26, -24, -24], opacity: [0, 1, 1, 0] } : { x: k === 'left' ? [30, 26, -28, -28] : [-30, -26, 28, 28], y: 0, opacity: [0, 1, 1, 0] };
  const page = k === 'scroll' ? { y: [0, 0, -50, -50] } : {};
  const card = k === 'left' ? { x: [0, 0, -76, -76] } : k === 'right' ? { x: [0, 0, 76, 76] } : {};
  return <svg viewBox="0 0 160 200" className="hold-coach-svg" aria-hidden="true">
    <defs><clipPath id="hc-screen"><rect x="45" y="22" width="70" height="140" rx="9" /></clipPath></defs>
    <rect x="40" y="16" width="80" height="152" rx="15" fill="#fdfcfc" stroke={INK} strokeWidth="1.6" />
    <rect x="68" y="23" width="24" height="6" rx="3" fill={INK} />
    <g clipPath="url(#hc-screen)">
      {k === 'scroll'
        ? <motion.g animate={reduce ? undefined : page} transition={loop}>
            {[0, 1, 2, 3, 4, 5].map(i => <g key={i}><rect x="52" y={38 + i * 34} width="56" height="20" rx="4" fill="none" stroke={INK} strokeWidth="1.2" opacity={i % 2 ? .35 : .7} /><line x1="52" y1={64 + i * 34} x2={i % 2 ? 90 : 100} y2={64 + i * 34} stroke={INK} strokeWidth="1.2" opacity=".3" /></g>)}
          </motion.g>
        : <motion.g animate={reduce ? undefined : card} transition={loop}>
            {[-1, 0, 1].map(o => <g key={o} transform={`translate(${o * 76} 0)`}>
              <rect x="52" y="40" width="56" height="64" rx="5" fill={o === 0 ? 'none' : INK} fillOpacity=".06" stroke={INK} strokeWidth="1.2" opacity={o === 0 ? .7 : .45} />
              <line x1="52" y1="116" x2="100" y2="116" stroke={INK} strokeWidth="1.2" opacity=".35" />
              <line x1="52" y1="126" x2="88" y2="126" stroke={INK} strokeWidth="1.2" opacity=".25" />
            </g>)}
          </motion.g>}
    </g>
    {k !== 'scroll' && <g opacity=".5" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      {k === 'left' ? <path d="M30 92h-14m5-5-5 5 5 5" /> : <path d="M130 92h14m-5-5 5 5-5 5" />}
    </g>}
    <motion.g animate={reduce ? { opacity: 1 } : hand} transition={loop}>
      <g transform="translate(86 104) rotate(-14)">
        <circle r="9" fill="none" stroke={INK} strokeWidth="1.2" opacity=".35" />
        <path d={HAND} fill="#fdfcfc" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M6 38V48M17 40V49M27 43V50" stroke={INK} strokeWidth="1.2" strokeLinecap="round" opacity=".5" />
      </g>
    </motion.g>
  </svg>;
}

export function HoldCoach({ versions, onDone, reduce }: { versions?: [string, string]; onDone: () => void; reduce: boolean }) {
  const steps: Step[] = [
    { k: 'scroll', title: 'Scroll', sub: 'The screen beside you explains each part as you reach it.' },
    ...(versions ? [
      { k: 'left' as const, title: 'Swipe left', sub: `To see the ${versions[1].toLowerCase()}.` },
      { k: 'right' as const, title: 'Swipe right', sub: `To go back to the ${versions[0].toLowerCase()}.` },
    ] : []),
  ];
  const [at, setAt] = useState(0);
  useEffect(() => { if (steps.length < 2) return; const t = setInterval(() => setAt(a => (a + 1) % steps.length), 2700); return () => clearInterval(t); }, [steps.length]);
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
