import { useContext, useState } from 'react';
import { motion } from 'motion/react';
import { EditableText, EditingContext } from './EditableText';
import { useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  AEIOU observation board.
  items 0–4: the five categories (title name · value short prompt · detail what you noticed)
  items 5+ : artifacts you observed
      note  — a sticky note: detail text, cat = one letter
      photo — image + caption (title), cat = main letter, pins = coded spots on the photo
  Hover (or tap) a letter to see only that category's artifacts and pins.
*/

export type AEIOUCat = 'a' | 'e' | 'i' | 'o' | 'u';
export const AEIOU_CATS: Array<{ key: AEIOUCat; name: string; prompt: string; color: string }> = [
  { key: 'a', name: 'Activities', prompt: 'Goal-directed actions. What pathways do people take to get things done?', color: '#c4613f' },
  { key: 'e', name: 'Environments', prompt: 'The whole arena: atmosphere, function, individual and shared spaces.', color: '#3e7a58' },
  { key: 'i', name: 'Interactions', prompt: 'Between people, and between people and things. Routine or special?', color: '#3c5fbf' },
  { key: 'o', name: 'Objects', prompt: 'The building blocks of the space, sometimes put to unintended uses.', color: '#b3871f' },
  { key: 'u', name: 'Users', prompt: 'Who is present? Their roles, relationships, values and biases.', color: '#83559f' },
];
const catOf = (key?: string) => AEIOU_CATS.find(c => c.key === key);
type Item = CaseStudySection['items'][number];
export const isPhoto = (item: Item) => item.blockType === 'photo' || !!item.image;
const hasCat = (item: Item, cat: AEIOUCat) => item.cat === cat || (item.pins ?? []).some(p => p.cat === cat);

function Chip({ cat }: { cat: AEIOUCat }) {
  const c = catOf(cat)!;
  return <span className="csb-ae-chip" style={{ '--ae': c.color } as React.CSSProperties}><b>{cat.toUpperCase()}</b>{c.name}</span>;
}

function Photo({ section, item, index, active, placing, setPlacing }: { section: CaseStudySection; item: Item; index: number; active: AEIOUCat | null; placing: { index: number; cat: AEIOUCat } | null; setPlacing: (p: { index: number; cat: AEIOUCat } | null) => void }) {
  const { edit } = useContext(EditingContext);
  const [hover, setHover] = useState<number | null>(null);
  const pins = item.pins ?? [];
  const savePins = (next: NonNullable<Item['pins']>) => edit?.('json:items', JSON.stringify(section.items.map((it, i) => i === index ? { ...it, pins: next } : it)));
  const place = (event: React.MouseEvent) => {
    if (!placing || placing.index !== index) return;
    event.stopPropagation();
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    savePins([...pins, { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height, cat: placing.cat, note: `${catOf(placing.cat)!.name} note` }]);
    setPlacing(null);
  };
  const cats = Array.from(new Set([item.cat, ...pins.map(p => p.cat)].filter(Boolean))) as AEIOUCat[];
  return <>
    <div className="csb-ae-photo" data-image-slot={`${section.id}:${index}`}>
      {item.image ? <img src={item.image} alt={item.title || 'Observation photo'} draggable={false} /> : <div className="csb-ae-photo-empty"><strong>Add an observation photo</strong><span>Drop a photo, then pin what you noticed</span></div>}
      {placing?.index === index && <div className="csb-ae-placing" data-no-slot onClick={place}><span>Click where the {catOf(placing.cat)!.name.toLowerCase()} note goes</span></div>}
      {pins.map((pin, k) => { const c = catOf(pin.cat)!; const on = !active || active === pin.cat; return <span key={k} data-no-slot className={`csb-ae-pin ${on ? '' : 'is-off'} ${hover === k ? 'is-open' : ''}`} style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, '--ae': c.color } as React.CSSProperties}
        onPointerEnter={() => setHover(k)} onPointerLeave={() => setHover(null)} onClick={e => { e.stopPropagation(); setHover(hover === k ? null : k); }}>
        <b>{pin.cat.toUpperCase()}</b>
        <span className="csb-ae-tip" role="tooltip">{edit ? <EditableText field={`deep:items.${index}.pins.${k}.note`} value={pin.note} /> : pin.note}</span>
      </span>; })}
    </div>
    {edit && <div className="csb-ae-pinbar" data-no-slot onClick={e => e.stopPropagation()}>
      <span>Pin a note</span>
      {AEIOU_CATS.map(c => <button key={c.key} type="button" style={{ '--ae': c.color } as React.CSSProperties} aria-pressed={placing?.index === index && placing.cat === c.key} aria-label={`Pin a ${c.name} note on this photo`} onClick={() => setPlacing(placing?.index === index && placing.cat === c.key ? null : { index, cat: c.key })}>{c.key.toUpperCase()}</button>)}
    </div>}
    {(item.title || edit) && <p className="csb-ae-caption"><EditableText field={`items.${index}.title`} value={item.title} /></p>}
    {cats.length > 0 && <div className="csb-ae-chips">{cats.map(c => <Chip key={c} cat={c} />)}</div>}
  </>;
}

