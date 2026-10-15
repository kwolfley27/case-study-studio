import { useRef } from 'react';
import { Media } from './Media';
import { motion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useReducedMotion, useScrollProgress } from './MotionKit';
import type { CaseStudySection } from './model';
import { ColorDots } from './ColorDots';

/*
  Floating devices: phones and a tablet hanging in space at different angles, built in real 3D
  (a screen, a bezel and a body with depth), so they turn and catch the light as you scroll.
  As the section moves up the page the devices drift from a loose tumble into their resting pose.
  items: image = screen, title = alt text, value = 'tablet' | 'phone' (default phone; the first is a tablet).
  options.bg = 'tint' (soft accent, default) | 'stone' | 'white' | 'dark'.
*/
type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number };
// Resting poses (x/y in % of the stage, z in px, angles in degrees): a loose cascade that tumbles
// down through the middle, devices overlapping one another like the classic "gravity" shot.
const REST: Pose[] = [
  { x: 52, y: 47, z: 0, rx: 14, ry: -18, rz: -32 },   // tablet, centre
  { x: 64, y: 17, z: 140, rx: 32, ry: -14, rz: -22 },  // phone over its top-right corner
  { x: 41, y: 72, z: 90, rx: 24, ry: 22, rz: -38 },    // phone overlapping the lower edge
  { x: 54, y: 93, z: 30, rx: 58, ry: 6, rz: -16 },     // phone lying flatter, near the floor
  { x: 30, y: 14, z: -60, rx: 26, ry: 18, rz: 14 },    // phone behind, top left
];
// How far each slot is thrown out at the start of the scroll.
const SPREAD: Pose[] = [
  { x: 2, y: 8, z: -60, rx: -12, ry: 22, rz: 10 },
  { x: 10, y: -14, z: 60, rx: -20, ry: 26, rz: -20 },
  { x: -10, y: 16, z: 40, rx: 22, ry: -24, rz: 18 },
  { x: 6, y: 18, z: -30, rx: -24, ry: -16, rz: -14 },
  { x: -8, y: -14, z: -40, rx: 18, ry: 20, rz: 16 },
];
const PENCIL: Pose = { x: 62, y: 44, z: 120, rx: 22, ry: -10, rz: -14 };
const PENCIL_SPREAD: Pose = { x: 14, y: -10, z: 60, rx: -16, ry: 20, rz: 30 };

function Device({ img, alt, tablet, p, k, slot, reduce }: { img?: string; alt: string; tablet: boolean; p: MotionValue<number>; k: number; slot?: string; reduce: boolean }) {
  const r = REST[k % REST.length], s = SPREAD[k % SPREAD.length];
  const m = (a: number, b: number) => useTransform(p, [0, .55, 1], [a + b, a, a - b * .35]);
  const x = m(r.x, s.x), y = m(r.y, s.y), z = m(r.z, s.z), rx = m(r.rx, s.rx), ry = m(r.ry, s.ry), rz = m(r.rz, s.rz);
  const left = useTransform(x, v => `${v}%`), top = useTransform(y, v => `${v}%`);
  const style = reduce ? { left: `${r.x}%`, top: `${r.y}%`, z: r.z, rotateX: r.rx, rotateY: r.ry, rotateZ: r.rz } : { left, top, z, rotateX: rx, rotateY: ry, rotateZ: rz };
  return <motion.div className={`csb-fd-dev ${tablet ? 'is-tablet' : 'is-phone'}`} style={{ ...style, zIndex: 1000 + r.z }}>
    <div className="csb-fd-float" style={{ animationDelay: `${k * -1.3}s` }}>
      <i className="csb-fd-layer" style={{ transform: 'translateZ(-9px)' }} /><i className="csb-fd-layer" style={{ transform: 'translateZ(-6px)' }} /><i className="csb-fd-layer" style={{ transform: 'translateZ(-3px)' }} />
      <div className="csb-fd-face">
        <div className="csb-fd-screen" data-image-slot={slot}>{img ? <Media src={img} alt={alt} draggable={false} /> : <span>{slot ? 'Click to add a screen' : ''}</span>}{!tablet && <b className="csb-fd-island" />}</div>
        <i className="csb-fd-glare" aria-hidden="true" />
      </div>
    </div>
  </motion.div>;
}

/* A soft shadow on the "floor" under each device: it stays in screen space (no 3D), follows the
   device's position and spin, and spreads and fades the higher the device floats. */
function FloorShadow({ p, k, tablet, pencil, reduce }: { p: MotionValue<number>; k: number; tablet?: boolean; pencil?: boolean; reduce: boolean }) {
  const r = pencil ? PENCIL : REST[k % REST.length], s = pencil ? PENCIL_SPREAD : SPREAD[k % SPREAD.length];
  const m = (a: number, b: number) => useTransform(p, [0, .55, 1], [a + b, a, a - b * .35]);
  const x = m(r.x, s.x), y = m(r.y, s.y), z = m(r.z, s.z), rz = m(r.rz, s.rz);
  const left = useTransform(x, v => `${v}%`), top = useTransform(y, v => `${v}%`);
  const drop = useTransform(z, v => 70 + (v + 100) * .3);
  const fade = useTransform(z, v => Math.max(.35, Math.min(.85, .8 - v / 600)));
  const spread = useTransform(z, v => 1 + Math.max(0, v) / 900);
  const style = reduce ? { left: `${r.x}%`, top: `${r.y}%`, y: 70 + (r.z + 100) * .3, rotate: r.rz, opacity: Math.max(.35, Math.min(.85, .8 - r.z / 600)) } : { left, top, y: drop, rotate: rz, opacity: fade, scale: spread };
  return <motion.i className={`csb-fd-floor ${pencil ? 'is-pencil' : tablet ? 'is-tablet' : 'is-phone'}`} style={style} aria-hidden="true" />;
}

