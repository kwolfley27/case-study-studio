import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Image as ImageIcon, Palette, Clapperboard, Tablet, Layers, GalleryVerticalEnd, Laptop, GitCompare, Grid2x2, ListChecks, AlignLeft, ArrowLeftRight, BarChart3, Brain, CalendarRange, CircleCheck, Columns2, Columns3, Component, Copy, Crosshair, Eye, EyeOff, FlaskConical, Frame, GalleryHorizontal, GitBranch, Hash, Image, Images, Info, LayoutTemplate, ListOrdered, MessagesSquare, MoreHorizontal, MousePointerClick, MoveDown, MoveUp, Plus, Quote, Route, Rows3, ScanSearch, Smartphone, StickyNote, Target, Trash2, Type, Lightbulb, Flag, History, UserRound, Users, Video, Workflow, Sparkles } from 'lucide-react';
import { componentNames, navLabelFor, type BuilderStudy, type CaseStudySection, type SectionKind } from './model';

/*
  The left sidebar, Apple style: one line per section, an icon for what it is, its short name,
  and the component type underneath in grey. Drag to reorder; ⋯ for the rest.
*/
type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;
const ICONS: Record<SectionKind, Icon> = {
  photo: ImageIcon, brand: Palette,
  built: Sparkles,
  flowRace: Video,
  coverHero: LayoutTemplate, details: Info, timeline: CalendarRange, empathy: Brain, persona: UserRound, journey: Route, problem: Target,
  findings: ListOrdered, methods: FlaskConical, interviews: MessagesSquare, quotes: Quote, survey: BarChart3, metrics: Hash, affinity: StickyNote,
  aeiou: Eye, abtest: Columns2, taskSuccess: CircleCheck, roadmap: CalendarRange, flowCompare: GitCompare, userFlow: Workflow, jtbd: Target, scrollSite: Laptop, barChart: BarChart3, typeSpec: Type, insights: Lightbulb, screenGroups: GalleryVerticalEnd, isoShowcase: Layers, gifBoard: Clapperboard, screenTrio: GalleryHorizontal, floatDevices: Tablet, interviewQs: MessagesSquare, iterations: History, flowDiff: GitCompare, featureCompare: ListChecks, positioning: Grid2x2, prototype: MousePointerClick, screenRecording: Video, wireframes: Frame, fullMedia: Image,
  gallery: Images, carousel: GalleryHorizontal, showcase: Component, screenFocus: Smartphone, screenStory: Smartphone, screenStrip: Smartphone,
  annotated: ScanSearch, flow: Workflow, comparison: ArrowLeftRight, narrative: AlignLeft, rows: Rows3, columns: Columns3, competitors: Users,
  gap: Crosshair, issueFlow: GitBranch,
};