export function AEIOUBoard({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const { edit } = useContext(EditingContext);
  const [hovered, setHovered] = useState<AEIOUCat | null>(null);
  const [locked, setLocked] = useState<AEIOUCat | null>(null);
  const [placing, setPlacing] = useState<{ index: number; cat: AEIOUCat } | null>(null);
  const active = hovered ?? locked;
  const categories = section.items.slice(0, 5);
  const artifacts = section.items.slice(5).map((item, k) => ({ item, index: k + 5 })).filter(({ item }) => !item.hidden);
  const count = (cat: AEIOUCat) => artifacts.filter(({ item }) => hasCat(item, cat)).length;
  const activeCat = active ? catOf(active)! : null;
  const activeIndex = active ? AEIOU_CATS.findIndex(c => c.key === active) : -1;

  return <div className={`csb-ae ${active ? 'is-filtering' : ''}`} style={activeCat ? { '--ae': activeCat.color } as React.CSSProperties : undefined}>
    <div className="csb-ae-legend" role="group" aria-label="Filter observations by category" onPointerLeave={() => setHovered(null)}>
      {AEIOU_CATS.map((c, i) => <motion.button key={c.key} type="button" className={`csb-ae-key ${active === c.key ? 'is-on' : ''}`} style={{ '--ae': c.color } as React.CSSProperties} aria-pressed={locked === c.key}
        onPointerEnter={() => setHovered(c.key)} onFocus={() => setHovered(c.key)} onBlur={() => setHovered(null)} onClick={e => { e.stopPropagation(); setLocked(locked === c.key ? null : c.key); }}
        initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .4 }} transition={{ duration: .6, delay: i * .08, ease: [0.22, 1, 0.36, 1] }}>
        <span className="csb-ae-letter">{c.key.toUpperCase()}</span>
        <span className="csb-ae-key-name">{categories[i]?.title || c.name}</span>
        <span className="csb-ae-count">{count(c.key)}</span>
      </motion.button>)}
    </div>
    <div className="csb-ae-focus" aria-live="polite">
      {activeCat && activeIndex >= 0
        ? <motion.div key={active} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
            <small>{activeCat.key.toUpperCase()} · <EditableText field={`items.${activeIndex}.value`} value={categories[activeIndex]?.value ?? activeCat.prompt} /></small>
            <p><EditableText field={`items.${activeIndex}.detail`} value={categories[activeIndex]?.detail || ''} /></p>
          </motion.div>
        : <p className="csb-ae-hint">{edit ? 'Hover a letter to see its observations. Click to keep it selected and edit what you noticed.' : 'Hover a letter to see just those observations.'}</p>}
    </div>
    <div className="csb-ae-board">
      {artifacts.map(({ item, index }, k) => {
        const on = !active || hasCat(item, active);
        const c = catOf(item.cat);
        return <motion.figure key={index} className={`csb-ae-card ${isPhoto(item) ? 'is-photo' : 'is-note'} ${on ? '' : 'is-off'}`} style={c ? { '--ae': c.color } as React.CSSProperties : undefined}
          initial={reduce ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .6, delay: Math.min(k, 8) * .06, ease: [0.22, 1, 0.36, 1] }}>
          {isPhoto(item)
            ? <Photo section={section} item={item} index={index} active={active} placing={placing} setPlacing={setPlacing} />
            : <>
                {c && <span className="csb-ae-note-cat"><b>{c.key.toUpperCase()}</b>{categories[AEIOU_CATS.indexOf(c)]?.title || c.name}</span>}
                <p className="csb-ae-note"><EditableText field={`items.${index}.detail`} value={item.detail} /></p>
                {(item.title || edit) && <small className="csb-ae-source"><EditableText field={`items.${index}.title`} value={item.title} /></small>}
              </>}
        </motion.figure>;
      })}
    </div>
  </div>;
}

