import { useEffect, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, MoreHorizontal, Trash2 } from 'lucide-react';
import type { CaseStudySection } from './model';

/* The ⋯ menu on each section in the left panel: hide/show, duplicate, delete. */
export function SectionMenu({ section, open, onOpen, onClose, onHide, onDuplicate, onDelete }: {
  section: CaseStudySection; open: boolean; onOpen: () => void; onClose: () => void;
  onHide: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
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
  return <div className="csb-row-menu" ref={ref}>
    <button type="button" className="csb-row-more" aria-label={`More options for ${section.title}`} aria-haspopup="menu" aria-expanded={open} onClick={e => { e.stopPropagation(); onOpen(); }}><MoreHorizontal size={15} /></button>
    {open && <div className="csb-row-pop" role="menu" onClick={e => e.stopPropagation()}>
      <button type="button" role="menuitem" onClick={act(onHide)}>{section.hidden ? <><Eye size={14} /> Show on the page</> : <><EyeOff size={14} /> Hide from the page</>}</button>
      <button type="button" role="menuitem" onClick={act(onDuplicate)}><Copy size={14} /> Duplicate</button>
      <span className="csb-row-pop-sep" />
      {confirm
        ? <div className="csb-row-confirm"><span>Delete this section?</span><button type="button" className="is-danger" onClick={act(onDelete)}>Delete</button><button type="button" onClick={() => setConfirm(false)}>Cancel</button></div>
        : <button type="button" role="menuitem" className="is-danger" onClick={() => setConfirm(true)}><Trash2 size={14} /> Delete…</button>}
    </div>}
  </div>;
}
