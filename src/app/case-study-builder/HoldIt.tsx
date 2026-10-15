import { useContext, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Smartphone, X } from 'lucide-react';
import { holdLink, newHoldCode, openHold, type HoldChannel, type HoldMsg } from './HoldSync';
import { StudyMeta } from './StudyMeta';

/*
  Laptop side of "Hold it": a quiet button under the phone mockup. It opens a QR code; when a phone
  joins, the mockup flies off the page "into" their phone, then comes back mirroring their scroll,
  so the highlights and notes here follow what they're looking at in their hand.
*/
export function HoldIt({ sectionId, stage, root }: { sectionId: string; stage: string; root: React.RefObject<HTMLElement | null> }) {
  const { slug, published } = useContext(StudyMeta);
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState('');
  const [state, setState] = useState<'idle' | 'waiting' | 'live'>('idle');
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
    if (m.t === 'scroll') { const el = phoneScroller(); if (el) el.scrollTop = m.f * (el.scrollHeight - el.clientHeight); }
    if (m.t === 'bye') setState('waiting');
  };
  const start = async () => { if (ch.current) return; setState('waiting'); ch.current = await openHold(code.current, onMsg); };
  useEffect(() => { if (open && link) { void start(); QRCode.toString(link, { type: 'svg', margin: 0, color: { dark: '#000000', light: '#00000000' } }).then(setQr, () => setQr('')); } }, [open, link]);
  useEffect(() => { if (state === 'live') ch.current?.send({ t: 'stage', stage }); }, [stage, state]);
  // If the phone goes quiet for a while, show the button again.
  useEffect(() => { if (state !== 'live') return; const t = setInterval(() => { if (Date.now() - lastSeen.current > 20000) setState('waiting'); }, 5000); return () => clearInterval(t); }, [state]);
  useEffect(() => () => ch.current?.close(), []);
  if (!slug) return null;

  return <div className="csb-hold">
    {state === 'live'
      ? <span className="csb-hold-live"><i /> Live from their phone</span>
      : <button type="button" className="csb-hold-btn" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}><Smartphone size={14} strokeWidth={1.8} /> Hold it on your phone</button>}
    {open && <div className="csb-hold-card" role="dialog" aria-label="Open this screen on your phone" data-link={link} onClick={e => e.stopPropagation()}>
      <button type="button" className="csb-hold-x" aria-label="Close" onClick={() => setOpen(false)}><X size={14} /></button>
      <strong>Scroll the real thing</strong>
      <p>Point your phone’s camera here. The screen opens in your hand, and the notes on this page follow along as you scroll.</p>
      {qr ? <span className="csb-hold-qr" role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: qr }} /> : <span className="csb-hold-qr" />}
      <small>{published === false ? 'Publish the case study first so phones can open it.' : state === 'waiting' ? 'Waiting for your phone…' : ''}</small>
    </div>}
  </div>;
}
