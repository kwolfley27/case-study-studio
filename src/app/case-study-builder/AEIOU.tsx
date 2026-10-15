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
type Item = CaseStudySection['items'][number];
export const isPhoto = (item: Item) => item.blockType === 'photo' || !!item.image;
const hasCat = (item: Item, cat: AEIOUCat) => item.cat === cat || (item.pins ?? []).some(p => p.cat === cat);

type Row = { key: string; text: string; source?: string; field: string; sourceField?: string; photo?: number; pin?: number; num?: number };

export function AEIOUBoard({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const { edit } = useContext(EditingContext);
  const [lens, setLens] = useState<AEIOUCat>('a');
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const categories = section.items.slice(0, 5);
  const artifacts = section.items.map((item, index) => ({ item, index })).slice(5).filter(({ item }) => !item.hidden);
  const photos = artifacts.filter(({ item }) => isPhoto(item));
  const lensPhotos = photos.filter(({ item }) => hasCat(item, lens));
  const [photoPick, setPhotoPick] = useState<number | null>(null);
  const current = photos.find(p => p.index === photoPick) ?? lensPhotos[0] ?? photos[0];

  // Everything observed under this lens: notes, photo captions and pins (pins numbered per photo).
  const rows: Row[] = [];
  for (const { item, index } of artifacts) {
    if (isPhoto(item)) {
      let n = 0;
      (item.pins ?? []).forEach((pin, k) => { if (pin.cat !== lens) return; n++; rows.push({ key: `${index}-${k}`, text: pin.note, source: item.title, field: `deep:items.${index}.pins.${k}.note`, photo: index, pin: k, num: index === current?.index ? n : undefined }); });
    } else if (item.cat === lens) rows.push({ key: `${index}`, text: item.detail, source: item.title, field: `items.${index}.detail`, sourceField: `items.${index}.title` });
  }
  const count = (cat: AEIOUCat) => artifacts.reduce((sum, { item }) => sum + (isPhoto(item) ? (item.pins ?? []).filter(p => p.cat === cat).length : item.cat === cat ? 1 : 0), 0);
  const ci = AEIOU_CATS.findIndex(c => c.key === lens);
  const pinNumbers = new Map<number, number>(); { let n = 0; (current?.item.pins ?? []).forEach((pin, k) => { if (pin.cat === lens) pinNumbers.set(k, ++n); }); }
  const savePins = (index: number, next: NonNullable<Item['pins']>) => edit?.('json:items', JSON.stringify(section.items.map((it, i) => i === index ? { ...it, pins: next } : it)));
  const place = (event: React.MouseEvent) => {
    if (!placing || !current) return; event.stopPropagation();
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    savePins(current.index, [...(current.item.pins ?? []), { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height, cat: lens, note: 'What you noticed here' }]);
    setPlacing(false);
  };

  return <div className="csb-ae">
    <ol className="csb-ae-lenses">
      {AEIOU_CATS.map((c, i) => { const on = c.key === lens; return <li key={c.key} className={on ? 'is-on' : ''}>
        <button type="button" aria-expanded={on} onClick={e => { e.stopPropagation(); setLens(c.key); setPhotoPick(null); setPlacing(false); }}>
          <span className="csb-ae-letter">{c.key.toUpperCase()}</span><span className="csb-ae-name">{categories[i]?.title || c.name}</span><span className="csb-ae-count">{count(c.key)}</span>
        </button>
        {on && <motion.div className="csb-ae-detail" initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}>
          {edit && <p className="csb-ae-q" title="Only you see this prompt; it's hidden on the published page">{categories[i]?.value ?? c.prompt}</p>}
          <p className="csb-ae-insight"><EditableText field={`items.${i}.detail`} value={categories[i]?.detail || ''} /></p>
        </motion.div>}
      </li>; })}
    </ol>

    <div className="csb-ae-evidence">
      {current && <figure className="csb-ae-figure">
        <div className="csb-ae-photo" data-image-slot={`${section.id}:${current.index}`}>
          {current.item.image ? <img src={current.item.image} alt={current.item.title || 'Observation photo'} draggable={false} /> : <div className="csb-ae-photo-empty"><strong>Add an observation photo</strong><span>Then pin what you noticed under each lens</span></div>}
          {placing && <div className="csb-ae-placing" data-no-slot onClick={place}><span>Click to pin a {AEIOU_CATS[ci].name.toLowerCase()} note</span></div>}
          {(current.item.pins ?? []).map((pin, k) => pinNumbers.has(k) && <motion.span key={`${lens}-${k}`} data-no-slot className={`csb-ae-dot ${hoverRow === `${current.index}-${k}` ? 'is-hot' : ''}`} style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            initial={reduce ? false : { scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 24, delay: (pinNumbers.get(k)! - 1) * .06 }}
            onPointerEnter={() => setHoverRow(`${current.index}-${k}`)} onPointerLeave={() => setHoverRow(null)} onClick={e => e.stopPropagation()}>{pinNumbers.get(k)}</motion.span>)}
        </div>
        <figcaption>
          <span><EditableText field={`items.${current.index}.title`} value={current.item.title} /></span>
          {edit && current.item.image && <button type="button" data-no-slot className="csb-ae-addpin" aria-pressed={placing} onClick={e => { e.stopPropagation(); setPlacing(!placing); }}>{placing ? 'Cancel' : `+ Pin a ${AEIOU_CATS[ci].name.toLowerCase()} note`}</button>}
        </figcaption>
        {photos.length > 1 && <div className="csb-ae-thumbs" role="group" aria-label="Observation photos">{photos.map(ph => <button key={ph.index} type="button" aria-pressed={ph.index === current.index} aria-label={ph.item.title || 'Photo'} onClick={e => { e.stopPropagation(); setPhotoPick(ph.index); }}>{ph.item.image ? <img src={ph.item.image} alt="" /> : <span />}</button>)}</div>}
      </figure>}

      <ul className="csb-ae-list" aria-label={`${AEIOU_CATS[ci].name} observations`}>
        {rows.length ? rows.map((row, k) => <motion.li key={`${lens}-${row.key}`} className={hoverRow === row.key ? 'is-hot' : ''} onPointerEnter={() => setHoverRow(row.key)} onPointerLeave={() => setHoverRow(null)}
          onClick={() => { if (row.photo !== undefined && row.photo !== current?.index) setPhotoPick(row.photo); }}
          initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, delay: k * .04 }}>
          <span className="csb-ae-mark">{row.num ?? (row.photo !== undefined ? '◦' : '–')}</span>
          <span className="csb-ae-text"><EditableText field={row.field} value={row.text} />{(row.source || edit) && row.sourceField ? <small><EditableText field={row.sourceField} value={row.source || ''} /></small> : row.source ? <small>{row.source}</small> : null}</span>
        </motion.li>) : <li className="csb-ae-none">No {AEIOU_CATS[ci].name.toLowerCase()} observations yet.</li>}
      </ul>
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
      <div className="csb-segment csb-ae-seg" role="group" aria-label={`Category for item ${k + 1}`}>{AEIOU_CATS.map(c => <button key={c.key} type="button" aria-pressed={item.cat === c.key} title={c.name} onClick={() => set(i, { cat: c.key })}>{c.key.toUpperCase()}</button>)}</div>
      {(item.pins ?? []).map((pin, p) => <div key={p} className="csb-ae-ctl-pin"><b>{pin.cat.toUpperCase()}</b><input aria-label={`Pin ${p + 1} note`} value={pin.note} onChange={e => set(i, { pins: item.pins!.map((pp, n) => n === p ? { ...pp, note: e.target.value } : pp) })} /><button type="button" aria-label={`Remove pin ${p + 1}`} onClick={() => set(i, { pins: item.pins!.filter((_, n) => n !== p) })}>×</button></div>)}
    </div>; })}
  </>;
}
