import { useRef, useState } from 'react';
import { compressIntoDraft, figmaStatus, getFigmaToken, setFigmaToken } from './ImageSlots';
import type { BuilderStudy } from './model';

/*
  Images linked to Figma frames (item.figmaUrl, study.heroFigmaUrl) are rendered straight
  from the Figma file, at a size that suits each frame, and stored in the draft.
  A bar above the page offers to pull them whenever some are missing.
*/
const RE = /figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)[^?#]*\?[^#]*node-id=([0-9]+[-:][0-9]+)/;
type Job = { slot: string; link: string };

export function figmaJobs(study: BuilderStudy, all = false): Job[] {
  const jobs: Job[] = [];
  if (study.heroFigmaUrl && (all || !study.heroImage)) jobs.push({ slot: 'hero', link: study.heroFigmaUrl });
  for (const s of study.sections) s.items.forEach((it, i) => { if (it.figmaUrl && (all || !it.image)) jobs.push({ slot: `${s.id}:${i}`, link: it.figmaUrl }); });
  return jobs;
}

/* fetch that gives up instead of hanging forever (Figma's render call can stall, especially when rate-limited). */
async function timed(url: string, init: RequestInit, ms: number, what: string, stop: AbortSignal) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort('timeout'), ms);
  const onStop = () => ctl.abort('stop'); stop.addEventListener('abort', onStop);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  catch (e) {
    if (stop.aborted) throw new Error('Stopped.');
    if (ctl.signal.aborted) throw new Error(`${what} took longer than ${Math.round(ms / 1000)} seconds, so it was stopped. Figma may be busy or your monthly limit may be used up. Copy as PNG (⌘⇧C) and paste always works.`);
    throw e instanceof Error ? e : new Error(String(e));
  } finally { clearTimeout(t); stop.removeEventListener('abort', onStop); }
}

async function figma(path: string, stop: AbortSignal) {
  const r = await timed(`https://api.figma.com/v1/${path}`, { headers: { 'X-Figma-Token': getFigmaToken() } }, 60_000, 'Figma', stop);
  figmaStatus(r.status);
  const j = await r.json();
  if (j?.err) throw new Error(`Figma said: ${j.err}`);
  return j;
}

export type PullStep = { phase: 'render' | 'save'; done: number; total: number; failed: number };

export async function pullFrames(jobs: Job[], onImage: (slot: string, dataUrl: string) => void, onProgress: (s: PullStep) => void, stop: AbortSignal = new AbortController().signal) {
  const parsed = jobs.map(j => { const m = j.link.match(RE); return m ? { ...j, file: m[1], id: m[2].replace('-', ':') } : null; }).filter((j): j is Job & { file: string; id: string } => !!j);
  const byFile = new Map<string, typeof parsed>();
  parsed.forEach(j => byFile.set(j.file, [...(byFile.get(j.file) ?? []), j]));
  let done = 0, failed = 0; const total = parsed.length;
  const badLinks = jobs.length - parsed.length;
  for (const [file, list] of byFile) {
    onProgress({ phase: 'render', done, total, failed });
    const ids = [...new Set(list.map(j => j.id))];
    // One request for every frame in the file: Figma counts each call against a small monthly allowance on View seats.
    const urls: Record<string, string | null> = (await figma(`images/${file}?ids=${encodeURIComponent(ids.join(','))}&format=png&scale=2`, stop)).images ?? {};
    for (const j of list) {
      if (stop.aborted) throw new Error('Stopped.');
      onProgress({ phase: 'save', done, total, failed });
      const url = urls[j.id];
      if (!url) failed++;
      else {
        try {
          const r = await timed(url, { mode: 'cors' }, 30_000, 'Downloading a frame', stop);
          if (!r.ok) throw new Error(String(r.status));
          onImage(j.slot, await compressIntoDraft(await r.blob(), 1_600_000, 1600));
        } catch (e) { if (stop.aborted) throw e; failed++; }
      }
      done++;
    }
  }
  onProgress({ phase: 'save', done, total, failed });
  return { done, failed: failed + badLinks, total: jobs.length };
}

export function FigmaPullBar({ study, onImage }: { study: BuilderStudy; onImage: (slot: string, dataUrl: string) => void }) {
  const missing = figmaJobs(study);
  const [token, setToken] = useState(getFigmaToken());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const stopRef = useRef<AbortController | null>(null);
  if (!missing.length && !busy && !note) return null;
  const run = async () => {
    if (token.trim()) setFigmaToken(token);
    if (!getFigmaToken()) { setError('Add your Figma access token first.'); return; }
    setError(''); setNote('');
    const ctl = new AbortController(); stopRef.current = ctl;
    const t0 = Date.now();
    try {
      const res = await pullFrames(missing, onImage, s => setBusy(s.phase === 'render'
        ? `Figma is rendering ${s.total} frame${s.total === 1 ? '' : 's'}…`
        : `Saving ${Math.min(s.done + 1, s.total)} of ${s.total}…`), ctl.signal);
      const got = res.total - res.failed;
      if (res.failed) setError(`${got} of ${res.total} came through. ${res.failed} couldn’t be pulled (the link may point at a deleted frame). Copy those as PNG (⌘⇧C) and paste them.`);
      else setNote(`All ${got} pulled in ${Math.max(1, Math.round((Date.now() - t0) / 1000))}s.`);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Pull failed.'); }
    finally { setBusy(''); stopRef.current = null; }
  };
  if (!missing.length && note) return <div className="csb-figpull is-done" role="status"><span>{note}</span><button type="button" onClick={() => setNote('')}>OK</button></div>;
  return <div className="csb-figpull" role="status">
    <span><b>{missing.length}</b> image{missing.length === 1 ? ' is' : 's are'} linked to Figma frames.</span>
    {!getFigmaToken() && <input type="password" autoComplete="off" placeholder="Figma access token" value={token} onChange={e => setToken(e.target.value)} aria-label="Figma personal access token" />}
    {busy ? <><span className="csb-figpull-busy" aria-live="polite"><i aria-hidden="true" />{busy}</span><button type="button" className="is-ghost" onClick={() => stopRef.current?.abort()}>Stop</button></> : <button type="button" onClick={() => void run()}>{error ? 'Try again' : 'Pull from Figma'}</button>}
    {error && <em>{error}</em>}
    <small>No API needed: in Figma select a frame, press ⌘⇧C (Copy as PNG), then hover its spot here and press ⌘V.</small>
    {!getFigmaToken() && <small>Kept only in this tab. Figma → Settings → Security → Personal access tokens (File content: read).</small>}
  </div>;
}
