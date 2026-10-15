import { useState } from 'react';
import { downloadIntoDraft, figmaStatus, getFigmaToken, setFigmaToken } from './ImageSlots';
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

async function figma(path: string) {
  const r = await fetch(`https://api.figma.com/v1/${path}`, { headers: { 'X-Figma-Token': getFigmaToken() } });
  figmaStatus(r.status);
  return r.json();
}

export async function pullFrames(jobs: Job[], onImage: (slot: string, dataUrl: string) => void, onProgress: (done: number, total: number) => void) {
  const parsed = jobs.map(j => { const m = j.link.match(RE); return m ? { ...j, file: m[1], id: m[2].replace('-', ':') } : null; }).filter((j): j is Job & { file: string; id: string } => !!j);
  const byFile = new Map<string, typeof parsed>();
  parsed.forEach(j => byFile.set(j.file, [...(byFile.get(j.file) ?? []), j]));
  let done = 0; onProgress(0, parsed.length);
  for (const [file, list] of byFile) {
    const ids = [...new Set(list.map(j => j.id))];
    // One request for every frame in the file: Figma counts each call against a small monthly allowance on View seats.
    const urls: Record<string, string> = (await figma(`images/${file}?ids=${encodeURIComponent(ids.join(','))}&format=png&scale=2`)).images ?? {};
    for (const j of list) {
      const url = urls[j.id];
      if (url) onImage(j.slot, await downloadIntoDraft(url, 1_600_000, 1600));
      onProgress(++done, parsed.length);
    }
  }
}

export function FigmaPullBar({ study, onImage }: { study: BuilderStudy; onImage: (slot: string, dataUrl: string) => void }) {
  const missing = figmaJobs(study);
  const [token, setToken] = useState(getFigmaToken());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!missing.length && !busy) return null;
  const run = async () => {
    if (token.trim()) setFigmaToken(token);
    if (!getFigmaToken()) { setError('Add your Figma access token first.'); return; }
    setError('');
    try { await pullFrames(missing, onImage, (d, t) => setBusy(`Pulling ${Math.min(d + 1, t)} of ${t} from Figma…`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Pull failed.'); }
    finally { setBusy(''); }
  };
  return <div className="csb-figpull" role="status">
    <span><b>{missing.length}</b> image{missing.length === 1 ? ' is' : 's are'} linked to Figma frames.</span>
    {!getFigmaToken() && <input type="password" autoComplete="off" placeholder="Figma access token" value={token} onChange={e => setToken(e.target.value)} aria-label="Figma personal access token" />}
    <button type="button" disabled={!!busy} onClick={() => void run()}>{busy || 'Pull from Figma'}</button>
    {error && <em>{error}</em>}
    <small>No API needed: in Figma select a frame, press ⌘⇧C (Copy as PNG), then hover its spot here and press ⌘V.</small>
    {!getFigmaToken() && <small>Kept only in this tab. Figma → Settings → Security → Personal access tokens (File content: read).</small>}
  </div>;
}
