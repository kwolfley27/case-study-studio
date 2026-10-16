import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Minus, Plus } from 'lucide-react';
import { EditableText } from './EditableText';
import { Media } from './Media';
import { authHeaders } from './auth';
import { projectId } from '../../utils/supabase/info';
import { createSection, type CaseStudySection } from './model';
import { getStudy, saveStudy } from './studyLibrary';

/*
  Sections built from a picture.
  Drop in a screenshot of any section you like (an old case study, a site you admire) and AI lays it out again
  with a few simple blocks: boxes, words, pictures, chips. The result is a normal, editable section in your
  colours and type, and it's saved to My sections so you can reuse the layout in any case study.
*/

export type BuiltNode = {
  id: string; parent: string; type: 'box' | 'text' | 'image' | 'chip' | 'divider';
  dir?: 'row' | 'column' | 'grid'; columns?: number; gap?: Size; pad?: Size; bg?: Fill; radius?: Size | 'pill'; border?: boolean;
  align?: 'start' | 'center' | 'end' | 'stretch'; justify?: 'start' | 'center' | 'end' | 'between'; width?: 'auto' | 'third' | 'half' | 'twoThirds' | 'full'; repeat?: boolean;
  role?: 'eyebrow' | 'heading' | 'subheading' | 'body' | 'small' | 'stat' | 'label' | 'quote'; text?: string; weight?: 'regular' | 'bold'; textAlign?: 'start' | 'center' | 'end';
  ratio?: 'square' | 'landscape' | 'portrait' | 'wide' | 'tall'; alt?: string; src?: string;
  chipStyle?: 'outline' | 'filled' | 'soft'; icon?: 'none' | 'arrow' | 'check' | 'dot' | 'plus';
};
type Size = 'none' | 's' | 'm' | 'l';
type Fill = 'none' | 'paper' | 'surface' | 'accent' | 'accentSoft' | 'dark';
export type BuiltData = { name: string; background?: Fill; nodes: BuiltNode[]; reference?: string };

const pick = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list as readonly string[]).includes(v as string) ? v as T : undefined;
const SIZES = ['none', 's', 'm', 'l'] as const, FILLS = ['none', 'paper', 'surface', 'accent', 'accentSoft', 'dark'] as const;

/** Whatever came back from AI → a safe, tidy layout (unknown values dropped, broken links fixed). */
export function cleanLayout(raw: any): BuiltData {
  const list: any[] = Array.isArray(raw?.nodes) ? raw.nodes.slice(0, 80) : [];
  const seen = new Set<string>(['root']); const nodes: BuiltNode[] = [];
  for (const n of list) {
    const type = pick(n?.type, ['box', 'text', 'image', 'chip', 'divider'] as const); if (!type) continue;
    let id = String(n.id || '').replace(/[^\w-]/g, '').slice(0, 24) || `n${nodes.length}`; while (seen.has(id)) id += 'x';
    const parentId = String(n.parent || 'root');
    const parent = seen.has(parentId) && (parentId === 'root' || nodes.find(p => p.id === parentId)?.type === 'box') ? parentId : 'root';
    seen.add(id);
    nodes.push({
      id, parent, type,
      ...(type === 'box' ? { dir: pick(n.dir, ['row', 'column', 'grid'] as const) ?? 'column', columns: Math.max(1, Math.min(6, Number(n.columns) || 0)) || undefined, gap: pick(n.gap, SIZES), pad: pick(n.pad, SIZES), bg: pick(n.bg, FILLS), radius: pick(n.radius, [...SIZES, 'pill'] as const), border: !!n.border, align: pick(n.align, ['start', 'center', 'end', 'stretch'] as const), justify: pick(n.justify, ['start', 'center', 'end', 'between'] as const), repeat: !!n.repeat } : {}),
      ...(type === 'text' ? { role: pick(n.role, ['eyebrow', 'heading', 'subheading', 'body', 'small', 'stat', 'label', 'quote'] as const) ?? 'body', text: String(n.text ?? '').slice(0, 1200), weight: pick(n.weight, ['regular', 'bold'] as const), textAlign: pick(n.textAlign, ['start', 'center', 'end'] as const) } : {}),
      ...(type === 'image' ? { ratio: pick(n.ratio, ['square', 'landscape', 'portrait', 'wide', 'tall'] as const) ?? 'landscape', alt: String(n.alt ?? '').slice(0, 120) } : {}),
      ...(type === 'chip' ? { text: String(n.text ?? '').slice(0, 80), chipStyle: pick(n.chipStyle, ['outline', 'filled', 'soft'] as const) ?? 'outline', icon: pick(n.icon, ['none', 'arrow', 'check', 'dot', 'plus'] as const) } : {}),
      width: pick(n.width, ['auto', 'third', 'half', 'twoThirds', 'full'] as const),
    });
  }
  return { name: String(raw?.name || 'Section from a picture').slice(0, 40), background: pick(raw?.background, FILLS) ?? 'none', nodes };
}

