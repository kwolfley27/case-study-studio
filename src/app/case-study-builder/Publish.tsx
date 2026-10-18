import { authHeaders } from './auth';
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

// What your website needs to show a card for this case study (sent with each publish).
const websiteCard = (s: BuilderStudy) => ({ replaces: s.replaces, title: s.title, summary: s.summary, eyebrow: s.client, heroImage: s.heroImage && /^https?:/.test(s.heroImage) ? s.heroImage : undefined, accent: s.accent, role: s.role, timeframe: s.timeframe });
async function uploadJson(study: BuilderStudy, passcode: string, onWebsite?: boolean) {
  const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Studio-Passcode': passcode }, body: JSON.stringify({ publish: study.slug, ...(onWebsite === undefined ? {} : { website: onWebsite ? websiteCard(study) : null }) }) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('Please sign in again.');
  if (r.status === 409) throw new Error(d.error || 'That page address belongs to someone else. Pick another in Page settings.');
  if (!r.ok || !d.uploadUrl) throw new Error(d.error === 'Upload a video (mp4, webm, mov) or an image.' ? 'Publishing needs the latest studio-media-upload function. Ask Codex to redeploy it.' : d.error || `Publish failed (${r.status}).`);
  const put = await fetch(d.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(study) });
  if (!put.ok) throw new Error(`Publish failed (${put.status}).`);
}

async function hostImages(study: BuilderStudy, onStage: (s: string, fraction: number) => void): Promise<BuilderStudy> {
  const copy: BuilderStudy = structuredClone(study);
  const slots: Array<{ get: () => string | undefined; set: (v: string) => void }> = [];
  if (copy.heroImage) slots.push({ get: () => copy.heroImage, set: v => { copy.heroImage = v; } });
  if (copy.hero?.bgImage) slots.push({ get: () => copy.hero!.bgImage, set: v => { copy.hero!.bgImage = v; } });
  copy.moreStudies?.forEach(m => { if (m.image) slots.push({ get: () => m.image, set: v => { m.image = v; } }); });
  copy.sections.forEach(s => {
    s.items.forEach(it => { if (it.image) slots.push({ get: () => it.image, set: v => { it.image = v; } }); });
    if (s.recording?.src) slots.push({ get: () => s.recording!.src, set: v => { s.recording!.src = v; } });
    s.built?.nodes.forEach(n => { if (n.src) slots.push({ get: () => n.src, set: v => { n.src = v; } }); });
    (s.flowRace?.flows ?? []).forEach(f => f.apps.forEach(app => app.steps?.forEach(st => { if (st.thumb) slots.push({ get: () => st.thumb, set: v => { st.thumb = v; } }); })));
  });
  const local = slots.filter(x => x.get()?.startsWith('data:') || x.get()?.startsWith('blob:'));
  const done = new Map<string, string>();
  // Progress by bytes, so one big video counts for more than a small icon. Uploads are 92% of the bar; saving the page is the rest.
  const uniq = [...new Set(local.map(x => x.get()!))];
  const blobs = new Map<string, Blob>();
  for (const src of uniq) blobs.set(src, await (await fetch(src)).blob());
  const total = [...blobs.values()].reduce((n, b) => n + b.size, 0) || 1;
  let sent = 0;
  for (let i = 0, n = 0; i < local.length; i++) {
    const src = local[i].get()!;
    if (!done.has(src)) {
      n++;
      const blob = blobs.get(src)!;
      const label = `Uploading ${n} of ${uniq.length}`;
      onStage(label, sent / total * .92);
      done.set(src, await uploadToStudio(blob, copy.slug || 'case-study', f => onStage(label, (sent + f * blob.size) / total * .92)));
      sent += blob.size;
    }
    local[i].set(done.get(src)!);
  }
  return copy;
}

export function PublishDialog({ study, onClose, onPublished, owner = false, onWebsiteChange }: { study: BuilderStudy; onClose: () => void; onPublished: (at: string) => void; owner?: boolean; onWebsiteChange?: (on: boolean) => void }) {
  const [onSite, setOnSite] = useState(!!study.onWebsite);
  const [pass, setPass] = useState(() => { try { return localStorage.getItem(PASSCODE_KEY) || ''; } catch { return ''; } });
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [justDone, setJustDone] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(!!study.publishedAt);
  const [copied, setCopied] = useState(false);
  const url = publicPageUrl(study.slug);
  const missing = figmaJobs(study).length;
  const run = async () => {
    setError(''); try { localStorage.setItem(PASSCODE_KEY, pass); } catch { /* ignore */ }
    try {
      setProgress(0); setBusy('Getting ready');
      const hosted = await hostImages(study, (label, f) => { setBusy(label); setProgress(p => Math.max(p, f)); });
      setBusy('Publishing the page'); setProgress(p => Math.max(p, .94));
      const at = new Date().toISOString();
      await uploadJson({ ...hosted, publishedAt: at, onWebsite: owner ? onSite : hosted.onWebsite }, pass, owner ? onSite : undefined);
      setProgress(1); onPublished(at); setDone(true); setJustDone(true); setTimeout(() => setJustDone(false), 1800);
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
      {owner && <label className="csb-pub-site"><span>Show on katelynwolfley.design<small>{onSite ? 'A card appears in your Work section, and the page opens inside your site.' : 'Only people with the link can see it.'}</small></span><input type="checkbox" role="switch" checked={onSite} onChange={e => { setOnSite(e.target.checked); onWebsiteChange?.(e.target.checked); }} /><i aria-hidden="true" /></label>}
      <button type="button" className={`csb-pub-go ${busy ? 'is-busy' : ''} ${justDone ? 'is-done' : ''}`} disabled={!!busy} onClick={() => void run()}
        aria-busy={!!busy} aria-valuenow={busy ? Math.round(progress * 100) : undefined} aria-valuemin={0} aria-valuemax={100} role={busy ? 'progressbar' : undefined} aria-label={busy ? `${busy}, ${Math.round(progress * 100)}%` : undefined}>
        {busy && <i className="csb-pub-fill" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />}
        <span>{busy ? busy : justDone ? 'Published' : done ? 'Publish changes' : 'Publish'}</span>
        {busy && <b>{Math.round(progress * 100)}%</b>}
      </button>
      {error && <p className="csb-pub-error" role="alert">{error}</p>}
      {study.publishedAt && <small>Last published {new Date(study.publishedAt).toLocaleString()}</small>}
    </div>
  </div>;
}