/* ---------- Inspector ---------- */
export function AEIOUControls({ section, onItems }: { section: CaseStudySection; onItems: (items: CaseStudySection['items']) => void }) {
  const items = section.items;
  const set = (i: number, patch: Partial<Item>) => onItems(items.map((it, k) => k === i ? { ...it, ...patch } : it));
  const move = (i: number, d: number) => { const j = i + d; if (j < 5 || j >= items.length) return; const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; onItems(next); };
  return <>
    <div className="csb-inspector-actions">
      <button type="button" className="csb-quiet-button" onClick={() => onItems([...items, { title: 'Where or when you saw it', detail: 'What you observed, in one or two lines.', cat: 'a', blockType: 'text' }])}>+ Sticky note</button>
      <button type="button" className="csb-quiet-button" onClick={() => onItems([...items, { title: 'Photo caption', detail: '', image: '', cat: 'e', blockType: 'photo', pins: [] }])}>+ Photo</button>
    </div>
    <p className="csb-field-note">Click a photo on the page to upload it, then use its A E I O U buttons to pin notes onto it.</p>
    {items.slice(5).map((item, k) => { const i = k + 5; return <div key={i} className="csb-ae-ctl">
      <div className="csb-ae-ctl-head"><strong>{isPhoto(item) ? 'Photo' : 'Note'} {k + 1}</strong>
        <span><button type="button" aria-label="Move up" disabled={i === 5} onClick={() => move(i, -1)}>↑</button><button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button><button type="button" aria-label={`Remove ${isPhoto(item) ? 'photo' : 'note'} ${k + 1}`} onClick={() => onItems(items.filter((_, n) => n !== i))}>×</button></span></div>
      <div className="csb-segment csb-ae-seg" role="group" aria-label={`Category for item ${k + 1}`}>{AEIOU_CATS.map(c => <button key={c.key} type="button" aria-pressed={item.cat === c.key} title={c.name} style={{ '--ae': c.color } as React.CSSProperties} onClick={() => set(i, { cat: c.key })}>{c.key.toUpperCase()}</button>)}</div>
      {(item.pins ?? []).map((pin, p) => <div key={p} className="csb-ae-ctl-pin"><b style={{ background: catOf(pin.cat)?.color }}>{pin.cat.toUpperCase()}</b><input aria-label={`Pin ${p + 1} note`} value={pin.note} onChange={e => set(i, { pins: item.pins!.map((pp, n) => n === p ? { ...pp, note: e.target.value } : pp) })} /><button type="button" aria-label={`Remove pin ${p + 1}`} onClick={() => set(i, { pins: item.pins!.filter((_, n) => n !== p) })}>×</button></div>)}
    </div>; })}
  </>;
}