/** A new section from a layout (used for AI results and for My sections). */
export function sectionFromLayout(layout: BuiltData, intro?: { eyebrow?: string; title?: string; body?: string }): CaseStudySection {
  const base = createSection('built');
  const fresh = cloneNodes(layout.nodes);
  return { ...base, eyebrow: intro?.eyebrow ?? '', title: intro?.title ?? '', body: intro?.body ?? '', navLabel: layout.name.slice(0, 30), options: { ...(base.options ?? {}), ...(intro?.body ? {} : { hideBody: true }), ...(intro?.eyebrow ? {} : { hideEyebrow: true }), ...(intro?.title ? {} : { hideTitle: true }) }, built: { ...layout, nodes: fresh } };
}

/* New ids for a set of nodes (so two copies never share text or picture spots). */
function cloneNodes(nodes: BuiltNode[], keepImages = true) {
  const map = new Map<string, string>(); const rid = () => Math.random().toString(36).slice(2, 8);
  nodes.forEach(n => map.set(n.id, `${n.type[0]}${rid()}`));
  return nodes.map(n => ({ ...n, id: map.get(n.id)!, parent: map.get(n.parent) ?? n.parent, ...(keepImages ? {} : { src: undefined }) }));
}

/* ---------- editing ---------- */
export const editBuilt = (section: CaseStudySection, nodeId: string, value: string): CaseStudySection => !section.built ? section : { ...section, built: { ...section.built, nodes: section.built.nodes.map(n => n.id === nodeId ? { ...n, text: value } : n) } };
export const setBuiltImage = (section: CaseStudySection, nodeId: string, url: string): CaseStudySection => !section.built ? section : { ...section, built: { ...section.built, nodes: section.built.nodes.map(n => n.id === nodeId ? { ...n, src: url || undefined } : n) } };
const subtree = (nodes: BuiltNode[], id: string): BuiltNode[] => { const out = nodes.filter(n => n.id === id); for (let i = 0; i < out.length; i++) out.push(...nodes.filter(n => n.parent === out[i].id)); return out; };
export const repeatGroups = (section: CaseStudySection) => (section.built?.nodes ?? []).filter(n => n.type === 'box' && n.repeat).map(box => ({ box, count: section.built!.nodes.filter(n => n.parent === box.id).length }));
export function changeRepeat(section: CaseStudySection, boxId: string, delta: 1 | -1): CaseStudySection {
  const nodes = section.built?.nodes; if (!nodes) return section;
  const kids = nodes.filter(n => n.parent === boxId); const last = kids[kids.length - 1]; if (!last) return section;
  if (delta < 0) { if (kids.length <= 1) return section; const gone = new Set(subtree(nodes, last.id).map(n => n.id)); return { ...section, built: { ...section.built!, nodes: nodes.filter(n => !gone.has(n.id)) } }; }
  const copy = cloneNodes(subtree(nodes, last.id), false); copy[0] = { ...copy[0], parent: boxId };
  const at = nodes.lastIndexOf(subtree(nodes, last.id).slice(-1)[0]) + 1;
  return { ...section, built: { ...section.built!, nodes: [...nodes.slice(0, at), ...copy, ...nodes.slice(at)] } };
}

