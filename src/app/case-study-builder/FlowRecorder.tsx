import { authHeaders } from './auth';
import { useEffect, useRef, useState } from 'react';
import { Download, Film, Sparkles, Trash2 } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import type { FlowEdge, FlowNode, UserFlowData } from './UserFlow';

/*
  Recordings become flowcharts.
  · Websites: the Case Study Studio Recorder (Chrome extension) posts { source: 'csb-recorder', flow } to this page.
  · Phone apps: upload a screen recording; we find each new screen in the video, then AI can name the steps.
  Recordings wait in this browser (IndexedDB) until you use them in a User flow or Flow redesign section.
*/
export type RecStep = { label: string; action?: string; url?: string; image?: string; at?: number };
export type Recording = { id: string; name: string; source: 'web' | 'video'; at: string; steps: RecStep[]; named?: boolean };

const AI_URL = import.meta.env.VITE_STUDIO_AI_URL || (projectId ? `https://${projectId}.supabase.co/functions/v1/studio-ai-draft` : '');
const PASS = 'csb-ai-passcode';
const ZIP = `${import.meta.env.BASE_URL}case-study-recorder.zip`;

/* ---------- storage ---------- */
const db = () => new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('csb-recordings', 1); r.onupgradeneeded = () => r.result.createObjectStore('recs', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
export async function listRecordings(): Promise<Recording[]> { try { const d = await db(); return await new Promise(res => { const q = d.transaction('recs').objectStore('recs').getAll(); q.onsuccess = () => res((q.result as Recording[]).sort((a, b) => b.at.localeCompare(a.at))); q.onerror = () => res([]); }); } catch { return []; } }
export async function saveRecording(r: Recording) { const d = await db(); await new Promise<void>((res, rej) => { const t = d.transaction('recs', 'readwrite'); t.objectStore('recs').put(r); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); window.dispatchEvent(new Event('csb-recordings')); }
export async function deleteRecording(id: string) { const d = await db(); await new Promise<void>(res => { const t = d.transaction('recs', 'readwrite'); t.objectStore('recs').delete(id); t.oncomplete = () => res(); }); window.dispatchEvent(new Event('csb-recordings')); }

// The extension hands recordings to this page.
if (typeof window !== 'undefined' && !(window as unknown as { __csbRecListen?: boolean }).__csbRecListen) {
  (window as unknown as { __csbRecListen?: boolean }).__csbRecListen = true;
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.data?.source !== 'csb-recorder' || !e.data.flow) return;
    const f = e.data.flow as { name?: string; steps?: RecStep[] };
    const steps = (Array.isArray(f.steps) ? f.steps : []).slice(0, 60).map(s => ({ label: String(s.label || '').slice(0, 80), action: String(s.action || '').slice(0, 80), url: String(s.url || '').slice(0, 500), image: typeof s.image === 'string' && s.image.startsWith('data:image/') ? s.image : undefined }));
    if (!steps.length) return;
    void saveRecording({ id: crypto.randomUUID(), name: String(f.name || 'Recorded flow').slice(0, 80), source: 'web', at: new Date().toISOString(), steps }).then(() => toast(`Recording received: ${steps.length} steps. Select a User flow section and choose it under Recordings.`));
  });
}
function toast(text: string) {
  const el = document.createElement('div'); el.className = 'csb-rec-toast'; el.textContent = text; document.body.append(el);
  setTimeout(() => el.classList.add('is-out'), 5200); setTimeout(() => el.remove(), 5800);
}

/* ---------- recording → flowchart ---------- */
export function recordingToFlow(r: Recording, keep?: UserFlowData): UserFlowData {
  const steps = r.steps.filter((s, i, all) => i === 0 || s.image !== all[i - 1].image || s.label !== all[i - 1].label);
  const nodes: FlowNode[] = [{ id: 'start', type: 'terminal', label: r.name.split('·')[0].trim() || 'Start' }];
  const edges: FlowEdge[] = [];
  const seen = new Map<string, number>();
  steps.forEach((s, i) => {
    let label = s.label || `Screen ${i + 1}`; const c = seen.get(label.toLowerCase()) ?? 0; seen.set(label.toLowerCase(), c + 1); if (c) label = `${label} (${c + 1})`;
    const n: FlowNode = { id: `s${i}`, type: 'screen', label, ...(s.image ? { image: s.image } : {}), ...(s.url ? { url: s.url } : {}) };
    edges.push({ id: `e${i}`, from: i === 0 ? 'start' : `s${i - 1}`, to: n.id, ...(i > 0 && s.action ? { label: s.action } : {}) });
    nodes.push(n);
  });
  return { nodes, edges, direction: keep?.direction ?? 'LR', showScreens: steps.some(s => s.image) };
}

