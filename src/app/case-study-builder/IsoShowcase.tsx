import { useRef } from 'react';
import { Media } from './Media';
import { motion, useTransform } from 'motion/react';
import { useReducedMotion, useScrollProgress } from './MotionKit';
import type { CaseStudySection } from './model';
import { ColorDots } from './ColorDots';

/*
  Tilted showcase: your screens laid out on a tilted plane, like pages spread across a table,
  with soft shadows and a gentle drift as you scroll (columns move at different speeds).
  items: image (+ title as alt text). Fewer than nine screens repeat to fill the plane;
  only the first copy of each is a paste spot in the editor.
  options.angle = 'tilt' (default) | 'steep' | 'flat';  options.bg = 'stone' | 'white' | 'dark';
  options.shape = 'web' (landscape pages, default) | 'phone' (tall screens).
*/
const ANGLES: Record<string, string> = {
  tilt: 'rotateX(52deg) rotateZ(-34deg)',
  steep: 'rotateX(60deg) rotateZ(-45deg)',
  flat: 'rotateX(28deg) rotateZ(-14deg)',
};

export function IsoShowcase({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const p = useScrollProgress(ref, 1, 0);
  const o = section.options ?? {};
  const angle = ANGLES[String(o.angle ?? 'tilt')] ?? ANGLES.tilt;
  const phone = o.shape === 'phone';
  const items = section.items.map((it, i) => ({ it, i }));
  const COLS = phone ? 5 : 3; const PER = phone ? 3 : 3;
  const need = COLS * PER;
  const filled = items.length ? Array.from({ length: Math.max(need, items.length) }, (_, k) => ({ ...items[k % items.length], copy: k >= items.length })) : [];
  const cols = Array.from({ length: COLS }, (_, c) => filled.filter((_, k) => k % COLS === c));
  // Each column drifts a different amount; the middle ones the most.
  const drift = [useTransform(p, [0, 1], [60, -60]), useTransform(p, [0, 1], [-90, 90]), useTransform(p, [0, 1], [40, -40]), useTransform(p, [0, 1], [-70, 70]), useTransform(p, [0, 1], [50, -50])];
  const custom = /^#/.test(String(o.bg ?? '')) ? String(o.bg) : '';
  return <div ref={ref} className={`csb-iso is-${custom ? 'custom' : String(o.bg ?? 'stone')} ${phone ? 'is-phone' : ''} ${o.corners === 'round' ? 'is-round' : ''}`} style={custom ? { background: custom } : undefined}>
    <div className="csb-iso-plane" style={{ transform: `translate(-50%, -50%) ${angle}` }}>
      {cols.map((col, c) => <motion.div key={c} className="csb-iso-col" style={reduce ? { marginTop: c % 2 ? '18%' : 0 } : { y: drift[c], marginTop: c % 2 ? '18%' : 0 }}>
        {col.map(({ it, i, copy }, k) => <div key={k} className="csb-iso-card" data-image-slot={editorMode && !copy ? `${section.id}:${i}` : undefined}>
          {it.image ? <Media src={it.image} alt={copy ? '' : it.title || 'Screen'} loading="lazy" draggable={false} /> : <span>{editorMode && !copy ? 'Click to add a screen' : ''}</span>}
        </div>)}
      </motion.div>)}
    </div>
    {!items.length && <p className="csb-iso-empty">Add screens in the panel on the right.</p>}
  </div>;
}

export function IsoShowcaseControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const o = section.options ?? {};
  const set = (k: string, v: string) => onChange({ options: { ...o, [k]: v } });
  const chips = (key: string, label: string, opts: Array<[string, string]>, def: string) => <div className="csb-sb-row"><span className="csb-sb-label">{label}</span>
    <div className="csb-sb-chips" role="radiogroup" aria-label={label}>{opts.map(([v, l]) => { const on = String(o[key] ?? def) === v; return <button key={v} type="button" role="radio" aria-checked={on} aria-pressed={on} onClick={() => set(key, v)}>{l}</button>; })}</div></div>;
  return <div className="csb-tsc">
    {chips('shape', 'Screens', [['web', 'Web pages'], ['phone', 'Phone screens']], 'web')}
    {chips('angle', 'Angle', [['flat', 'Gentle'], ['tilt', 'Tilted'], ['steep', 'Steep']], 'tilt')}
    {chips('corners', 'Corners', [['soft', 'Subtle'], ['round', 'Rounded']], 'soft')}
    <div className="csb-sb-row"><span className="csb-sb-label">Background</span><ColorDots label="Background" custom value={String(o.bg ?? 'stone')} onChange={v => set('bg', v)} options={[{ value: 'stone', label: 'Warm grey', color: '#ebe8e4' }, { value: 'white', label: 'White', color: '#f5f3f1' }, { value: 'dark', label: 'Dark', color: '#161411' }, { value: '#1f3d3f', label: 'Deep teal', color: '#1f3d3f' }]} /></div>
    <p className="csb-field-note">Click any screen on the page to paste a Figma frame or image. With fewer than nine, they repeat to fill the table. Add or remove screens in Content below.</p>
  </div>;
}
