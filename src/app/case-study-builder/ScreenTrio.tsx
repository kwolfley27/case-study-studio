import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { Media } from './Media';
import { useReducedMotion, useScrollProgress } from './MotionKit';
import { ColorDots } from './ColorDots';
import { NumberPick } from './LayoutControls';
import type { CaseStudySection } from './model';

/*
  Focus row: three (or five) screens that start spread wide and a little large, then glide together
  as the section scrolls into view. The middle one is in focus; the ones beside it sit back, faded.
  On the page, clicking a side screen slides it into the middle.
  items: image, title, detail (caption for the focused screen).
  options.shape = 'phone' | 'tablet' | 'web';  options.sides = 'faded' | 'full';  options.bg = 'stone' | 'white' | 'dark' | '#hex';
  options.focus = index in focus at the start;  options.caption = false hides the caption.
*/
const RATIO: Record<string, string> = { phone: '375 / 812', tablet: '4 / 3', web: '16 / 10' };
const STEP: Record<string, number> = { phone: 114, tablet: 106, web: 105 }; // distance between screens, in % of a screen's width

function Card({ i, it, p, f, shape, sides, reduce, editorMode, sectionId, onPick }: {
  i: number; it: CaseStudySection['items'][number]; p: MotionValue<number>; f: MotionValue<number>;
  shape: string; sides: string; reduce: boolean; editorMode?: boolean; sectionId: string; onPick: (i: number) => void;
}) {
  const step = STEP[shape] ?? 118;
  // spread: 1 while the section is still coming in, 0 once it has arrived.
  const x = useTransform([p, f] as MotionValue<number>[], ([pp, ff]: number[]) => { const spread = reduce ? 0 : 1 - pp; const d = i - ff; return `${d * (step + spread * 70)}%`; });
  const scale = useTransform([p, f] as MotionValue<number>[], ([pp, ff]: number[]) => { const spread = reduce ? 0 : 1 - pp; const d = Math.min(1, Math.abs(i - ff)); return (1 + spread * .12) * (1 - d * .06); });
  const opacity = useTransform(f, ff => { const d = Math.abs(i - ff); if (d > 2.4) return 0; return sides === 'full' ? 1 : 1 - Math.min(1, d) * .55; });
  const z = useTransform(f, ff => 10 - Math.round(Math.abs(i - ff) * 2));
  return <motion.div className="csb-trio-card" style={{ x, scale, opacity, zIndex: z, aspectRatio: RATIO[shape] ?? RATIO.phone }}
    data-image-slot={editorMode ? `${sectionId}:${i}` : undefined}
    onClick={() => { if (!editorMode) onPick(i); }} role={!editorMode ? 'button' : undefined} tabIndex={!editorMode ? 0 : undefined}
    aria-label={!editorMode ? `Show ${it.title || `screen ${i + 1}`}` : undefined}
    onKeyDown={e => { if (!editorMode && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(i); } }}>
    {it.image ? <Media src={it.image} alt={it.title || ''} draggable={false} /> : <span className="csb-trio-empty">{editorMode ? 'Click to add a screen' : ''}</span>}
  </motion.div>;
}

export function ScreenTrio({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const p = useScrollProgress(ref, .98, 1); // settled once the whole row is on screen
  const o = section.options ?? {};
  const items = section.items;
  const start = Math.max(0, Math.min(items.length - 1, Number(o.focus ?? Math.floor((items.length - 1) / 2))));
  const [focus, setFocus] = useState(start);
  useEffect(() => { setFocus(start); }, [start, items.length]);
  const f = useSpring(start, { stiffness: 170, damping: 26 });
  useEffect(() => { f.set(focus); }, [focus]);
  const shape = String(o.shape ?? 'phone'); const sides = String(o.sides ?? 'faded');
  const custom = /^#/.test(String(o.bg ?? '')) ? String(o.bg) : '';
  const cur = items[focus];
  const showCap = o.caption !== false && !!(cur?.title || cur?.detail);
  return <div ref={ref} className={`csb-trio is-${shape} is-${custom ? 'custom' : String(o.bg ?? 'stone')}`} style={custom ? { background: custom } : undefined}>
    <div className="csb-trio-row">
      {items.map((it, i) => <Card key={i} i={i} it={it} p={p} f={f} shape={shape} sides={sides} reduce={reduce} editorMode={editorMode} sectionId={section.id} onPick={setFocus} />)}
    </div>
    {o.caption !== false && <div className="csb-trio-cap" aria-live="polite">
      <AnimatePresence mode="wait">{showCap && <motion.div key={focus} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .3 }}>
        {cur.title && <strong>{cur.title}</strong>}{cur.detail && <span>{cur.detail}</span>}
      </motion.div>}</AnimatePresence>
    </div>}
    {!editorMode && items.length > 1 && <div className="csb-trio-dots" role="tablist" aria-label="Screens">
      {items.map((it, i) => <button key={i} type="button" role="tab" aria-selected={i === focus} aria-label={it.title || `Screen ${i + 1}`} onClick={() => setFocus(i)} />)}
    </div>}
  </div>;
}

export function ScreenTrioControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const o = section.options ?? {};
  const set = (k: string, v: unknown) => onChange({ options: { ...o, [k]: v } });
  const n = section.items.length;
  const chips = (key: string, label: string, opts: Array<[string, string]>, def: string) => <div className="csb-sb-row"><span className="csb-sb-label">{label}</span>
    <div className="csb-sb-chips" role="radiogroup" aria-label={label}>{opts.map(([v, l]) => { const on = String(o[key] ?? def) === v; return <button key={v} type="button" role="radio" aria-checked={on} aria-pressed={on} onClick={() => set(key, v)}>{l}</button>; })}</div></div>;
  return <div className="csb-tsc">
    <NumberPick label="How many screens" value={n} min={2} max={7} onChange={k => { const items = [...section.items]; while (items.length < k) items.push({ title: '', detail: '', image: '' }); onChange({ items: items.slice(0, k), options: { ...o, focus: Math.min(Number(o.focus ?? Math.floor((k - 1) / 2)), k - 1) } }); }} />
    <NumberPick label="In focus first" value={Number(o.focus ?? Math.floor((n - 1) / 2)) + 1} min={1} max={Math.max(1, n)} onChange={k => set('focus', k - 1)} />
    {chips('shape', 'Screens', [['phone', 'Phone'], ['tablet', 'Tablet'], ['web', 'Web page']], 'phone')}
    {chips('sides', 'Screens beside it', [['faded', 'Faded'], ['full', 'Full colour']], 'faded')}
    <label className="csb-sb-switch"><span><b>Caption</b><small>The focused screen’s name and a line about it, under the row.</small></span><input type="checkbox" role="switch" checked={o.caption !== false} onChange={e => set('caption', e.target.checked)} /><i aria-hidden="true" /></label>
    <div className="csb-sb-row"><span className="csb-sb-label">Background</span><ColorDots label="Background" custom value={String(o.bg ?? 'stone')} onChange={v => set('bg', v)} options={[{ value: 'stone', label: 'Warm grey', color: '#ebe8e4' }, { value: 'white', label: 'White', color: '#f5f3f1' }, { value: 'dark', label: 'Dark', color: '#161411' }, { value: '#e8f2fd', label: 'Pale blue', color: '#e8f2fd' }]} /></div>
    <p className="csb-field-note">Click a screen on the page to paste a Figma frame, image or video. Visitors can click the screens beside it to bring them into focus. Names and captions are in Content below.</p>
  </div>;
}
