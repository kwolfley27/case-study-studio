import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, ImagePlus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { phases, templates, sectionFromTemplate, type ComponentTemplate, type Phase } from './library';
import { CaseStudyCanvas } from './CaseStudyCanvas';
import type { BuilderStudy, CaseStudySection } from './model';
import { getMySections, removeFromMySections, sectionFromLayout, type SavedLayout } from './Built';

/* A real, miniature render of the component in the current page style. */
const PREVIEW_WIDTH = 920;
function TemplatePreview({ template, study }: { template: ComponentTemplate; study?: BuilderStudy }) {
  const section = useMemo(() => sectionFromTemplate(template), [template]);
  return <LivePreview section={section} study={study} />;
}
function LivePreview({ section: source, study }: { section: CaseStudySection; study?: BuilderStudy }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [scale, setScale] = useState(0.3);
  const [top, setTop] = useState(0);
  const section = useMemo(() => { const s = source; return { ...s, variant: s.variant === 'dark' ? 'dark' as const : 'light' as const, options: { ...s.options, hideEyebrow: true, hideTitle: true, hideBody: true } }; }, [source]);
  const mini: BuilderStudy | null = useMemo(() => study ? { ...study, showNav: false, sections: [section] } : null, [study, section]);
  useEffect(() => { const el = box.current; if (!el) return; const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' }); io.observe(el); return () => io.disconnect(); }, []);
  useEffect(() => {
    if (!visible) return;
    const fit = () => { const b = box.current, c = inner.current; if (!b || !c) return; const h = c.scrollHeight || 1; const k = Math.min(b.clientWidth / PREVIEW_WIDTH, b.clientHeight / h); setScale(k); setTop(Math.max(0, (b.clientHeight - h * k) / 2)); };
    fit(); const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current); if (inner.current) ro.observe(inner.current);
    const late = window.setTimeout(fit, 900);
    return () => { ro.disconnect(); window.clearTimeout(late); };
  }, [visible]);
  return <div ref={box} className="csb-template-art csb-template-live" aria-hidden="true" inert>
    {visible && mini && <div ref={inner} className="csb-template-live-inner" style={{ width: PREVIEW_WIDTH, top, transform: `translateX(-50%) scale(${scale})` }}><CaseStudyCanvas study={mini} bare /></div>}
  </div>;
}

const label = (p: Phase) => p === 'Flexible layouts' ? 'Layouts' : p;
const order = phases.filter(p => p !== 'All');

export function ComponentLibrary({open,onOpenChange,onAdd,study,onAddSection,onBuildPicture}:{open:boolean;onOpenChange:(open:boolean)=>void;onAdd:(template:ComponentTemplate)=>void;study?:BuilderStudy;onAddSection?:(section:CaseStudySection,name:string)=>void;onBuildPicture?:(source:Blob|string,hint:string)=>Promise<void>}) {
  const [mine, setMine] = useState<SavedLayout[]>([]);
  useEffect(() => { if (!open) return; const load = () => void getMySections().then(setMine); load(); window.addEventListener('csb-my-sections', load); return () => window.removeEventListener('csb-my-sections', load); }, [open]);
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('All');
  const q = query.toLowerCase().trim();
  const results = useMemo(() => templates
    .filter(t => (phase === 'All' || t.phase === phase || t.alsoIn?.includes(phase)) && `${t.name} ${t.tags} ${t.description} ${t.phase}`.toLowerCase().includes(q))
    .sort((a, b) => order.indexOf(a.phase) - order.indexOf(b.phase)), [q, phase]);
  // In "All" with no search, group the cards under their phase.
  const groups = phase === 'All' && !q ? order.map(p => ({ phase: p, items: results.filter(t => t.phase === p) })).filter(g => g.items.length) : [{ phase: null as Phase | null, items: results }];
  const card = (t: ComponentTemplate) => <button className="csb-template" key={t.id} onClick={() => onAdd(t)} aria-label={`Add ${t.name}`}>
    <TemplatePreview template={t} study={study} />
    <div className="csb-template-copy"><strong>{t.name}<Plus size={15} /></strong><p>{t.description}</p></div>
  </button>;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="csb-library csb-library-v2">
    <DialogTitle className="sr-only">Add a section</DialogTitle><DialogDescription className="sr-only">Search or filter by design phase, then choose a component.</DialogDescription>
    <div className="csb-library-search"><Search size={18} /><input autoFocus aria-label="Search components" placeholder="Search components" value={query} onChange={e => setQuery(e.target.value)} />{query && <button onClick={() => setQuery('')}>Clear</button>}</div>
    <div className="csb-library-filters">{phases.map(p => <button key={p} aria-pressed={phase === p} onClick={() => setPhase(p)}>{label(p)}</button>)}</div>
    <div className="csb-library-body">
      {onBuildPicture && phase === 'All' && !q && <BuildFromPicture onBuild={onBuildPicture} />}
      {onAddSection && (phase === 'All' || phase === 'Flexible layouts') && mine.filter(l => !q || l.name.toLowerCase().includes(q)).length > 0 && <section className="csb-library-group">
        <h3>My sections</h3>
        <div className="csb-library-results">{mine.filter(l => !q || l.name.toLowerCase().includes(q)).map(l => <div className="csb-template csb-template-mine" key={l.id}>
          <button type="button" className="csb-template-hit" onClick={() => onAddSection(sectionFromLayout(l), l.name)} aria-label={`Add ${l.name}`}><MinePreview layout={l} study={study} /><div className="csb-template-copy"><strong>{l.name}<Plus size={15} /></strong><p>Built from a picture · {new Date(l.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p></div></button>
          <button type="button" className="csb-template-remove" aria-label={`Remove ${l.name} from My sections`} title="Remove from My sections" onClick={() => { if (confirm(`Remove “${l.name}” from My sections? Case studies already using it keep their copy.`)) void removeFromMySections(l.id); }}><X size={13} /></button>
        </div>)}</div>
      </section>}
      {groups.map(g => <section key={g.phase ?? 'results'} className="csb-library-group">
        {g.phase && <h3>{label(g.phase)}</h3>}
        <div className="csb-library-results">{g.items.map(card)}</div>
      </section>)}
      {!results.length && <div className="csb-library-empty"><h3>Nothing matches “{query}”</h3><button onClick={() => { setQuery(''); setPhase('All'); }}>Show all</button></div>}
    </div>
  </DialogContent></Dialog>;
}

function MinePreview({ layout, study }: { layout: SavedLayout; study?: BuilderStudy }) {
  const section = useMemo(() => sectionFromLayout(layout), [layout]);
  return <LivePreview section={section} study={study} />;
}

/* Drop, paste or choose a screenshot; AI lays the section out again with your colours and type. */
function BuildFromPicture({ onBuild }: { onBuild: (source: Blob | string, hint: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [preview, setPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const go = (source: Blob | string) => {
    if (busy) return;
    setError(''); setBusy(true); setPreview(typeof source === 'string' ? source : URL.createObjectURL(source));
    onBuild(source, hint.trim()).catch(e => setError(e instanceof Error ? e.message : 'Couldn’t build that section.')).finally(() => setBusy(false));
  };
  useEffect(() => {
    const paste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); go(f); } };
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste);
  });
  return <section className="csb-library-group">
    <h3>Build from a picture</h3>
    <div className={`csb-build-drop ${over ? 'is-over' : ''} ${busy ? 'is-busy' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (f) go(f); else if (/^(https?:|data:image)/.test(url.trim())) go(url.trim()); }}>
      {preview && busy ? <img src={preview} alt="" className="csb-build-thumb" /> : <ImagePlus size={20} strokeWidth={1.6} />}
      <div className="csb-build-copy">
        {busy ? <><strong>Building your section…</strong><span>Looking at the layout and laying it out with your colours and type. About half a minute.</span></>
          : <><strong>Drop a screenshot of any section</strong><span>Or paste one (⌘V), or <button type="button" onClick={() => fileRef.current?.click()}>choose a file</button>. It becomes a section you can edit, saved to My sections for next time.</span></>}
        {!busy && <input className="csb-build-hint" value={hint} onChange={e => setHint(e.target.value)} placeholder="Anything to know? e.g. “the cards should be stakeholders” (optional)" aria-label="Note for the AI (optional)" />}
        {error && <p className="csb-build-error" role="alert">{error}</p>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) go(f); }} />
    </div>
  </section>;
}
