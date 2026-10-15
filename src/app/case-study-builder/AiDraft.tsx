import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { componentDescriptions, componentNames, createSection, isBuilderStudy, navDefaults, type BuilderStudy, type CaseStudySection, type SectionKind } from './model';
import { templates } from './library';
import { downloadIntoDraft } from './ImageSlots';

/*
  "Draft with AI": sends the linked Notion page + Figma page (plus the component
  catalog) to the studio-ai-draft server function, which asks Claude to assemble
  the case study. The result is written straight into the draft; the previous
  version is kept so it can be undone.
*/

const ENDPOINT = import.meta.env.VITE_STUDIO_AI_URL || (projectId ? `https://${projectId}.supabase.co/functions/v1/studio-ai-draft` : '');
const PASSCODE_KEY = 'csb-ai-passcode';
const BACKUP_KEY = 'csb-before-ai';
const STAGES = ['Reading your Notion notes…', 'Looking at your Figma frames…', 'Choosing components for the story…', 'Writing sections…', 'Placing your screens…'];

type DraftItem = { title?: string; detail?: string; value?: string; frameId?: string; finding?: string; findingNote?: string; quote?: string; quoteNote?: string };
type DraftSection = { kind: string; navLabel?: string; eyebrow?: string; title: string; body?: string; variant?: string; layoutCount?: number; columns?: number; criteria?: string; items?: DraftItem[] };
type Draft = { title: string; summary: string; client?: string; role?: string; timeframe?: string; heroFrameId?: string; sections: DraftSection[]; gaps?: string[] };

const read = (key: string) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const write = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable */ } };

function catalog() {
  return (Object.keys(componentNames) as SectionKind[]).map(kind => {
    const example = createSection(kind);
    const template = templates.find(item => item.kind === kind);
    return { kind, name: componentNames[kind], purpose: componentDescriptions[kind], phase: template?.phase, defaultNavLabel: navDefaults[kind], itemShape: example.items.slice(0, 2).map(({ image, frameId, tileSize, ...rest }) => ({ ...rest, ...(image !== undefined ? { frameId: '<figma frame id or omit>' } : {}) })), aiRules: template?.ai };
  });
}

export function applyDraft(study: BuilderStudy, draft: Draft, images: Record<string, string>): BuilderStudy {
  const kinds = new Set(Object.keys(componentNames));
  const variants = new Set(['light', 'tinted', 'dark']);
  const sections: CaseStudySection[] = [];
  for (const part of draft.sections ?? []) {
    if (!part || !kinds.has(part.kind)) continue;
    const kind = part.kind as SectionKind;
    const base = createSection(kind);
    const template = templates.find(item => item.kind === kind && (kind !== 'columns' || item.columns === part.columns)) ?? templates.find(item => item.kind === kind);
    const aiItems = Array.isArray(part.items) ? part.items : [];
    const items = (aiItems.length ? aiItems : base.items).map((item, index) => {
      const shape = base.items[index] ?? base.items[base.items.length - 1] ?? { title: '', detail: '' };
      const next: CaseStudySection['items'][number] = { ...shape };
      for (const key of ['title', 'detail', 'value', 'finding', 'findingNote', 'quote', 'quoteNote'] as const) { const value = (item as DraftItem)[key]; if (typeof value === 'string') (next as Record<string, unknown>)[key] = value; }
      const frameId = (item as DraftItem).frameId;
      if (frameId && images[frameId]) { next.image = images[frameId]; next.frameId = frameId; }
      return next;
    });
    const section: CaseStudySection = {
      ...base,
      templateId: template?.id,
      eyebrow: part.eyebrow || template?.phase || base.eyebrow,
      title: part.title || base.title,
      body: typeof part.body === 'string' ? part.body : base.body,
      variant: variants.has(part.variant ?? '') ? part.variant as CaseStudySection['variant'] : base.variant,
      navLabel: part.navLabel || undefined,
      items,
    };
    if (base.layout || part.layoutCount) section.layout = { ...base.layout, count: Math.max(1, Math.min(items.length, part.layoutCount || items.length, 8)) };
    if (kind === 'columns') { section.columns = ([2, 3, 4].includes(part.columns ?? 0) ? part.columns : Math.min(4, Math.max(2, items.length))) as 2 | 3 | 4; section.items = items.slice(0, section.columns); }
    if (kind === 'competitors') section.criteria = part.criteria || template && 'Usability, Accessibility, Personalization, Integration, Guidance, Value';
    if (kind === 'interviews' || kind === 'findings' || kind === 'carousel') section.layout = { count: Math.min(items.length, 8) };
    sections.push(section);
  }
  if (!sections.length) throw new Error('The AI draft had no usable sections. Try again, or add more to your Notion page.');
  const next: BuilderStudy = { ...study, title: draft.title || study.title, summary: draft.summary || study.summary, client: draft.client || study.client, role: draft.role || study.role, timeframe: draft.timeframe || study.timeframe, heroImage: draft.heroFrameId && images[draft.heroFrameId] ? images[draft.heroFrameId] : study.heroImage, sections, lastSyncedAt: new Date().toISOString() };
  if (!isBuilderStudy(next)) throw new Error('The AI draft did not match the case study format. Try again.');
  return next;
}

