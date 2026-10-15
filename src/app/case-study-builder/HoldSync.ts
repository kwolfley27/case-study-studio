import { projectId, publicAnonKey } from '../../utils/supabase/info';

/*
  "Hold it": a live link between a case study open on a laptop and the visitor's own phone.
  The laptop shows a QR code with a one-time pairing code. The phone opens #/hold/<slug>/<section>/<code>,
  and both join the same channel. Messages are tiny ({ t: 'scroll', f: 0.42 }) and nothing is stored.
  Every pairing has its own code, so any number of people can do this at once.
  Transport: Supabase Realtime broadcast (across devices) plus BroadcastChannel (two tabs on one computer).
*/
export type HoldMsg =
  | { t: 'hello'; ua?: string }          // phone joined
  | { t: 'hi'; stage?: string }          // laptop answered
  | { t: 'scroll'; f: number }           // phone scroll position, 0–1
  | { t: 'stage'; stage: string }        // laptop switched wireframe / high fidelity
  | { t: 'pick'; stage: string }         // phone swiped to the other stage (old ↔ new)
  | { t: 'mode'; live: boolean }         // phone switched between the screen and the live prototype
  | { t: 'bye' };

export const newHoldCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
export const holdLink = (slug: string, sectionId: string, code: string) => `${location.origin}${location.pathname}#/hold/${slug}/${sectionId}/${code}`;

export type HoldChannel = { send: (m: HoldMsg) => void; close: () => void };

export async function openHold(code: string, onMsg: (m: HoldMsg) => void): Promise<HoldChannel> {
  const topic = `hold-${code}`;
  let bc: BroadcastChannel | null = null;
  try { bc = new BroadcastChannel(topic); bc.onmessage = e => onMsg(e.data as HoldMsg); } catch { /* not supported */ }
  // Connect across devices in the background; same-computer messages work right away.
  let rt: { send: (m: HoldMsg) => void; close: () => void } | null = null; let closed = false;
  if (projectId && publicAnonKey) {
    void (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        if (closed) return;
        const client = createClient(`https://${projectId}.supabase.co`, publicAnonKey, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 30 } } });
        const ch = client.channel(topic, { config: { broadcast: { self: false, ack: false } } });
        ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload as HoldMsg));
        ch.subscribe(status => { if (status === 'SUBSCRIBED' && !closed) rt = { send: m => { void ch.send({ type: 'broadcast', event: 'm', payload: m }); }, close: () => { void client.removeChannel(ch); } }; });
      } catch { /* offline or blocked */ }
    })();
  }
  return {
    send: m => { try { bc?.postMessage(m); } catch { /* ignore */ } rt?.send(m); },
    close: () => { closed = true; try { bc?.close(); } catch { /* ignore */ } rt?.close(); },
  };
}
