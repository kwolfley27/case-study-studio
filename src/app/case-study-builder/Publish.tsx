import { useState } from 'react';
import { Copy, ExternalLink, Globe, X } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { PASSCODE_KEY, uploadToStudio } from './media';
import { figmaJobs } from './FigmaPull';
import type { BuilderStudy } from './model';

/*
  Publish: images stored in the draft are uploaded to the Studio's public media bucket,
  then the case study itself is saved as published/<slug>.json. The public page lives at
  …/case-study-studio/#/p/<slug> and always shows the latest publish.
*/
const ENDPOINT = import.meta.env.VITE_STUDIO_UPLOAD_URL || (projectId ? `https://${projectId}.supabase.co/functions/v1/studio-media-upload` : '');
export const publishedJsonUrl = (slug: string) => `https://${projectId}.supabase.co/storage/v1/object/public/case-study-media/published/${slug}.json`;
export const publicPageUrl = (slug: string) => `${location.origin}${location.pathname}#/p/${slug}`;

async function uploadJson(study: BuilderStudy, passcode: string) {
  const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey, 'X-Studio-Passcode': passcode }, body: JSON.stringify({ publish: study.slug }) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('Enter your Studio passcode.');
  if (!r.ok || !d.uploadUrl) throw new Error(d.error === 'Upload a video (mp4, webm, mov) or an image.' ? 'Publishing needs the latest studio-media-upload function. Ask Codex to redeploy it.' : d.error || `Publish failed (${r.status}).`);
  const put = await fetch(d.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(study) });
  if (!put.ok) throw new Error(`Publish failed (${put.status}).`);
}

async function hostImages(study: BuilderStudy, onStage: (s: string) => void): Promise<BuilderStudy> {
  const copy: BuilderStudy = structuredClone(study);
  const slots: Array<{ get: () => string | undefined; set: (v: string) => void }> = [];
  if (copy.heroImage) slots.push({ get: () => copy.heroImage, set: v => { copy.heroImage = v; } });
  if (copy.hero?.bgImage) slots.push({ get: () => copy.hero!.bgImage, set: v => { copy.hero!.bgImage = v; } });
  copy.sections.forEach(s => {
    s.items.forEach(it => { if (it.image) slots.push({ get: () => it.image, set: v => { it.image = v; } }); });
    if (s.recording?.src) slots.push({ get: () => s.recording!.src, set: v => { s.recording!.src = v; } });
  });
  const local = slots.filter(x => x.get()?.startsWith('data:') || x.get()?.startsWith('blob:'));
  const done = new Map<string, string>();
  for (let i = 0; i < local.length; i++) {
    const src = local[i].get()!;
    if (!done.has(src)) {
      onStage(`Uploading images… ${i + 1} of ${local.length}`);
      const blob = await (await fetch(src)).blob();
      done.set(src, await uploadToStudio(blob, copy.slug || 'case-study', () => undefined));
    }
    local[i].set(done.get(src)!);
  }
  return copy;
}

export function PublishDialog({ study, onClose, onPublished }: { study: BuilderStudy; onClose: () => void; onPublished: (at: string) => void }) {
  const [pass, setPass] = useState(() => { try { return localStorage.getItem(PASSCODE_KEY) || ''; } catch { return ''; } });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(!!study.publishedAt);
  const [copied, setCopied] = useState(false);
  const url = publicPageUrl(study.slug);
  const missing = figmaJobs(study).length;
  const run = async () => {
    setError(''); try { localStorage.setItem(PASSCODE_KEY, pass); } catch { /* ignore */ }
    try {
      const hosted = await hostImages(study, setBusy);
      setBusy('Publishing the page…');
      const at = new Date().toISOString();
      await uploadJson({ ...hosted, publishedAt: at }, pass);
      onPublished(at); setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Publish failed.'); }
    finally { setBusy(''); }
  };
  return <div className="csb-pub-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="csb-pub" role="dialog" aria-label="Publish">
      <button type="button" className="csb-pub-x" aria-label="Close" onClick={onClose}><X size={16} /></button>
      <span className="csb-pub-icon"><Globe size={20} strokeWidth={1.6} /></span>
      <h2>{done ? 'Your case study is live' : 'Publish this case study'}</h2>
      <p>{done ? 'Anyone with the link can view it. Publish again any time to update the page.' : 'It becomes a public web page. Images in your draft are uploaded with it.'}</p>
      {missing > 0 && <p className="csb-pub-warn">{missing} image{missing === 1 ? ' is' : 's are'} still waiting to be pulled from Figma. Pull them first, or they’ll be blank.</p>}
      <div className="csb-pub-link"><span>{url.replace(/^https?:\/\//, '')}</span>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} disabled={!done}><Copy size={13} /> {copied ? 'Copied' : 'Copy'}</button>
        <a href={url} target="_blank" rel="noreferrer" aria-disabled={!done}><ExternalLink size={13} /> Open</a>
      </div>
      {!pass && <input type="password" placeholder="Studio passcode" value={pass} onChange={e => setPass(e.target.value)} aria-label="Studio passcode" />}
      <button type="button" className="csb-pub-go" disabled={!!busy || !pass} onClick={() => void run()}>{busy || (done ? 'Publish changes' : 'Publish')}</button>
      {error && <p className="csb-pub-error" role="alert">{error}</p>}
      {study.publishedAt && <small>Last published {new Date(study.publishedAt).toLocaleString()}</small>}
    </div>
  </div>;
}
