import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { Minimize2, Smartphone, X } from 'lucide-react';
import { holdLink, newHoldCode, openHold, type HoldChannel, type HoldMsg, type TaskState } from './HoldSync';
import { StudyMeta } from './StudyMeta';

/*
  Laptop side of "Hold it": a quiet button under the phone mockup. It opens a QR code; when a phone
  joins, the mockup flies off the page "into" their phone, then comes back mirroring their scroll,
  so the highlights and notes here follow what they're looking at in their hand.
*/
export type HoldSession = { stale: boolean; presenter: boolean; task: TaskState | null; ending: boolean };
export type HoldControl = { finish: () => void; leave: () => void };
const RESULT_KINDS = /csb-kind-(metrics|taskSuccess|abtest|barChart|findings|insights|comparison)\b/;

export function HoldIt({ sectionId, stage, root, onPick, onLive, held, onScroll, onSession, control, base, after }: {
  sectionId: string; stage: string; root: React.RefObject<HTMLElement | null>; onPick?: (stage: 'a' | 'b') => void; onLive?: (live: boolean) => void; held?: boolean;
  onScroll?: (f: number, v?: number) => void; onSession?: (s: HoldSession) => void; control?: React.MutableRefObject<HoldControl | null>; base?: string; after?: string;
}) {
  const { slug, published } = useContext(StudyMeta);
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState('');
  const [state, setState] = useState<'idle' | 'waiting' | 'live'>('idle');
  const [proto, setProto] = useState(false);
  const [ready, setReady] = useState(false);
  const [stale, setStale] = useState(false);
  const [presenter, setPresenter] = useState(false);
  const [task, setTask] = useState<TaskState | null>(null);
  const [ending, setEnding] = useState(false);
  const [finished, setFinished] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const sessionCb = useRef(onSession); sessionCb.current = onSession;
  useEffect(() => { sessionCb.current?.({ stale, presenter, task, ending }); }, [stale, presenter, task, ending]);
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
  const link = slug ? holdLink(slug, sectionId, code.current, presenting, base) : '';
  const linkHost = (() => { try { return new URL(link).host; } catch { return ''; } })();

  const phoneScroller = () => root.current?.querySelector<HTMLElement>('.csb-ss-phone .csb-ss-scroll') ?? null;
  const throwPhone = () => {
    const ph = root.current?.querySelector<HTMLElement>('.csb-ss-phone'); if (!ph) return;
    ph.classList.remove('is-thrown'); void ph.offsetWidth; ph.classList.add('is-thrown');
    setTimeout(() => ph.classList.remove('is-thrown'), 2200);
  };
  const onMsg = (m: HoldMsg) => {
    lastSeen.current = Date.now();
    setStale(false);
    if (m.t === 'ready' || (m.t === 'hello' && m.ready)) setReady(true);
    if (m.t === 'hello' && m.presenter != null) setPresenter(!!m.presenter);
    if (m.t === 'task') setTask(m.s);
    if (m.t === 'done') setEnding(true);
    if (m.t === 'hello') { ch.current?.send({ t: 'hi', stage: stageRef.current }); setState(s => { if (s !== 'live') { throwPhone(); setOpen(false); } return 'live'; }); }
    if (m.t === 'scroll') { scrollCb.current?.(m.f, m.v); const el = phoneScroller(); if (el) el.scrollTop = m.f * (el.scrollHeight - el.clientHeight); }
    if (m.t === 'pick' && (m.stage === 'a' || m.stage === 'b')) { stageRef.current = m.stage; pickRef.current?.(m.stage); }
    if (m.t === 'mode') setProto(m.live);
    if (m.t === 'bye') { setState('waiting'); setProto(false); setReady(false); setTask(null); setEnding(false); }
  };
  const start = async () => { if (ch.current) return; setState('waiting'); ch.current = await openHold(code.current, onMsg); };
  useEffect(() => { const el = root.current; if (!el) return; const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: .3 }); io.observe(el); return () => io.disconnect(); }, []);
  const peeking = inView && !dismissed && state !== 'live' && !open;
  // Let the phone fly off the page first, then dim the screen.
  useEffect(() => { if (state !== 'live' || !ready || finished) { liveRef.current?.(false); return; } const t = setTimeout(() => liveRef.current?.(true), 500); return () => clearTimeout(t); }, [state, ready, finished]);
  useEffect(() => { if (!held) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') leave(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [held]);
  // Draw the code as soon as the little phone peeks; only open the live connection once someone shows interest.
  useEffect(() => { if ((open || peeking) && link && !qr) QRCode.toString(link, { type: 'svg', margin: 0, color: { dark: '#000000', light: '#00000000' } }).then(setQr, () => setQr('')); }, [open, peeking, link]);
  useEffect(() => { if ((open || peekOpen) && link) void start(); }, [open, peekOpen, link]);
  useEffect(() => { if (state === 'live') ch.current?.send({ t: 'stage', stage }); }, [stage, state]);
  // The phone says hello every 1.5s. Quiet for 5s: "Reconnecting…". Quiet for 25s: give up and show the button again.
  useEffect(() => { if (state !== 'live') return; const t = setInterval(() => { const q = Date.now() - lastSeen.current; setStale(q > 5000); if (q > 25000) { setState('waiting'); setReady(false); setTask(null); setEnding(false); } }, 1000); return () => clearInterval(t); }, [state]);
  // The end: tell the phone to look up, step out of full screen, and carry on to the results.
  const finish = () => {
    ch.current?.send({ t: 'end' }); setEnding(false); setFinished(true); liveRef.current?.(false);
    const all = [...document.querySelectorAll<HTMLElement>('[id^="builder-section-"]')];
    const me = all.findIndex(el => el.id === `builder-section-${sectionId}`);
    const later = all.slice(me + 1);
    const dest = (after && later.find(el => el.id === `builder-section-${after}`)) || later.find(el => RESULT_KINDS.test(el.className)) || later[0];
    setTimeout(() => dest?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 450);
  };
  const leave = () => { setFinished(true); liveRef.current?.(false); };
  if (control) control.current = { finish, leave };
  useEffect(() => () => ch.current?.close(), []);
  if (!slug) return null;

  const host = (root.current?.closest('.csb-app') as HTMLElement | null) ?? (typeof document !== 'undefined' ? document.body : null);
  const peek = host && createPortal(<AnimatePresence>{peeking && <motion.div key="peek" className={`csb-hold-peek ${peekOpen ? 'is-open' : ''}`} data-link={link}
    initial={{ y: 470, rotate: 6 }} animate={{ y: peekOpen ? 0 : 196, rotate: peekOpen ? 0 : -4 }} exit={{ y: 480, rotate: 6 }}
    transition={{ type: 'spring', stiffness: 170, damping: 19, delay: peekOpen ? 0 : .5 }}>
    <button type="button" className="csb-hold-peek-x" aria-label="No thanks" onClick={dismiss}><X size={12} strokeWidth={2.2} /></button>
    <button type="button" className="csb-hold-peek-phone" onMouseEnter={() => void start()} onFocus={() => void start()} aria-label={peekOpen ? 'QR code to open this on your phone' : 'Try this on your phone'} aria-expanded={peekOpen} onClick={() => setPeekOpen(o => !o)}>
      <span className="csb-hold-peek-island" aria-hidden="true" />
      <span className="csb-hold-peek-screen">
        <small className="is-kicker">On your phone</small>
        <b>Hold the real thing.</b>
        {qr ? <span className="csb-hold-peek-qr" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: qr }} /> : <span className="csb-hold-peek-qr" />}
        <small>{published === false ? 'Publish first so phones can open it.' : 'Point your camera here. Scroll it in your hand, and this screen explains each part.'}</small>
        {published !== false && linkHost && <small className="csb-hold-trust">Opens a page on {linkHost}. Nothing to install, nothing saved.</small>}
      </span>
    </button>
  </motion.div>}</AnimatePresence>, host);

  return <div className="csb-hold">{peek}
    {held && proto && <span className="csb-hold-live"><i /> They’re tapping through the prototype</span>}
    {held && stale && <span className="csb-hold-live is-wait"><i /> Reconnecting…</span>}
    {held && <button type="button" className="csb-hold-exit" onClick={leave}><Minimize2 size={14} /> Back to the page</button>}
    {state === 'live'
      ? held ? null : <span className={`csb-hold-live ${stale ? 'is-wait' : ''}`}><i /> {stale ? 'Reconnecting…' : finished ? <>Finished on their phone · <button type="button" className="csb-hold-again" onClick={() => { setFinished(false); }}>Show it full screen again</button></> : !ready ? 'Getting started on their phone…' : proto ? 'They’re trying the prototype on their phone' : 'Live from their phone'}</span>
      : peeking ? null : <button type="button" className="csb-hold-btn" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}><Smartphone size={14} strokeWidth={1.8} /> Hold it on your phone</button>}
    {open && <div className="csb-hold-card" role="dialog" aria-label="Open this screen on your phone" data-link={link} onClick={e => e.stopPropagation()}>
      <button type="button" className="csb-hold-x" aria-label="Close" onClick={() => setOpen(false)}><X size={14} /></button>
      <div className="csb-hold-who" role="radiogroup" aria-label="Who holds the phone">
        {([[false, 'Someone viewing'], [true, 'I’m presenting']] as const).map(([v, l]) => <button key={l} type="button" role="radio" aria-checked={presenting === v} onClick={() => { setPresenting(v); setQr(''); }}>{l}</button>)}
      </div>
      <strong>{presenting ? 'Present from your phone' : 'Scroll the real thing'}</strong>
      <p>{presenting ? 'Scan with your own phone. You scroll and swipe; this screen follows for everyone watching. Your phone shows the notes for what’s on screen and what’s next.' : 'Point your phone’s camera here. The screen opens in your hand, and the notes on this page follow along as you scroll.'}</p>
      {qr ? <span className="csb-hold-qr" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: qr }} /> : <span className="csb-hold-qr" />}
      <small>{published === false ? 'Publish the case study first so phones can open it.' : state === 'waiting' ? 'Waiting for your phone…' : ''}</small>
      {published !== false && linkHost && <small className="csb-hold-trust">Opens a page on {linkHost}. Nothing to install, nothing saved.</small>}
    </div>}
  </div>;
}
