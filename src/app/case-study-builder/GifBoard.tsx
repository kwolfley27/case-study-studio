import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, ImagePlus, Trash2, X } from 'lucide-react';
import { EditableText } from './EditableText';
import { Media, isVideo } from './Media';
import { useReducedMotion } from './MotionKit';
import { compressIntoDraft } from './ImageSlots';
import { NumberPick } from './LayoutControls';
import type { CaseStudySection } from './model';

/*
  GIF gallery: a loose wall of GIFs (or short videos and stills) — inspiration, motion studies,
  micro-interactions you love. Masonry by default, so every GIF keeps its own shape.
  items: image (GIF / video / image), title = optional caption, detail = optional credit (a name or a link).
  options.layout = 'masonry' | 'grid' | 'row';  options.cols = 2–5;  options.captions = false hides captions.
  With reduced motion, GIFs show their first frame until hovered or focused.
*/
type Item = CaseStudySection['items'][number];

function Still({ src, alt }: { src: string; alt: string }) {
  // First frame of a GIF, for visitors who asked for less motion.
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const img = new Image(); img.onload = () => { const c = ref.current; if (!c) return; c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')?.drawImage(img, 0, 0); }; img.src = src; }, [src]);
  return <canvas ref={ref} role="img" aria-label={alt} />;
}

function Tile({ it, reduce }: { it: Item; reduce: boolean }) {
  const [play, setPlay] = useState(false);
  const gif = /^data:image\/gif|\.gif(\?|#|$)/i.test(it.image ?? '');
  if (!it.image) return null;
  if (reduce && gif && !play) return <span className="csb-gb-still" onMouseEnter={() => setPlay(true)} onFocus={() => setPlay(true)}><Still src={it.image} alt={it.title || 'GIF'} /><i aria-hidden="true">GIF</i></span>;
  return <Media src={it.image} alt={it.title || 'GIF'} loading="lazy" draggable={false} />;
}

function Lightbox({ items, at, onMove, onClose }: { items: Item[]; at: number; onMove: (k: number) => void; onClose: () => void }) {
  const it = items[at];
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') onMove((at + 1) % items.length); if (e.key === 'ArrowLeft') onMove((at - 1 + items.length) % items.length); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [at, items.length]);
  return createPortal(<motion.div className="csb-gb-lb" role="dialog" aria-label={it.title || 'GIF'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <button type="button" className="csb-gb-lb-x" aria-label="Close" onClick={onClose}><X size={16} /></button>
    {items.length > 1 && <button type="button" className="csb-gb-lb-nav is-prev" aria-label="Previous" onClick={e => { e.stopPropagation(); onMove((at - 1 + items.length) % items.length); }}><ChevronLeft size={18} /></button>}
    <motion.figure key={at} initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }} onClick={e => e.stopPropagation()}>
      <Media src={it.image!} alt={it.title || 'GIF'} />
      {(it.title || it.detail) && <figcaption>{it.title}{it.detail && <small>{/^https?:\/\//.test(it.detail) ? <a href={it.detail} target="_blank" rel="noopener">{new URL(it.detail).hostname.replace(/^www\./, '')}</a> : it.detail}</small>}</figcaption>}
    </motion.figure>
    {items.length > 1 && <button type="button" className="csb-gb-lb-nav is-next" aria-label="Next" onClick={e => { e.stopPropagation(); onMove((at + 1) % items.length); }}><ChevronRight size={18} /></button>}
  </motion.div>, document.body);
}

export function GifBoard({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion();
  const o = section.options ?? {};
  const layout = String(o.layout ?? 'masonry'); const cols = Math.max(2, Math.min(5, Number(o.cols ?? 3)));
  const captions = o.captions !== false;
  const [open, setOpen] = useState<number | null>(null);
  const items = section.items.map((it, i) => ({ it, i }));
  const shown = items.filter(x => x.it.image || editorMode);
  const withImg = section.items.filter(it => it.image);
  return <div className={`csb-gb is-${layout} ${o.corners === 'square' ? 'is-square' : ''}`} style={{ ['--gb-cols' as string]: cols }}>
    {shown.map(({ it, i }, k) => <motion.figure key={i} className="csb-gb-tile"
      initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .6, delay: (k % cols) * .06, ease: [0.22, 1, 0.36, 1] }}>
      <div className="csb-gb-media" data-image-slot={editorMode ? `${section.id}:${i}` : undefined}
        role={!editorMode && it.image ? 'button' : undefined} tabIndex={!editorMode && it.image ? 0 : undefined} aria-label={!editorMode && it.image ? `Open ${it.title || 'GIF'}` : undefined}
        onClick={() => { if (!editorMode && it.image) setOpen(withImg.indexOf(it)); }} onKeyDown={e => { if (!editorMode && it.image && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(withImg.indexOf(it)); } }}>
        {it.image ? <Tile it={it} reduce={reduce} /> : <span className="csb-gb-empty">Click to add a GIF</span>}
      </div>
      {captions && (it.title || editorMode) && <figcaption><EditableText field={`items.${i}.title`} value={it.title} />{(it.detail || editorMode) && <small><EditableText field={`items.${i}.detail`} value={it.detail} /></small>}</figcaption>}
    </motion.figure>)}
    {!shown.length && <p className="csb-gb-none">Add GIFs in the panel on the right.</p>}
    <AnimatePresence>{open !== null && withImg[open] && <Lightbox items={withImg} at={open} onMove={setOpen} onClose={() => setOpen(null)} />}</AnimatePresence>
  </div>;
}

export function GifBoardControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const o = section.options ?? {}; const items = section.items;
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: string, v: unknown) => onChange({ options: { ...o, [k]: v } });
  const addFiles = async (files: File[]) => {
    const ok = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')); if (!ok.length) return;
    setErr(''); const added: Item[] = []; const fails: string[] = [];
    for (const [n, f] of ok.entries()) {
      setBusy(`Adding ${n + 1} of ${ok.length}…`);
      try {
        const url = f.type.startsWith('video/')
          ? (f.size > 40_000_000 ? Promise.reject(new Error(`${f.name} is over 40 MB.`)) : new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Couldn’t read it.')); r.readAsDataURL(f); }))
          : compressIntoDraft(f, 1_600_000, 1600);
        added.push({ title: '', detail: '', image: await url });
      } catch (e) { fails.push(e instanceof Error ? e.message : f.name); }
    }
    // Fill empty spots first, then add the rest at the end.
    const next = [...items]; let a = 0;
    for (let k = 0; k < next.length && a < added.length; k++) if (!next[k].image) next[k] = { ...next[k], image: added[a++].image };
    onChange({ items: [...next, ...added.slice(a)] });
    setBusy(''); if (fails.length) setErr(fails.join(' '));
  };
  const chips = (key: string, label: string, opts: Array<[string, string]>, def: string) => <div className="csb-sb-row"><span className="csb-sb-label">{label}</span>
    <div className="csb-sb-chips" role="radiogroup" aria-label={label}>{opts.map(([v, l]) => { const on = String(o[key] ?? def) === v; return <button key={v} type="button" role="radio" aria-checked={on} aria-pressed={on} onClick={() => set(key, v)}>{l}</button>; })}</div></div>;
  return <div className="csb-tsc">
    <div className={`csb-gb-drop ${over ? 'is-over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]); }}>
      <ImagePlus size={18} strokeWidth={1.6} />
      <span><b>{busy || 'Drop GIFs here'}</b><small>Or choose several at once. GIFs up to 12 MB keep moving; MP4s are lighter.</small></span>
      <button type="button" className="csb-ps-pick" disabled={!!busy} onClick={() => input.current?.click()}>Choose files</button>
      <input ref={input} type="file" multiple accept="image/gif,image/*,video/mp4,video/webm" hidden onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void addFiles(f); }} />
    </div>
    {err && <p className="csb-field-note" style={{ color: '#b42318' }}>{err}</p>}
    {chips('layout', 'Layout', [['masonry', 'Masonry'], ['grid', 'Even grid'], ['row', 'One row']], 'masonry')}
    {String(o.layout ?? 'masonry') !== 'row' && <NumberPick label="Columns" value={Number(o.cols ?? 3)} min={2} max={5} onChange={n => set('cols', n)} />}
    {chips('corners', 'Corners', [['round', 'Rounded'], ['square', 'Square']], 'round')}
    <label className="csb-sb-switch"><span><b>Captions</b><small>A short line under each GIF, and a credit (a name or a link).</small></span><input type="checkbox" role="switch" checked={o.captions !== false} onChange={e => set('captions', e.target.checked)} /><i aria-hidden="true" /></label>
    {items.length > 0 && <div className="csb-sb-row"><span className="csb-sb-label">GIFs</span>
      <div className="csb-gb-thumbs">{items.map((it, i) => <div key={i} className="csb-gb-thumb">
        {it.image ? (isVideo(it.image) ? <video src={it.image} muted /> : <img src={it.image} alt="" />) : <span />}
        <button type="button" aria-label={`Remove GIF ${i + 1}`} onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Trash2 size={12} /></button>
      </div>)}</div></div>}
    <p className="csb-field-note">Click a GIF on the page to replace it, and click its caption to write one. Visitors can click any GIF to see it large.</p>
  </div>;
}
