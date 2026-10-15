import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { phases, templates, sectionFromTemplate, type ComponentTemplate, type Phase } from './library';
import { CaseStudyCanvas } from './CaseStudyCanvas';
import type { BuilderStudy } from './model';

/* A real, miniature render of the component in the current page style. */
const PREVIEW_WIDTH = 920;
function TemplatePreview({ template, study }: { template: ComponentTemplate; study?: BuilderStudy }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [scale, setScale] = useState(0.3);
  const [top, setTop] = useState(0);
  const section = useMemo(() => { const s = sectionFromTemplate(template); return { ...s, variant: s.variant === 'dark' ? 'dark' as const : 'light' as const, options: { ...s.options, hideEyebrow: true, hideTitle: true, hideBody: true } }; }, [template]);
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

export function ComponentLibrary({open,onOpenChange,onAdd,study}:{open:boolean;onOpenChange:(open:boolean)=>void;onAdd:(template:ComponentTemplate)=>void;study?:BuilderStudy}) {
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
      {groups.map(g => <section key={g.phase ?? 'results'} className="csb-library-group">
        {g.phase && <h3>{label(g.phase)}</h3>}
        <div className="csb-library-results">{g.items.map(card)}</div>
      </section>)}
      {!results.length && <div className="csb-library-empty"><h3>Nothing matches “{query}”</h3><button onClick={() => { setQuery(''); setPhase('All'); }}>Show all</button></div>}
    </div>
  </DialogContent></Dialog>;
}