/* ---------- phone screen recording → screens ---------- */
export async function framesFromVideo(file: File, onProgress: (p: number) => void): Promise<RecStep[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video'); v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto';
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('This browser can’t read that video. On iPhone, set Camera → Formats → Most Compatible, or try Safari.')); });
  const dur = v.duration; if (!isFinite(dur) || dur <= 0) throw new Error('Could not read the video length.');
  const tiny = document.createElement('canvas'); tiny.width = 24; tiny.height = 48; const tc = tiny.getContext('2d', { willReadFrequently: true })!;
  const big = document.createElement('canvas'); const bw = 600; big.width = bw; big.height = Math.round(v.videoHeight * bw / v.videoWidth); const bc = big.getContext('2d')!;
  const seek = (t: number) => new Promise<void>(res => { const on = () => { v.removeEventListener('seeked', on); res(); }; v.addEventListener('seeked', on); v.currentTime = Math.min(dur - .05, t); });
  const sample = () => { tc.drawImage(v, 0, 0, 24, 48); const d = tc.getImageData(0, 0, 24, 48).data; const g = new Float32Array(24 * 48); for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; return g; };
  const diff = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 2 * 24; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / (a.length - 48); }; // ignore the status bar rows
  const stepT = Math.max(.35, dur / 500);
  const out: RecStep[] = []; let lastKept: Float32Array | null = null; let prev: Float32Array | null = null; let changing = false;
  for (let t = 0; t <= dur; t += stepT) {
    await seek(t); onProgress(t / dur); const g = sample();
    const moving = prev ? diff(g, prev) > 4 : false; prev = g;
    if (moving) { changing = true; continue; }
    // A settled frame that looks different from the last screen we kept is a new screen.
    if (!lastKept || (changing && diff(g, lastKept) > 14) || diff(g, lastKept) > 26) {
      bc.drawImage(v, 0, 0, big.width, big.height);
      out.push({ label: `Screen ${out.length + 1}`, image: big.toDataURL('image/jpeg', .72), at: Math.round(t * 1000) });
      lastKept = g; if (out.length >= 24) break;
    }
    changing = false;
  }
  URL.revokeObjectURL(url);
  return out;
}

/** AI names each screen (owner only). Returns null when AI isn't available, so callers keep their own labels. */
export async function nameScreensAI(images: string[], context: string): Promise<Array<{ label?: string; action?: string; keep?: boolean }> | null> {
  try {
    const passcode = (() => { try { return localStorage.getItem(PASS) || ''; } catch { return ''; } })();
    const res = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Studio-Passcode': passcode }, body: JSON.stringify({ task: 'flowFromScreens', images: images.slice(0, 20).map(i => i.split(',')[1]), context }) });
    const data = await res.json().catch(() => ({}));
    return res.ok && Array.isArray(data.steps) ? data.steps : null;
  } catch { return null; }
}

async function nameWithAI(r: Recording): Promise<Recording> {
  const passcode = (() => { try { return localStorage.getItem(PASS) || ''; } catch { return ''; } })();
  const images = r.steps.filter(s => s.image).slice(0, 20).map(s => s.image!.split(',')[1]);
  const res = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Studio-Passcode': passcode }, body: JSON.stringify({ task: 'flowFromScreens', images, context: r.name }) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Enter your Studio passcode in Draft with AI first (left panel).');
  if (!res.ok || !Array.isArray(data.steps)) throw new Error(/Notion research link/.test(data.error || '') ? 'Naming steps needs the latest studio-ai-draft deployed. Ask Codex to redeploy it.' : data.error || 'AI naming failed.');
  const named: RecStep[] = [];
  r.steps.forEach((s, i) => { const a = data.steps[i] as { label?: string; action?: string; keep?: boolean } | undefined; if (a?.keep === false) return; named.push({ ...s, label: a?.label || s.label, action: a?.action || s.action }); });
  return { ...r, steps: named, named: true, name: data.title ? String(data.title).slice(0, 80) : r.name };
}

