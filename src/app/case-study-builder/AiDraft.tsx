import { authHeaders } from './auth';
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

export const ENDPOINT = import.meta.env.VITE_STUDIO_AI_URL || (projectId ? `https://${projectId}.supabase.co/functions/v1/studio-ai-draft` : '');
export const PASSCODE_KEY = 'csb-ai-passcode';
const BACKUP_KEY = 'csb-before-ai';
const STAGES = ['Reading your Notion notes…', 'Looking at your Figma frames…', 'Choosing components for the story…', 'Writing sections…', 'Placing your screens…'];

type DraftItem = { title?: string; detail?: string; value?: string; frameId?: string; finding?: string; findingNote?: string; quote?: string; quoteNote?: string; when?: string };
type DraftSection = { kind: string; navLabel?: string; eyebrow?: string; title: string; body?: string; variant?: string; layoutCount?: number; columns?: number; criteria?: string; timeUnit?: string; phases?: Array<{ title?: string; detail?: string }>; items?: DraftItem[] };
type Draft = { title: string; summary: string; client?: string; role?: string; timeframe?: string; heroFrameId?: string; sections: DraftSection[]; gaps?: string[] };

const read = (key: string) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const write = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable */ } };

function catalog() {
  return (Object.keys(componentNames) as SectionKind[]).filter(kind => kind !== 'coverHero').map(kind => {
    const example = createSection(kind);
    const template = templates.find(item => item.kind === kind);
    const sectionShape = kind === 'roadmap' ? { roadmap: { start: '2025-10-06', weeks: 12, lanes: [{ id: 'design', title: 'Design' }, { id: 'dev', title: 'Development' }], cards: [{ lane: 'design', week: 0, span: 1, title: 'User research', bullets: ['Send the survey', 'Five interviews'] }], breaks: [5], milestones: [{ week: 11, label: 'Launch', major: true }] } } : kind === 'affinity' ? { affinity: { groups: [{ title: 'Area of concern', issues: [{ title: 'Issue in the user\'s voice', aspects: [{ title: 'What this cluster reveals, first person', notes: ['Observation copied word for word'] }] }] }] } } : kind === 'abtest' ? { abtest: { result: 'b | a | none', method: 'Split test · 2 weeks · 4,212 sessions · 95% confidence', metrics: [{ label: 'Booking completion', kind: 'rate', a: '31', b: '44', better: 'higher' }, { label: 'Time to book', kind: 'number', a: '42', b: '18', unit: 's', better: 'lower' }, { label: 'Preferred B', kind: 'votes', b: '4', of: '5' }] } } : undefined;
    return { kind, sectionShape, name: componentNames[kind], purpose: componentDescriptions[kind], phase: template?.phase, defaultNavLabel: navDefaults[kind], itemShape: example.items.slice(0, kind === 'aeiou' ? 7 : kind === 'persona' ? 8 : 2).map(({ image, frameId, tileSize, pins, spots, ...rest }) => ({ ...rest, ...(image !== undefined ? { frameId: '<figma frame id or omit>' } : {}) })), aiRules: template?.ai };
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
      for (const key of ['title', 'detail', 'value', 'finding', 'findingNote', 'quote', 'quoteNote', 'when'] as const) { const value = (item as DraftItem)[key]; if (typeof value === 'string') (next as Record<string, unknown>)[key] = value; }
      const extra = item as Record<string, unknown>;
      if (kind === 'taskSuccess') next.assist = typeof extra.assist === 'string' || typeof extra.assist === 'number' ? String(extra.assist) : '0';
      if (typeof extra.cat === 'string' && /^[aeiou]$/.test(extra.cat)) next.cat = extra.cat as NonNullable<typeof next.cat>;
      if (typeof extra.blockType === 'string' && ['person', 'list', 'text', 'quote', 'day', 'meter', 'photo', 'facts', 'chips'].includes(extra.blockType)) next.blockType = extra.blockType as NonNullable<typeof next.blockType>;
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
    if (kind === 'timeline') { section.timeUnit = part.timeUnit || 'Week'; const phases = (part.phases ?? []).filter(phase => phase?.title).map(phase => ({ title: String(phase.title), detail: String(phase.detail ?? '') })); section.phases = phases.length ? phases : [...new Set(items.map(item => item.value).filter(Boolean))].map(title => ({ title: String(title), detail: '' })); delete section.layout; }
    const partExtra = part as Record<string, unknown>;
    if (kind === 'affinity') { const aff = partExtra.affinity as { groups?: unknown } | undefined; if (aff && Array.isArray(aff.groups)) section.affinity = { groups: aff.groups as NonNullable<CaseStudySection['affinity']>['groups'], unsorted: [] }; }
    if (kind === 'roadmap') { const rm = partExtra.roadmap as Partial<NonNullable<CaseStudySection['roadmap']>> | undefined; if (rm && Array.isArray(rm.lanes) && Array.isArray(rm.cards)) { const weeks = Math.max(1, Math.min(52, Number(rm.weeks) || 12)); const lanes = rm.lanes.slice(0, 6).map((l, i) => ({ id: String(l.id || `lane${i}`), title: String(l.title || 'Team') })); section.roadmap = { start: /^\d{4}-\d{2}-\d{2}$/.test(String(rm.start)) ? String(rm.start) : (base.roadmap?.start ?? '2025-10-06'), weeks, lanes, cards: rm.cards.slice(0, 60).map(c => ({ id: crypto.randomUUID().slice(0, 8), lane: lanes.some(l => l.id === c.lane) ? String(c.lane) : lanes[0].id, week: Math.max(0, Math.min(weeks - 1, Number(c.week) || 0)), span: Math.max(1, Number(c.span) || 1), title: String(c.title || ''), bullets: Array.isArray(c.bullets) ? c.bullets.slice(0, 4).map(String) : [] })), breaks: Array.isArray(rm.breaks) ? rm.breaks.map(Number).filter(n => n >= 0 && n < weeks) : [], milestones: Array.isArray(rm.milestones) ? rm.milestones.slice(0, 6).map(m => ({ id: crypto.randomUUID().slice(0, 8), week: Math.max(0, Math.min(weeks - 1, Number(m.week) || 0)), label: String(m.label || 'Milestone'), major: !!m.major })) : [] }; } }
    if (kind === 'abtest') { const ab = partExtra.abtest as Record<string, unknown> | undefined; if (ab) section.abtest = { ...(base.abtest ?? { markers: [], metrics: [] }), ...(Array.isArray(ab.metrics) ? { metrics: (ab.metrics as NonNullable<CaseStudySection['abtest']>['metrics']).slice(0, 3) } : {}), ...(typeof ab.method === 'string' ? { method: ab.method } : {}), ...(['a', 'b', 'none'].includes(String(ab.result)) ? { result: ab.result as 'a' | 'b' | 'none' } : {}), markers: [] }; }
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
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Studio-Passcode': passcode }, body: JSON.stringify({ notionUrl, figmaUrl, guidance, catalog: catalog(), current: { title: study.title, summary: study.summary, client: study.client, role: study.role, timeframe: study.timeframe, sections: study.sections.map(({ kind, title, body, eyebrow, navLabel, items }) => ({ kind, title, body, eyebrow, navLabel, items: items.map(({ image, ...rest }) => rest) })) } }) });
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
