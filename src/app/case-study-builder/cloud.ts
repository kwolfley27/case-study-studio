import { account, supabase } from './auth';
import type { BuilderStudy } from './model';

/*
  Cloud saving. The browser's library (IndexedDB) stays the fast local copy; every save is also sent to the
  signed-in person's account a moment later, so their case studies follow them to any device.
  Pictures stored inside a draft (data: URLs) are uploaded to the Studio's media storage first and swapped for
  their links, so the saved record stays small. Each picture is uploaded once (remembered by its fingerprint).
*/

type Row = { id: string; data: BuilderStudy & { updatedAt?: string; deletedAt?: string }; updated_at: string; deleted_at: string | null };
const timers = new Map<string, number>();
const listeners = new Set<(s: CloudState) => void>();
export type CloudState = 'idle' | 'saving' | 'saved' | 'offline';
let state: CloudState = 'idle';
const setState = (s: CloudState) => { state = s; listeners.forEach(f => f(s)); };
export const cloudState = () => state;
export const onCloudState = (f: (s: CloudState) => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

const fingerprint = async (blob: Blob) => { const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return [...new Uint8Array(h)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(''); };
const hostedKey = (fp: string) => `csb-hosted:${fp}`;

/** Swap every embedded picture or video in the study for an uploaded link. */
async function hostEmbedded<T>(value: T, folder: string): Promise<T> {
  const { uploadToStudio } = await import('./media');
  const seen = new Map<string, string>();
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === 'string') {
      if (!/^data:(image|video)\//.test(v) || v.length < 2000) return v;
      if (seen.has(v)) return seen.get(v);
      const blob = await (await fetch(v)).blob(); const fp = await fingerprint(blob);
      let url = ''; try { url = localStorage.getItem(hostedKey(fp)) || ''; } catch { /* ignore */ }
      if (!url) { url = await uploadToStudio(blob, folder); try { localStorage.setItem(hostedKey(fp), url); } catch { /* ignore */ } }
      seen.set(v, url); return url;
    }
    if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await walk(x)); return out; }
    if (v && typeof v === 'object') { const out: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v)) out[k] = await walk(x); return out; }
    return v;
  };
  return walk(value) as Promise<T>;
}

async function push(study: BuilderStudy & { updatedAt?: string; deletedAt?: string }) {
  const me = account(); if (!me) return;
  setState('saving');
  try {
    const data = await hostEmbedded(study, study.slug || 'case-study');
    const { error } = await supabase().from('studies').upsert({ owner: me.session.user.id, id: study.id, title: study.title, data, updated_at: study.updatedAt || new Date().toISOString(), deleted_at: study.deletedAt ?? null }, { onConflict: 'owner,id' });
    setState(error ? 'offline' : 'saved');
  } catch { setState('offline'); }
}

/** Called after every local save: send it to the account a couple of seconds later. */
export function queueCloudSave(study: BuilderStudy & { updatedAt?: string; deletedAt?: string }) {
  if (!account()) return;
  clearTimeout(timers.get(study.id));
  timers.set(study.id, window.setTimeout(() => { timers.delete(study.id); void push(study); }, 2500));
}
export async function cloudPurge(id: string) { const me = account(); if (!me) return; await supabase().from('studies').delete().eq('owner', me.session.user.id).eq('id', id); }

/**
  On sign-in: bring the account and this browser up to date with each other.
  Whichever copy of a case study was saved most recently wins. Drafts that only exist in this browser
  (like everything made before accounts) are uploaded to the account.
*/
export async function syncLibrary(onProgress?: (text: string) => void) {
  const me = account(); if (!me) return;
  const lib = await import('./studyLibrary');
  const { data, error } = await supabase().from('studies').select('id, data, updated_at, deleted_at').eq('owner', me.session.user.id);
  if (error) { setState('offline'); return; }
  const cloud = new Map((data as Row[]).map(r => [r.id, r]));
  const local = await lib.readEverything();
  const localById = new Map(local.map(s => [s.id, s]));
  // Newer in the account: bring it here.
  for (const r of cloud.values()) {
    const mine = localById.get(r.id);
    if (!mine || Date.parse(r.updated_at) > Date.parse(mine.updatedAt || '0')) await lib.putRaw({ ...r.data, id: r.id, updatedAt: r.updated_at, ...(r.deleted_at ? { deletedAt: r.deleted_at } : {}) });
  }
  // Newer here (or never uploaded): send it up.
  const up = local.filter(s => { const r = cloud.get(s.id); return !r || Date.parse(s.updatedAt || '0') > Date.parse(r.updated_at); });
  for (let i = 0; i < up.length; i++) { onProgress?.(`Saving ${i + 1} of ${up.length} to your account…`); await push(up[i]); }
  // The editor opens whatever is in this browser's "current" slot: make sure it's the newest copy
  // (or, on a new device, your most recent case study).
  const KEY = 'katelyn-case-study-builder-v1';
  try {
    const open = JSON.parse(localStorage.getItem(KEY) || 'null') as (BuilderStudy & { updatedAt?: string }) | null;
    const merged = (await lib.readEverything()).filter(s => !s.deletedAt);
    const newer = open ? merged.find(s => s.id === open.id && Date.parse(s.updatedAt || '0') > Date.parse(open.updatedAt || '0') && cloud.has(s.id)) : null;
    const pick = newer || (!open ? merged.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] : null);
    if (pick) localStorage.setItem(KEY, JSON.stringify(pick));
  } catch { /* storage full or unavailable: the editor keeps what it has */ }
  setState('saved');
}
