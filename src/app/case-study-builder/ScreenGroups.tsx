import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronLeft, ChevronRight, Maximize2, Plus, Trash2, X } from 'lucide-react';
import { EditableText } from './EditableText';
import { useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Screen gallery: screens grouped by page in collapsible rows.
  Collapsed, a row shows the page name, how many screens and small thumbnails.
  Open, it shows each screen with an optional version badge (V1, V2), a name and a note.
  Click a screen to see it full size in a lightbox; ← → step through the page, Esc closes.
  items: title, detail, image, group = page name, tag = version badge.
  options.open = 'first' (default) | 'all' | 'none'.
*/
type Item = CaseStudySection['items'][number];
type Group = { name: string; items: Array<{ it: Item; i: number }> };
const groupsOf = (items: Item[]): Group[] => {
  const out: Group[] = [];
  items.forEach((it, i) => { const name = (it.group || 'Screens').trim(); let g = out.find(x => x.name === name); if (!g) { g = { name, items: [] }; out.push(g); } g.items.push({ it, i }); });
  return out;
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function ScreenGroups({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion();
  const groups = useMemo(() => groupsOf(section.items), [section.items]);
  const mode = String(section.options?.open ?? 'first');
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map((g, k) => [g.name, mode === 'all' || (mode === 'first' && k === 0)])));
  const [box, setBox] = useState<{ g: number; k: number } | null>(null);
  const noun = String(section.options?.noun || 'screen');
  const total = section.items.length;

  return <div className="csb-sg">
    <p className="csb-sg-count">{plural(total, noun)} across {plural(groups.length, 'page')}</p>
    {groups.map((g, gi) => { const isOpen = !!open[g.name];
      return <div key={g.name} className={`csb-sg-group ${isOpen ? 'is-open' : ''}`}>
        <button type="button" className="csb-sg-head" aria-expanded={isOpen} onClick={e => { e.stopPropagation(); setOpen(o => ({ ...o, [g.name]: !isOpen })); }}>
          <ChevronDown className="csb-sg-chev" size={18} strokeWidth={1.6} aria-hidden="true" />
          <span className="csb-sg-name"><strong>{g.name}</strong><small>{plural(g.items.length, noun)}</small></span>
          {!isOpen && <span className="csb-sg-thumbs" aria-hidden="true">
            {g.items.slice(0, 5).map(({ it, i }) => <i key={i} style={it.image ? { backgroundImage: `url("${it.image}")` } : undefined} />)}
            {g.items.length > 5 && <em>+{g.items.length - 5}</em>}
          </span>}
        </button>
        <AnimatePresence initial={false}>
          {isOpen && <motion.div key="body" className="csb-sg-body" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} transition={{ duration: .4, ease: [0.22, 1, 0.36, 1] }}>
            <div className="csb-sg-grid">
              {g.items.map(({ it, i }, k) => <figure key={i} className="csb-sg-card">
                <div className="csb-sg-shot" data-image-slot={editorMode ? `${section.id}:${i}` : undefined} onClick={editorMode ? undefined : () => setBox({ g: gi, k })}>
                  {it.image ? <img src={it.image} alt={it.title} loading="lazy" draggable={false} /> : <span className="csb-sg-empty">{editorMode ? 'Click to add a screen' : ''}</span>}
                  {it.tag && <b className="csb-sg-tag">{it.tag}</b>}
                  {it.image && <button type="button" className="csb-sg-expand" aria-label={`View ${it.title} full size`} data-no-slot onClick={e => { e.stopPropagation(); setBox({ g: gi, k }); }}><Maximize2 size={14} strokeWidth={1.8} /></button>}
                </div>
                <figcaption><strong><EditableText field={`items.${i}.title`} value={it.title} /></strong><span><EditableText field={`items.${i}.detail`} value={it.detail} /></span></figcaption>
              </figure>)}
            </div>
          </motion.div>}
        </AnimatePresence>
      </div>; })}
    {box && <Lightbox group={groups[box.g]} at={box.k} onMove={k => setBox({ g: box.g, k })} onClose={() => setBox(null)} />}
  </div>;
}