/* ---------- panel ---------- */
export function Recordings({ onUse, useLabels }: { onUse: (r: Recording, slot?: 'before' | 'after') => void; useLabels?: Array<{ slot?: 'before' | 'after'; label: string }> }) {
  const [list, setList] = useState<Recording[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { const load = () => void listRecordings().then(setList); load(); window.addEventListener('csb-recordings', load); return () => window.removeEventListener('csb-recordings', load); }, []);
  const fromVideo = async (f: File) => {
    setNote(null); setBusy('Finding screens… 0%');
    try {
      const steps = await framesFromVideo(f, p => setBusy(`Finding screens… ${Math.round(p * 100)}%`));
      if (!steps.length) throw new Error('No screens found in that video.');
      await saveRecording({ id: crypto.randomUUID(), name: f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Phone recording', source: 'video', at: new Date().toISOString(), steps });
      setNote({ text: `Found ${steps.length} screens. Tap “Name with AI” to label them, or use them as they are.` });
    } catch (e) { setNote({ text: e instanceof Error ? e.message : 'Could not read that video.', error: true }); }
    finally { setBusy(''); }
  };
  const importFile = async (f: File) => { try { const j = JSON.parse(await f.text()); window.postMessage({ source: 'csb-recorder', flow: j.flow ?? j }, location.origin); } catch { setNote({ text: 'That file is not a recorded flow.', error: true }); } };
  return <div className="csb-rec">
    <p className="csb-panel-kicker">Recordings</p>
    <div className="csb-rec-actions">
      <button type="button" className="csb-quiet-button" disabled={!!busy} onClick={() => file.current?.click()}><Film size={13} /> Phone screen recording</button>
      <input ref={file} type="file" accept="video/*,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void (f.name.endsWith('.json') ? importFile(f) : fromVideo(f)); e.target.value = ''; }} />
      <a className="csb-quiet-button" href={ZIP} download><Download size={13} /> Chrome recorder</a>
    </div>
    {busy && <p className="csb-field-note" role="status">{busy}</p>}
    {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`} role="status">{note.text}</p>}
    {!list.length && <details className="csb-rec-help"><summary>How recording works</summary>
      <p><b>Websites (competitors):</b> download the Chrome recorder, unzip it, open <code>chrome://extensions</code>, turn on Developer mode, choose Load unpacked and pick the folder. Then open the site, click the recorder, Start, and click through. Send to Studio when you’re done.</p>
      <p><b>Phone apps:</b> use your phone’s screen recording while you go through the app, then upload the video here. Each new screen becomes a step.</p>
    </details>}
    {list.map(r => <div key={r.id} className="csb-rec-item">
      <div className="csb-rec-strip">{r.steps.slice(0, 6).map((s, i) => s.image ? <img key={i} src={s.image} alt="" /> : null)}</div>
      <div className="csb-rec-meta"><strong>{r.name}</strong><small>{r.source === 'web' ? 'Website' : 'Phone video'} · {r.steps.length} steps · {new Date(r.at).toLocaleDateString()}</small></div>
      <div className="csb-rec-btns">
        {(useLabels ?? [{ label: 'Use' }]).map(u => <button key={u.label} type="button" className="csb-quiet-button" onClick={() => onUse(r, u.slot)}>{u.label}</button>)}
        {(r.source === 'video' || !r.named) && <button type="button" className="csb-quiet-button" disabled={!!busy} title="Let AI name each screen and the tap between them" onClick={async () => { setBusy('Naming the steps…'); setNote(null); try { await saveRecording(await nameWithAI(r)); setNote({ text: 'Named. Use it, then fix any label right on the page.' }); } catch (e) { setNote({ text: e instanceof Error ? e.message : 'Failed.', error: true }); } finally { setBusy(''); } }}><Sparkles size={13} /> Name with AI</button>}
        <button type="button" className="csb-icon-button" aria-label={`Delete ${r.name}`} onClick={() => { if (window.confirm('Delete this recording?')) void deleteRecording(r.id); }}><Trash2 size={13} /></button>
      </div>
    </div>)}
  </div>;
}