export function SectionNavigator({ study, selectedId, onSelect, onMove, onHide, onDuplicate, onDelete, onAdd }: {
  study: BuilderStudy; selectedId: string | null; onSelect: (id: string | null) => void;
  onMove: (from: number, to: number) => void; onHide: (id: string) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void; onAdd: () => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const heroName = ({ standard: 'Standard header', reveal: 'Title reveal', immersive: 'Full-width header' } as Record<string, string>)[study.hero?.style ?? 'standard'];
  return <nav className="csb-nav" aria-label="Sections">
    <div className="csb-nav-head"><h2>Sections</h2><button type="button" className="csb-nav-add" onClick={onAdd} aria-label="Add a section" title="Add a section"><Plus size={16} /></button></div>
    <ol className="csb-nav-list" onDragOver={e => e.preventDefault()}>
      <li className={`csb-nav-row ${selectedId === null ? 'is-on' : ''}`}>
        <button type="button" className="csb-nav-select" onClick={() => onSelect(null)}>
          <span className="csb-nav-icon"><LayoutTemplate size={15} strokeWidth={1.6} /></span>
          <span className="csb-nav-text"><strong>Introduction</strong><small>{heroName}</small></span>
        </button>
      </li>
      {study.sections.map((section, i) => {
        const Icon = ICONS[section.kind] ?? AlignLeft;
        const name = navLabelFor(section);
        const type = componentNames[section.kind];
        const showType = type.toLowerCase() !== name.toLowerCase();
        const dropBefore = drag && drag.over === i && drag.from > i, dropAfter = drag && drag.over === i && drag.from < i;
        return <li key={section.id} draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', section.id); setDrag({ from: i, over: i }); }}
          onDragEnter={() => setDrag(d => d && { ...d, over: i })} onDragEnd={() => setDrag(null)}
          onDrop={e => { e.preventDefault(); if (drag && drag.from !== i) onMove(drag.from, i); setDrag(null); }}
          className={`csb-nav-row ${selectedId === section.id ? 'is-on' : ''} ${section.hidden ? 'is-hidden' : ''} ${menuFor === section.id ? 'has-menu' : ''} ${drag?.from === i ? 'is-dragging' : ''} ${dropBefore ? 'drop-before' : ''} ${dropAfter ? 'drop-after' : ''}`}>
          <button type="button" className="csb-nav-select" title={section.title} onClick={() => onSelect(section.id)}>
            <span className="csb-nav-icon"><Icon size={15} strokeWidth={1.6} /></span>
            <span className="csb-nav-text"><strong>{name}</strong>{showType && <small>{type}</small>}</span>
            {section.hidden && <EyeOff size={13} className="csb-nav-hidden" aria-label="Hidden from the page" />}
          </button>
          <RowMenu section={section} first={i === 0} last={i === study.sections.length - 1} open={menuFor === section.id} onToggle={() => setMenuFor(m => m === section.id ? null : section.id)} onClose={() => setMenuFor(null)}
            onUp={() => onMove(i, i - 1)} onDown={() => onMove(i, i + 1)} onHide={() => onHide(section.id)} onDuplicate={() => onDuplicate(section.id)} onDelete={() => onDelete(section.id)} />
        </li>;
      })}
      <li className={`csb-nav-row is-fixed ${selectedId === '__end' ? 'is-on' : ''}`}>
        <button type="button" className="csb-nav-select" onClick={() => onSelect('__end')}>
          <span className="csb-nav-icon"><Flag size={15} strokeWidth={1.6} /></span>
          <span className="csb-nav-text"><strong>Ending</strong><small>Thank you + more case studies</small></span>
        </button>
      </li>
    </ol>
    <button type="button" className="csb-nav-addrow" onClick={onAdd}><Plus size={14} /> Add section</button>
  </nav>;
}

function RowMenu({ section, first, last, open, onToggle, onClose, onUp, onDown, onHide, onDuplicate, onDelete }: { section: CaseStudySection; first: boolean; last: boolean; open: boolean; onToggle: () => void; onClose: () => void; onUp: () => void; onDown: () => void; onHide: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open) { setConfirm(false); return; }
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open, onClose]);
  const act = (fn: () => void) => () => { fn(); onClose(); };
  return <div className="csb-nav-menu" ref={ref}>
    <button type="button" className="csb-nav-more" aria-label={`More for ${section.title}`} aria-haspopup="menu" aria-expanded={open} onClick={e => { e.stopPropagation(); onToggle(); }}><MoreHorizontal size={15} /></button>
    {open && <div className="csb-row-pop" role="menu" onClick={e => e.stopPropagation()}>
      <button type="button" role="menuitem" disabled={first} onClick={act(onUp)}><MoveUp size={14} /> Move up</button>
      <button type="button" role="menuitem" disabled={last} onClick={act(onDown)}><MoveDown size={14} /> Move down</button>
      <span className="csb-row-pop-sep" />
      <button type="button" role="menuitem" onClick={act(onHide)}>{section.hidden ? <><Eye size={14} /> Show on the page</> : <><EyeOff size={14} /> Hide from the page</>}</button>
      <button type="button" role="menuitem" onClick={act(onDuplicate)}><Copy size={14} /> Duplicate</button>
      <span className="csb-row-pop-sep" />
      {confirm
        ? <div className="csb-row-confirm"><span>Delete this section?</span><button type="button" className="is-danger" onClick={act(onDelete)}>Delete</button><button type="button" onClick={() => setConfirm(false)}>Cancel</button></div>
        : <button type="button" role="menuitem" className="is-danger" onClick={() => setConfirm(true)}><Trash2 size={14} /> Delete…</button>}
    </div>}
  </div>;
}