/** Replace temporary Figma image links with images stored in the draft. */
async function localizeImages(study: BuilderStudy, onProgress: (done: number, total: number) => void): Promise<{ study: BuilderStudy; failed: number }> {
  const urls = new Set<string>();
  if (study.heroImage?.startsWith('http')) urls.add(study.heroImage);
  for (const section of study.sections) for (const item of section.items) if (item.image?.startsWith('http')) urls.add(item.image);
  const map = new Map<string, string>(); let done = 0; let failed = 0;
  for (const url of urls) {
    try { map.set(url, await downloadIntoDraft(url, 650_000, 1800)); } catch { failed++; }
    onProgress(++done, urls.size);
  }
  const swap = (value?: string) => value && map.get(value) || value;
  return { study: { ...study, heroImage: swap(study.heroImage), sections: study.sections.map(section => ({ ...section, items: section.items.map(item => ({ ...item, image: swap(item.image) })) })) }, failed };
}

export function AiDraftCard({ study, onApply, notify }: { study: BuilderStudy; onApply: (next: BuilderStudy) => void; notify: (text: string, error?: boolean) => void }) {
  const [passcode, setPasscode] = useState(() => read(PASSCODE_KEY));
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [gaps, setGaps] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(() => !!read(BACKUP_KEY));
  const timer = useRef<number | null>(null);
  const notionUrl = study.sources?.notionUrl?.trim() || '';
  const figmaUrl = study.sources?.figmaUrl?.trim() || '';

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const run = async () => {
    if (!ENDPOINT) { notify('AI drafting is not set up for this site yet. See “AI drafting setup” in the README.', true); return; }
    if (!notionUrl && !figmaUrl) { notify('Add your Notion research link or Figma design file above first.', true); return; }
    setBusy(true); setGaps([]); setStage(0); setSeconds(0);
    const started = Date.now();
    timer.current = window.setInterval(() => { const elapsed = Math.round((Date.now() - started) / 1000); setSeconds(elapsed); setStage(Math.min(STAGES.length - 2, Math.floor(elapsed / 14))); }, 1000);
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey, 'X-Studio-Passcode': passcode }, body: JSON.stringify({ notionUrl, figmaUrl, guidance, catalog: catalog(), current: { title: study.title, summary: study.summary, client: study.client, role: study.role, timeframe: study.timeframe, sections: study.sections.map(({ kind, title, body, eyebrow, navLabel, items }) => ({ kind, title, body, eyebrow, navLabel, items: items.map(({ image, ...rest }) => rest) })) } }) });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { setNeedsPasscode(true); throw new Error(data.message || 'Enter your Studio passcode.'); }
      if (!response.ok) throw new Error(data.error || `AI draft failed (${response.status}).`);
      setStage(STAGES.length - 1);
      const drafted = applyDraft(study, data.draft, data.images || {});
      const { study: finished, failed } = await localizeImages(drafted, () => undefined);
      write(BACKUP_KEY, JSON.stringify(study)); setCanUndo(true);
      onApply(finished);
      setGaps(Array.isArray(data.draft?.gaps) ? data.draft.gaps.slice(0, 8) : []);
      notify(`AI draft ready: ${finished.sections.length} sections${failed ? ` · ${failed} image${failed > 1 ? 's' : ''} kept as Figma links (expire in ~30 days)` : ''}. Edit anything on the page.`);
    } catch (error) { notify(error instanceof Error ? error.message : 'AI draft failed.', true); }
    finally { if (timer.current) window.clearInterval(timer.current); setBusy(false); }
  };

  const undo = () => {
    try { const previous = JSON.parse(read(BACKUP_KEY)); if (!isBuilderStudy(previous)) throw new Error(); onApply(previous); write(BACKUP_KEY, null); setCanUndo(false); setGaps([]); notify('Restored the version from before the AI draft.'); }
    catch { notify('No earlier version to restore.', true); }
  };

  return <div className="csb-ai-card">
    <div className="csb-ai-card-head"><Sparkles size={15} /><strong>Draft with AI</strong></div>
    <p>Reads your Notion notes and Figma frames, picks components and writes the case study. It only uses facts and quotes from your notes.</p>
    <textarea value={guidance} onChange={event => setGuidance(event.target.value)} rows={2} placeholder="Optional: anything to emphasize? e.g. focus on the research, keep it under 8 sections" aria-label="Guidance for the AI draft" disabled={busy} />
    {needsPasscode && <input type="password" autoComplete="off" value={passcode} onChange={event => { setPasscode(event.target.value); write(PASSCODE_KEY, event.target.value); }} placeholder="Studio passcode" aria-label="Studio passcode" />}
    <button type="button" className="csb-primary-button" onClick={() => { if (study.sections.length && !window.confirm('Replace this case study with an AI draft? You can undo it afterward.')) return; void run(); }} disabled={busy || (!notionUrl && !figmaUrl)}>{busy ? <><span className="csb-ai-spinner" aria-hidden="true" /> {STAGES[stage]} {seconds}s</> : <><Sparkles size={14} /> Draft case study</>}</button>
    {!notionUrl && !figmaUrl && <small>Add a Notion or Figma link above to start.</small>}
    {busy && <small>This usually takes 30–90 seconds.</small>}
    {canUndo && !busy && <button type="button" className="csb-quiet-button" onClick={undo}><RotateCcw size={13} /> Undo AI draft</button>}
    {gaps.length > 0 && <div className="csb-ai-gaps"><strong>Worth adding to Notion</strong><ul>{gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></div>}
  </div>;
}
