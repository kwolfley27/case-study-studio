import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { Minimize2, Smartphone, X } from 'lucide-react';
import { holdLink, newHoldCode, openHold, type HoldChannel, type HoldMsg } from './HoldSync';
import { StudyMeta } from './StudyMeta';

/*
  Laptop side of "Hold it": a quiet button under the phone mockup. It opens a QR code; when a phone
  joins, the mockup flies off the page "into" their phone, then comes back mirroring their scroll,
  so the highlights and notes here follow what they're looking at in their hand.
*/
export function HoldIt({ sectionId, stage, root, onPick, onLive, held, onScroll }: { sectionId: string; stage: string; root: React.RefObject<HTMLElement | null>; onPick?: (stage: 'a' | 'b') => void; onLive?: (live: boolean) => void; held?: boolean; onScroll?: (f: number, v?: number) => void }) {
  const { slug, published } = useContext(StudyMeta);
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState('');
  const [state, setState] = useState<'idle' | 'waiting' | 'live'>('idle');
  const [proto, setProto] = useState(false);
  const pickRef = useRef(onPick); pickRef.current = onPick;
  const liveRef = useRef(onLive); liveRef.current = onLive;
  const scrollCb = useRef(onScroll); scrollCb.current = onScroll;
  // The little phone that peeks up from the corner while this section is on screen.
  const [inView, setInView] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem('csb-hold-peek-off') === '1'; } catch { return false; } });
  const dismiss = () => { setDismissed(true); setPeekOpen(false); try { sessionStorage.setItem('csb-hold-peek-off', '1'); } catch { /* ignore */ } };
  const code = useRef(newHoldCode());
  const ch = useRef<HoldChannel | null>(null);
  const stageRef = useRef(stage); stageRef.current = stage;
  const lastSeen = useRef(0);
  const link = slug ? holdLink(slug, sectionId, code.current) : '';

  const phoneScroller = () => root.current?.querySelector<HTMLElement>('.csb-ss-phone .csb-ss-scroll') ?? null;
  const throwPhone = () => {
    const ph = root.current?.querySelector<HTMLElement>('.csb-ss-phone'); if (!ph) return;
    ph.classList.remove('is-thrown'); void ph.offsetWidth; ph.classList.add('is-thrown');
    setTimeout(() => ph.classList.remove('is-thrown'), 2200);
  };
  const onMsg = (m: HoldMsg) => {
    lastSeen.current = Date.now();
    if (m.t === 'hello') { ch.current?.send({ t: 'hi', stage: stageRef.current }); setState(s => { if (s !== 'live') { throwPhone(); setOpen(false); } return 'live'; }); }
    if (m.t === 'scroll') { scrollCb.current?.(m.f, m.v); const el = phoneScroller(); if (el) el.scrollTop = m.f * (el.scrollHeight - el.clientHeight); }
    if (m.t === 'pick' && (m.stage === 'a' || m.stage === 'b')) { stageRef.current = m.stage; pickRef.current?.(m.stage); }
    if (m.t === 'mode') setProto(m.live);
    if (m.t === 'bye') { setState('waiting'); setProto(false); }
  };
  const start = async () => { if (ch.current) return; setState('waiting'); ch.current = await openHold(code.current, onMsg); };
  useEffect(() => { const el = root.current; if (!el) return; const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: .3 }); io.observe(el); return () => io.disconnect(); }, []);
  const peeking = inView && !dismissed && state !== 'live' && !open;
  // Let the phone fly off the page first, then dim the screen.
  useEffect(() => { if (state !== 'live') { liveRef.current?.(false); return; } const t = setTimeout(() => liveRef.current?.(true), 950); return () => clearTimeout(t); }, [state]);
  useEffect(() => { if (!held) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') liveRef.current?.(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [held]);
  useEffect(() => { if ((open || peeking) && link) { void start(); QRCode.toString(link, { type: 'svg', margin: 0, color: { dark: '#000000', light: '#00000000' } }).then(setQr, () => setQr('')); } }, [open, peeking, link]);
  useEffect(() => { if (state === 'live') ch.current?.send({ t: 'stage', stage }); }, [stage, state]);
  // If the phone goes quiet for a while, show the button again.
  useEffect(() => { if (state !== 'live') return; const t = setInterval(() => { if (Date.now() - lastSeen.current > 20000) setState('waiting'); }, 5000); return () => clearInterval(t); }, [state]);
  useEffect(() => () => ch.current?.close(), []);
  if (!slug) return null;

  const host = (root.current?.closest('.csb-app') as HTMLElement | null) ?? (typeof document !== 'undefined' ? document.body : null);
  const peek = host && createPortal(<AnimatePresence>{peeking && <motion.div key="peek" className={`csb-hold-peek ${peekOpen ? 'is-open' : ''}`} data-link={link}
    initial={{ y: 470, rotate: 6 }} animate={{ y: peekOpen ? 0 : 196, rotate: peekOpen ? 0 : -4 }} exit={{ y: 480, rotate: 6 }}
    transition={{ type: 'spring', stiffness: 170, damping: 19, delay: peekOpen ? 0 : .5 }}>
    <button type="button" className="csb-hold-peek-x" aria-label="No thanks" onClick={dismiss}><X size={12} strokeWidth={2.2} /></button>
    <button type="button" className="csb-hold-peek-phone" aria-label={peekOpen ? 'QR code to open this on your phone' : 'Try this on your phone'} aria-expanded={peekOpen} onClick={() => setPeekOpen(o => !o)}>
      <span className="csb-hold-peek-island" aria-hidden="true" />
      <span className="csb-hold-peek-screen">
        <small className="is-kicker">On your phone</small>
        <b>Hold the real thing.</b>
        {qr ? <span className="csb-hold-peek-qr" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: qr }} /> : <span className="csb-hold-peek-qr" />}
        <small>{published === false ? 'Publish first so phones can open it.' : 'Point your camera here. Scroll it in your hand, and this screen explains each part.'}</small>
      </span>
    </button>
  </motion.div>}</AnimatePresence>, host);

  return <div className="csb-hold">{peek}
    {held && proto && <span className="csb-hold-live"><i /> They’re tapping through the prototype</span>}
    {held && <button type="button" className="csb-hold-exit" onClick={() => liveRef.current?.(false)}><Minimize2 size={14} /> Back to the page</button>}
    {state === 'live'
      ? held ? null : <span className="csb-hold-live"><i /> {proto ? 'They’re trying the prototype on their phone' : 'Live from their phone'}</span>
      : peeking ? null : <button type="button" className="csb-hold-btn" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}><Smartphone size={14} strokeWidth={1.8} /> Hold it on your phone</button>}
    {open && <div className="csb-hold-card" role="dialog" aria-label="Open this screen on your phone" data-link={link} onClick={e => e.stopPropagation()}>
      <button type="button" className="csb-hold-x" aria-label="Close" onClick={() => setOpen(false)}><X size={14} /></button>
      <strong>Scroll the real thing</strong>
      <p>Point your phone’s camera here. The screen opens in your hand, and the notes on this page follow along as you scroll.</p>
      {qr ? <span className="csb-hold-qr" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: qr }} /> : <span className="csb-hold-qr" />}
      <small>{published === false ? 'Publish the case study first so phones can open it.' : state === 'waiting' ? 'Waiting for your phone…' : ''}</small>
    </div>}
  </div>;
}
