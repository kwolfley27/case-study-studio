import { useRef } from 'react';
import { motion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useReducedMotion, useScrollProgress } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Floating devices: phones and a tablet hanging in space at different angles, built in real 3D
  (a screen, a bezel and a body with depth), so they turn and catch the light as you scroll.
  As the section moves up the page the devices drift from a loose tumble into their resting pose.
  items: image = screen, title = alt text, value = 'tablet' | 'phone' (default phone; the first is a tablet).
  options.bg = 'tint' (soft accent, default) | 'stone' | 'white' | 'dark'.
*/
type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number };
// Resting poses (x/y in % of the stage, z in px, angles in degrees), five slots.
const REST: Pose[] = [
  { x: 50, y: 50, z: 0, rx: 18, ry: -22, rz: -28 },
  { x: 66, y: 20, z: 120, rx: 30, ry: -18, rz: -16 },
  { x: 40, y: 82, z: 80, rx: 26, ry: 20, rz: -34 },
  { x: 24, y: 30, z: -60, rx: 22, ry: 28, rz: 14 },
  { x: 78, y: 70, z: -40, rx: 34, ry: -30, rz: 8 },
];
// How far each slot is thrown out at the start of the scroll.
const SPREAD: Pose[] = [
  { x: 0, y: 10, z: -80, rx: -14, ry: 26, rz: 12 },
  { x: 8, y: -16, z: 60, rx: -20, ry: 30, rz: -24 },
  { x: -6, y: 18, z: 40, rx: 24, ry: -26, rz: 20 },
  { x: -10, y: -10, z: -40, rx: -18, ry: -24, rz: -20 },
  { x: 10, y: 14, z: -20, rx: 20, ry: 22, rz: 18 },
];

function Device({ img, alt, tablet, p, k, slot, reduce }: { img?: string; alt: string; tablet: boolean; p: MotionValue<number>; k: number; slot?: string; reduce: boolean }) {
  const r = REST[k % REST.length], s = SPREAD[k % SPREAD.length];
  const m = (a: number, b: number) => useTransform(p, [0, .55, 1], [a + b, a, a - b * .35]);
  const x = m(r.x, s.x), y = m(r.y, s.y), z = m(r.z, s.z), rx = m(r.rx, s.rx), ry = m(r.ry, s.ry), rz = m(r.rz, s.rz);
  const left = useTransform(x, v => `${v}%`), top = useTransform(y, v => `${v}%`);
  const style = reduce ? { left: `${r.x}%`, top: `${r.y}%`, z: r.z, rotateX: r.rx, rotateY: r.ry, rotateZ: r.rz } : { left, top, z, rotateX: rx, rotateY: ry, rotateZ: rz };
  return <motion.div className={`csb-fd-dev ${tablet ? 'is-tablet' : 'is-phone'}`} style={style}>
    <div className="csb-fd-float" style={{ animationDelay: `${k * -1.3}s` }}>
      <i className="csb-fd-layer" style={{ transform: 'translateZ(-9px)' }} /><i className="csb-fd-layer" style={{ transform: 'translateZ(-6px)' }} /><i className="csb-fd-layer" style={{ transform: 'translateZ(-3px)' }} />
      <div className="csb-fd-face">
        <div className="csb-fd-screen" data-image-slot={slot}>{img ? <img src={img} alt={alt} draggable={false} /> : <span>{slot ? 'Click to add a screen' : ''}</span>}{!tablet && <b className="csb-fd-island" />}</div>
        <i className="csb-fd-glare" aria-hidden="true" />
      </div>
    </div>
  </motion.div>;
}

export function FloatingDevices({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const raw = useScrollProgress(ref, 1, 0);
  const p = useSpring(raw, { stiffness: 70, damping: 20, mass: .6 });
  const items = section.items.slice(0, 5);
  const bg = String(section.options?.bg ?? 'tint');
  return <div ref={ref} className={`csb-fd is-${bg}`}>
    <div className="csb-fd-stage">
      {items.map((it, k) => <Device key={k} k={k} p={p} reduce={reduce} img={it.image} alt={it.title || 'Screen'} tablet={it.value ? it.value === 'tablet' : k === 0 && items.length > 1} slot={editorMode ? `${section.id}:${k}` : undefined} />)}
    </div>
    <i className="csb-fd-shadow" aria-hidden="true" />
  </div>;
}

export function FloatingDevicesControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const o = section.options ?? {}; const items = section.items;
  const set = (i: number, v: string) => onChange({ items: items.map((it, k) => k === i ? { ...it, value: v } : it) });
  return <div className="csb-tsc">
    <div className="csb-sb-row"><span className="csb-sb-label">Background</span>
      <div className="csb-sb-chips" role="radiogroup" aria-label="Background">{([['tint', 'Soft accent'], ['stone', 'Warm grey'], ['white', 'White'], ['dark', 'Dark']] as const).map(([v, l]) => { const on = String(o.bg ?? 'tint') === v; return <button key={v} type="button" role="radio" aria-checked={on} aria-pressed={on} onClick={() => onChange({ options: { ...o, bg: v } })}>{l}</button>; })}</div></div>
    <div className="csb-sb-row"><span className="csb-sb-label">Devices (up to five)</span>
      {items.slice(0, 5).map((it, i) => { const tab = it.value ? it.value === 'tablet' : i === 0 && items.length > 1; return <div key={i} className="csb-sg-ctl-row" style={{ gridTemplateColumns: '34px minmax(0,1fr) auto' }}>
        <span className="csb-sg-ctl-thumb" style={it.image ? { backgroundImage: `url("${it.image}")` } : undefined} />
        <span style={{ fontSize: 12.5 }}>{it.title || `Screen ${i + 1}`}</span>
        <div className="csb-sb-chips">{(['phone', 'tablet'] as const).map(v => <button key={v} type="button" aria-pressed={(v === 'tablet') === tab} onClick={() => set(i, v)}>{v === 'phone' ? 'Phone' : 'Tablet'}</button>)}</div>
      </div>; })}</div>
    <p className="csb-field-note">Click a device on the page to paste a Figma frame or screenshot. Add or remove devices in Content below.</p>
  </div>;
}