/* ---------- drawing ---------- */
const luminance = (hex: string) => { const m = hex.trim().match(/^#?([0-9a-f]{6})$/i); if (!m) return 0.2; const [r, g, b] = [0, 2, 4].map(i => { const c = parseInt(m[1].slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ICON = { arrow: ArrowUpRight, check: Check, plus: Plus } as const;

export function BuiltView({ section, editorMode }: { section: CaseStudySection; editorMode: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lightAccent, setLightAccent] = useState(false);
  useLayoutEffect(() => { const el = ref.current; if (el) setLightAccent(luminance(getComputedStyle(el).getPropertyValue('--csb-accent')) > 0.45); });
  const built = section.built;
  if (!built?.nodes.length) return <div className="csb-built-empty">This section has no layout yet.</div>;
  const kids = new Map<string, BuiltNode[]>(); built.nodes.forEach(n => kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]));
  const draw = (n: BuiltNode): React.ReactNode => {
    const cls = `csb-b-${n.type}${n.width && n.width !== 'auto' ? ` w-${n.width}` : ''}`;
    if (n.type === 'box') {
      const style = { '--b-cols': n.columns ?? Math.max(1, (kids.get(n.id) ?? []).length) } as React.CSSProperties;
      return <div key={n.id} className={`${cls} d-${n.dir ?? 'column'} gap-${n.gap ?? 'm'} pad-${n.pad ?? (n.bg && n.bg !== 'none' ? 'm' : 'none')} fill-${n.bg ?? 'none'} r-${n.radius ?? 'none'} a-${n.align ?? 'stretch'} j-${n.justify ?? 'start'}${n.border ? ' has-border' : ''}`} style={style}>{(kids.get(n.id) ?? []).map(draw)}</div>;
    }
    if (n.type === 'text') { const Tag = n.role === 'heading' ? 'h3' : n.role === 'subheading' ? 'h4' : n.role === 'quote' ? 'blockquote' : 'p'; return <Tag key={n.id} className={`${cls} t-${n.role}${n.weight === 'bold' ? ' is-bold' : ''} ta-${n.textAlign ?? 'start'}`}><EditableText field={`built:${n.id}`} value={n.text ?? ''} /></Tag>; }
    if (n.type === 'chip') { const I = n.icon && n.icon !== 'none' && n.icon !== 'dot' ? ICON[n.icon] : null; return <span key={n.id} className={`${cls} c-${n.chipStyle ?? 'outline'}`}>{I && <I size={14} strokeWidth={1.8} />}{n.icon === 'dot' && <i aria-hidden="true" />}<EditableText field={`built:${n.id}`} value={n.text ?? ''} /></span>; }
    if (n.type === 'divider') return <hr key={n.id} className={cls} />;
    return <div key={n.id} className={`${cls} ratio-${n.ratio ?? 'landscape'}${n.src ? ' has-image' : ''}`} data-image-slot={`${section.id}:b:${n.id}`}>{n.src ? <Media src={n.src} alt={n.alt || ''} loading="lazy" /> : editorMode ? <span>{n.alt || 'Picture'}</span> : null}</div>;
  };
  return <div ref={ref} className={`csb-built fill-${built.background ?? 'none'}${lightAccent ? ' accent-is-light' : ''}`}>{(kids.get('root') ?? []).map(draw)}</div>;
}

/* ---------- AI ---------- */
const AI_URL = import.meta.env.VITE_STUDIO_AI_URL || (projectId ? `https://${projectId}.supabase.co/functions/v1/studio-ai-draft` : '');

