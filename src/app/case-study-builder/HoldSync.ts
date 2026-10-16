import { projectId, publicAnonKey } from '../../utils/supabase/info';

/*
  "Hold it": a live link between a case study open on a laptop and the visitor's own phone.
  The laptop shows a QR code with a one-time pairing code. The phone opens #/hold/<slug>/<section>/<code>,
  and both join the same channel. Messages are tiny ({ t: 'scroll', f: 0.42 }) and nothing is stored.
  Every pairing has its own code, so any number of people can do this at once.
  Transport: Supabase Realtime broadcast (across devices) plus BroadcastChannel (two tabs on one computer).
*/
export type TaskRun = { taps: number; ms: number; found: boolean };
export type TaskState = {
  phase: 'intro' | 'running' | 'between' | 'summary' | 'closed'; // closed: finished or skipped; results are kept for the recap
  run: 'a' | 'b';                          // which version is being tried
  taps: number; ms: number;                // live progress of the current run
  results: Partial<Record<'a' | 'b', TaskRun>>;
};
export type HoldMsg =
  | { t: 'hello'; ua?: string; ready?: boolean; presenter?: boolean } // phone joined (ready = finished the how-to)
  | { t: 'ready' }                       // phone finished the how-to: the laptop can go full screen
  | { t: 'hi'; stage?: string }          // laptop answered (also a heartbeat: every hello gets one)
  | { t: 'scroll'; f: number; v?: number } // phone scroll position 0–1, and how much of the page fits on its screen
  | { t: 'stage'; stage: string }        // laptop switched wireframe / high fidelity
  | { t: 'pick'; stage: string }         // phone swiped to the other stage (old ↔ new)
  | { t: 'mode'; live: boolean }         // phone switched between the screen and the live prototype
  | { t: 'task'; s: TaskState | null }   // the timed task: progress and results
  | { t: 'done' }                        // phone: "I'm done" → laptop shows the recap
  | { t: 'end' }                         // laptop → phone: look back at the screen
  | { t: 'bye' };

export const newHoldCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
/* base: where this studio is served (defaults to this page's address). presenter: the person presenting holds the phone. */
export const holdLink = (slug: string, sectionId: string, code: string, presenter = false, base = '') => {
  const root = (base || `${location.origin}${location.pathname}`).replace(/#.*$/, '').replace(/\/?$/, '/');
  return `${root}#/hold/${slug}/${sectionId}/${code}${presenter ? '/p' : ''}`;
};

/* The notes for the mobile screen of one version, in page order (shared by the phone and the laptop). */
export type HoldNote = { title: string; detail: string; at: number; i: number; key?: boolean; box?: string };
export function mobileNotes(section: { items: Array<Record<string, unknown>>; options?: Record<string, unknown> }, stage: string): HoldNote[] {
  const compare = section.options?.compare === true; const base = compare ? 4 : 2;
  return section.items.slice(base).map((n, k) => ({ title: String(n.title ?? ''), detail: String(n.detail ?? ''), at: Math.min(100, Math.max(0, Number(n.point) || 0)) / 100, i: k + base, key: n.key === true, box: typeof n.box === 'string' ? n.box : undefined, device: n.value, when: n.when }))
    .filter(n => n.device === 'mobile' && (!compare || (n.when === 'a' ? 'a' : n.when === 'both' ? stage : 'b') === stage))
    .sort((a, b) => a.at - b.at).map(({ title, detail, at, i, key, box }) => ({ title, detail, at, i, key, box }));
}


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
