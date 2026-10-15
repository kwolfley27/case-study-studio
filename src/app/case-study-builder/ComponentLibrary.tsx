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

export function ComponentLibrary({open,onOpenChange,onAdd,study}:{open:boolean;onOpenChange:(open:boolean)=>void;onAdd:(template:ComponentTemplate)=>void;study?:BuilderStudy}) {
 const [query,setQuery]=useState(''); const [phase,setPhase]=useState<Phase>('All'); const [sort,setSort]=useState('process');
 const results=useMemo(()=>templates.filter(t=>(phase==='All'||t.phase===phase)&&`${t.name} ${t.tags} ${t.description} ${t.phase}`.toLowerCase().includes(query.toLowerCase().trim())).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):phases.indexOf(a.phase)-phases.indexOf(b.phase)),[query,phase,sort]);
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="csb-library"><div className="csb-library-heading"><span className="csb-panel-kicker">YOUR STORY, PIECE BY PIECE</span><DialogTitle>Find the right component</DialogTitle><DialogDescription>Start with a design phase, or choose a flexible layout that fits anywhere.</DialogDescription></div><div className="csb-library-search"><Search size={18}/><input aria-label="Search components" placeholder="Try research, problem statement, or columns…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')}>Clear</button>}</div><div className="csb-library-filters">{phases.map(p=><button key={p} aria-pressed={phase===p} onClick={()=>setPhase(p)}>{p}</button>)}</div><div className="csb-library-sort"><span aria-live="polite">{results.length} components</span><label>Sort <select aria-label="Sort components" value={sort} onChange={e=>setSort(e.target.value)}><option value="process">Design process</option><option value="name">Name A–Z</option></select></label></div><div className="csb-library-results">{results.map(t=><button className="csb-template" key={t.id} onClick={()=>onAdd(t)} aria-label={`Add ${t.name}`}><TemplatePreview template={t} study={study}/><div className="csb-template-copy"><small>{t.phase}</small><strong>{t.name}<Plus size={15}/></strong><p>{t.description}</p></div></button>)}{!results.length&&<div className="csb-library-empty"><h3>No matching components</h3><p>Try a different word or browse all phases.</p><button onClick={()=>{setQuery('');setPhase('All')}}>Clear filters</button></div>}</div><div className="csb-library-footer">Click to add · All text is editable on the canvas · Layouts adapt to mobile</div></DialogContent></Dialog>;
}