/** Any picture (file, pasted image or link) → a JPEG small enough to send. */
export async function toJpeg(source: Blob | string, max = 1600): Promise<string> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Ask AI to rebuild the section in the picture. Returns a ready section (also saved to My sections). */
export async function buildFromPicture(source: Blob | string, hint = ''): Promise<CaseStudySection> {
  const jpeg = await toJpeg(source);
  const passcode = (() => { try { return localStorage.getItem('csb-ai-passcode') || ''; } catch { return ''; } })();
  const res = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(), 'X-Studio-Passcode': passcode }, body: JSON.stringify({ task: 'buildSection', image: jpeg.split(',')[1], hint }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data.nodes)) throw new Error(/Notion research link/.test(data.error || '') ? 'Building from a picture needs the latest AI function deployed. Try again in a few minutes.' : data.message || data.error || 'Couldn’t build that section. Try again.');
  const layout = { ...cleanLayout(data), reference: await toJpeg(jpeg, 480) };
  if (!layout.nodes.length) throw new Error('AI couldn’t find a layout in that picture. Try a tighter screenshot of one section.');
  await saveToMySections(layout).catch(() => undefined);
  return sectionFromLayout(layout, { eyebrow: data.eyebrow, title: data.title, body: data.body });
}

/* ---------- My sections (kept with your case studies, so they follow your account) ---------- */
const MINE = '__my-sections';
export type SavedLayout = BuiltData & { id: string; savedAt: string };
export async function getMySections(): Promise<SavedLayout[]> { const rec = await getStudy(MINE).catch(() => undefined) as unknown as { layouts?: SavedLayout[]; deletedAt?: string } | undefined; return rec && !rec.deletedAt ? rec.layouts ?? [] : []; }
async function putMySections(layouts: SavedLayout[]) { await saveStudy({ id: MINE, title: 'My sections', slug: 'my-sections', layouts } as never); window.dispatchEvent(new Event('csb-my-sections')); }
/** Save a layout for reuse. Pictures and words stay as a starting point; a copy gets fresh picture spots. */
export async function saveToMySections(layout: BuiltData) { const list = await getMySections(); await putMySections([{ ...layout, nodes: layout.nodes.map(n => ({ ...n, src: undefined })), id: crypto.randomUUID(), savedAt: new Date().toISOString() }, ...list].slice(0, 60)); }
export async function removeFromMySections(id: string) { await putMySections((await getMySections()).filter(l => l.id !== id)); }
export async function renameMySection(id: string, name: string) { await putMySections((await getMySections()).map(l => l.id === id ? { ...l, name: name.slice(0, 40) } : l)); }

/* Right panel controls for a built section. */
export function BuiltControls({ section, onChange, notify }: { section: CaseStudySection; onChange: (next: CaseStudySection) => void; notify: (text: string) => void }) {
  const groups = repeatGroups(section);
  const bg = section.built?.background ?? 'none';
  const [saving, setSaving] = useState(false);
  return <>
    <div className="csb-field"><span className="csb-field-label">Behind the layout</span><div className="csb-segment" role="group" aria-label="Behind the layout">{([["none", "None"], ["surface", 'Soft'], ['accentSoft', 'Tint'], ['accent', 'Accent'], ['dark', 'Dark']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={bg === v} onClick={() => onChange({ ...section, built: { ...section.built!, background: v } })}>{l}</button>)}</div></div>
    {groups.map(({ box, count }, i) => <div className="csb-field csb-built-count" key={box.id}><span className="csb-field-label">{groups.length > 1 ? `Repeating group ${i + 1}` : 'Cards'}</span><div className="csb-built-stepper"><button type="button" aria-label="Remove one" disabled={count <= 1} onClick={() => onChange(changeRepeat(section, box.id, -1))}><Minus size={14} /></button><output>{count}</output><button type="button" aria-label="Add one" onClick={() => onChange(changeRepeat(section, box.id, 1))}><Plus size={14} /></button></div></div>)}
    <p className="csb-field-note">Click any words on the page to change them. Drop a picture on any picture spot.</p>
    <button type="button" className="csb-built-save" disabled={saving || !section.built} onClick={() => { setSaving(true); void saveToMySections({ ...section.built!, name: section.navLabel || section.built!.name }).then(() => notify('Saved to My sections. Find it under Add section.')).finally(() => setSaving(false)); }}>Save this layout to My sections</button>
    {section.built?.reference && <details className="csb-built-ref"><summary>The picture it was built from</summary><img src={section.built.reference} alt="Reference used to build this section" /></details>}
  </>;
}