function Lightbox({ group, at, onMove, onClose }: { group: Group; at: number; onMove: (k: number) => void; onClose: () => void }) {
  const n = group.items.length; const { it } = group.items[at];
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight' && at < n - 1) onMove(at + 1); if (e.key === 'ArrowLeft' && at > 0) onMove(at - 1); };
    window.addEventListener('keydown', key); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [at, n]);
  return createPortal(<motion.div className="csb-sg-lb" role="dialog" aria-modal="true" aria-label={it.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
    <motion.div className="csb-sg-lb-panel" initial={{ opacity: 0, y: 16, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }} onClick={e => e.stopPropagation()}>
      <header>
        <div className="csb-sg-lb-title">{it.tag && <b>{it.tag}</b>}<h3>{it.title}</h3><small>{group.name} · {at + 1} of {n}</small></div>
        <div className="csb-sg-lb-nav">
          <button type="button" aria-label="Previous screen" disabled={at === 0} onClick={() => onMove(at - 1)}><ChevronLeft size={18} /></button>
          <button type="button" aria-label="Next screen" disabled={at === n - 1} onClick={() => onMove(at + 1)}><ChevronRight size={18} /></button>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {it.detail && <p>{it.detail}</p>}
      </header>
      <div className="csb-sg-lb-img">{it.image ? <img key={it.image} src={it.image} alt={it.title} /> : <span className="csb-sg-empty">No image yet</span>}</div>
    </motion.div>
  </motion.div>, document.body);
}

/* Right panel: pages and their screens. Words are edited on the page; pages, badges and order here. */
export function ScreenGroupsControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const items = section.items; const groups = groupsOf(items); const o = section.options ?? {};
  const set = (i: number, patch: Partial<Item>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  const rename = (from: string, to: string) => onChange({ items: items.map(it => (it.group || 'Screens').trim() === from ? { ...it, group: to } : it) });
  const addTo = (name: string) => { const last = Math.max(...items.map((it, k) => (it.group || 'Screens').trim() === name ? k : -1)); const next = [...items]; next.splice(last + 1, 0, { title: 'New screen', detail: 'What this screen shows.', group: name, tag: '', image: '' }); onChange({ items: next }); };
  return <div className="csb-tsc">
    <div className="csb-sb-row">
      <span className="csb-sb-label">Open when the page loads</span>
      <div className="csb-sb-chips" role="radiogroup" aria-label="Open when the page loads">
        {([['first', 'First page'], ['all', 'All'], ['none', 'None']] as const).map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={String(o.open ?? 'first') === v} aria-pressed={String(o.open ?? 'first') === v} onClick={() => onChange({ options: { ...o, open: v } })}>{l}</button>)}
      </div>
    </div>
    <label className="csb-tsc-field"><span>Call them</span><input value={String(o.noun || 'screen')} onChange={e => onChange({ options: { ...o, noun: e.target.value } })} placeholder="screen, wireframe, mockup…" /></label>
    {groups.map(g => <div key={g.name} className="csb-tsc-card">
      <div className="csb-tsc-top"><input className="csb-tsc-name" defaultValue={g.name} aria-label="Page name" onBlur={e => { const v = e.target.value.trim(); if (v && v !== g.name) rename(g.name, v); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></div>
      {g.items.map(({ it, i }) => <div key={i} className="csb-sg-ctl-row">
        <span className="csb-sg-ctl-thumb" style={it.image ? { backgroundImage: `url("${it.image}")` } : undefined} />
        <input value={it.title} aria-label="Screen name" onChange={e => set(i, { title: e.target.value })} />
        <select aria-label="Page" value={(it.group || 'Screens').trim()} onChange={e => set(i, { group: e.target.value })}>{groups.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select>
        <input className="is-tag" value={it.tag ?? ''} placeholder="V1" aria-label="Version badge" onChange={e => set(i, { tag: e.target.value })} />
        <button type="button" className="csb-tsc-del" aria-label={`Remove ${it.title}`} onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
      </div>)}
      <button type="button" className="csb-ps-pick" onClick={() => addTo(g.name)}><Plus size={12} /> Add a screen</button>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'New screen', detail: 'What this screen shows.', group: `Page ${groups.length + 1}`, tag: '', image: '' }] })}><Plus size={13} /> Add a page</button>
    <p className="csb-field-note">Click a screen on the page to paste a Figma frame or image. Move a screen to another page with its page menu.</p>
  </div>;
}