function Pencil({ p, reduce }: { p: MotionValue<number>; reduce: boolean }) {
  const r = PENCIL, s = PENCIL_SPREAD;
  const m = (a: number, b: number) => useTransform(p, [0, .55, 1], [a + b, a, a - b * .35]);
  const x = m(r.x, s.x), y = m(r.y, s.y), z = m(r.z, s.z), rx = m(r.rx, s.rx), ry = m(r.ry, s.ry), rz = m(r.rz, s.rz);
  const left = useTransform(x, v => `${v}%`), top = useTransform(y, v => `${v}%`);
  const style = reduce ? { left: `${r.x}%`, top: `${r.y}%`, z: r.z, rotateX: r.rx, rotateY: r.ry, rotateZ: r.rz } : { left, top, z, rotateX: rx, rotateY: ry, rotateZ: rz };
  return <motion.div className="csb-fd-pencil" style={{ ...style, zIndex: 1000 + r.z }} aria-hidden="true"><div className="csb-fd-float" style={{ animationDelay: '-2.4s' }}><span className="csb-fd-pencil-body"><b /></span></div></motion.div>;
}

export function FloatingDevices({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const raw = useScrollProgress(ref, 1, 0);
  const p = useSpring(raw, { stiffness: 70, damping: 20, mass: .6 });
  const items = section.items.slice(0, 5);
  const bg = String(section.options?.bg ?? 'tint'); const custom = bg.startsWith('#') ? bg : '';
  return <div ref={ref} className={`csb-fd is-${custom ? 'custom' : bg}`} style={custom ? { background: `radial-gradient(120% 90% at 50% 20%, color-mix(in srgb, ${custom} 70%, #fff), ${custom})` } : undefined}>
    <div className="csb-fd-floors" aria-hidden="true">
      {section.options?.pencil === true && <FloorShadow p={p} k={0} pencil reduce={reduce} />}
      {items.map((it, k) => <FloorShadow key={k} k={k} p={p} reduce={reduce} tablet={it.value ? it.value === 'tablet' : k === 0 && items.length > 1} />)}
    </div>
    <div className="csb-fd-stage">
      {section.options?.pencil === true && <Pencil p={p} reduce={reduce} />}
      {items.map((it, k) => <Device key={k} k={k} p={p} reduce={reduce} img={it.image} alt={it.title || 'Screen'} tablet={it.value ? it.value === 'tablet' : k === 0 && items.length > 1} slot={editorMode ? `${section.id}:${k}` : undefined} />)}
    </div>
  </div>;
}

export function FloatingDevicesControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const o = section.options ?? {}; const items = section.items;
  const set = (i: number, v: string) => onChange({ items: items.map((it, k) => k === i ? { ...it, value: v } : it) });
  return <div className="csb-tsc">
    <div className="csb-sb-row"><span className="csb-sb-label">Background</span><ColorDots label="Background" custom value={String(o.bg ?? 'tint')} onChange={v => onChange({ options: { ...o, bg: v } })} options={[{ value: 'tint', label: 'Soft accent', color: 'color-mix(in srgb, var(--csb-accent, #c8553d) 30%, #fdfcfc)' }, { value: 'stone', label: 'Warm grey', color: '#ebe8e4' }, { value: 'white', label: 'White', color: '#f5f3f1' }, { value: 'dark', label: 'Dark', color: '#161411' }]} /></div>
    <label className="csb-sb-switch"><span><b>Apple Pencil</b><small>Float a pencil over the tablet.</small></span><input type="checkbox" role="switch" checked={o.pencil === true} onChange={e => onChange({ options: { ...o, pencil: e.target.checked } })} /><i aria-hidden="true" /></label>
    <div className="csb-sb-row"><span className="csb-sb-label">Devices (up to five)</span>
      {items.slice(0, 5).map((it, i) => { const tab = it.value ? it.value === 'tablet' : i === 0 && items.length > 1; return <div key={i} className="csb-sg-ctl-row" style={{ gridTemplateColumns: '34px minmax(0,1fr) auto' }}>
        <span className="csb-sg-ctl-thumb" style={it.image ? { backgroundImage: `url("${it.image}")` } : undefined} />
        <span style={{ fontSize: 12.5 }}>{it.title || `Screen ${i + 1}`}</span>
        <div className="csb-sb-chips">{(['phone', 'tablet'] as const).map(v => <button key={v} type="button" aria-pressed={(v === 'tablet') === tab} onClick={() => set(i, v)}>{v === 'phone' ? 'Phone' : 'Tablet'}</button>)}</div>
      </div>; })}</div>
    <p className="csb-field-note">Click a device on the page to paste a Figma frame or screenshot. Add or remove devices in Content below.</p>
  </div>;
}
