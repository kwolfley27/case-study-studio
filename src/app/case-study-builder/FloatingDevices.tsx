import { useContext, useEffect, useRef, useState } from 'react';
import { Media } from './Media';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { EditingContext } from './EditableText';
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

type Off = [number, number];
/* Position, depth and spin for one object: its resting pose, thrown out by the scroll, nudged by your drag offset. */
function usePose(p: MotionValue<number>, r: Pose, s: Pose, off: Off, reduce: boolean) {
  const ox = useMotionValue(off[0]), oy = useMotionValue(off[1]);
  useEffect(() => { ox.set(off[0]); oy.set(off[1]); }, [off[0], off[1]]);
  const m = (a: number, b: number) => useTransform(p, [0, .55, 1], [a + b, a, a - b * .35]);
  const x = m(r.x, s.x), y = m(r.y, s.y), z = m(r.z, s.z), rx = m(r.rx, s.rx), ry = m(r.ry, s.ry), rz = m(r.rz, s.rz);
  const left = useTransform([x, ox], ([a, d]: number[]) => `${a + d}%`), top = useTransform([y, oy], ([a, d]: number[]) => `${a + d}%`);
  const still = { left: `${r.x + off[0]}%`, top: `${r.y + off[1]}%` };
  return { left, top, z, rx, ry, rz, still, reduce, r };
}
type PoseT = ReturnType<typeof usePose>;
const poseStyle = (q: PoseT) => q.reduce ? { ...q.still, z: q.r.z, rotateX: q.r.rx, rotateY: q.r.ry, rotateZ: q.r.rz } : { left: q.left, top: q.top, z: q.z, rotateX: q.rx, rotateY: q.ry, rotateZ: q.rz };

function Device({ img, alt, tablet, k, slot, q, drag }: { img?: string; alt: string; tablet: boolean; k: number; slot?: string; q: PoseT; drag?: (e: React.PointerEvent) => void }) {
  return <motion.div className={`csb-fd-dev ${tablet ? 'is-tablet' : 'is-phone'} ${drag ? 'is-draggable' : ''}`} style={{ ...poseStyle(q), zIndex: 1000 + q.r.z }} onPointerDown={drag}>
    <div className="csb-fd-float" style={{ animationDelay: `${k * -1.3}s` }}>
      <i className="csb-fd-layer" style={{ transform: 'translateZ(-9px)' }} /><i className="csb-fd-layer" style={{ transform: 'translateZ(-6px)' }} /><i className="csb-fd-layer" style={{ transform: 'translateZ(-3px)' }} />
      <div className="csb-fd-face">
        <div className="csb-fd-screen" data-image-slot={slot}>{img ? <Media src={img} alt={alt} draggable={false} /> : <span>{slot ? 'Click to add a screen · drag to move' : ''}</span>}{!tablet && <b className="csb-fd-island" />}</div>
        <i className="csb-fd-glare" aria-hidden="true" />
      </div>
    </div>
  </motion.div>;
}

/* A soft shadow on the "floor" under each object: it stays in screen space (no 3D), follows the
   object's position and spin, and spreads and fades the higher the object floats. */
function FloorShadow({ q, kind }: { q: PoseT; kind: 'phone' | 'tablet' | 'pencil' }) {
  const drop = useTransform(q.z, v => 70 + (v + 100) * .3);
  const fade = useTransform(q.z, v => Math.max(.35, Math.min(.85, .8 - v / 600)));
  const spread = useTransform(q.z, v => 1 + Math.max(0, v) / 900);
  const r = q.r;
  const style = q.reduce ? { ...q.still, y: 70 + (r.z + 100) * .3, rotate: r.rz, opacity: Math.max(.35, Math.min(.85, .8 - r.z / 600)) } : { left: q.left, top: q.top, y: drop, rotate: q.rz, opacity: fade, scale: spread };
  return <motion.i className={`csb-fd-floor is-${kind}`} style={style} aria-hidden="true" />;
}

function Pencil({ q, drag }: { q: PoseT; drag?: (e: React.PointerEvent) => void }) {
  return <motion.div className={`csb-fd-pencil ${drag ? 'is-draggable' : ''}`} style={{ ...poseStyle(q), zIndex: 1000 + q.r.z }} aria-hidden="true" onPointerDown={drag}><div className="csb-fd-float" style={{ animationDelay: '-2.4s' }}><span className="csb-fd-pencil-body"><b /></span></div></motion.div>;
}

const parseOff = (v: unknown): Off => { const [a, b] = String(v ?? '').split(',').map(Number); return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0]; };

export function FloatingDevices({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion();
  const { edit } = useContext(EditingContext);
  const ref = useRef<HTMLDivElement>(null);
  const raw = useScrollProgress(ref, 1, 0);
  const p = useSpring(raw, { stiffness: 70, damping: 20, mass: .6 });
  const items = section.items.slice(0, 5);
  const bg = String(section.options?.bg ?? 'tint'); const custom = bg.startsWith('#') ? bg : '';
  const pencilOn = section.options?.pencil === true;
  // While dragging, the live offset; saved when you let go (items.N.point / options.pencilAt as "x,y" in %).
  const [live, setLive] = useState<Record<string, Off>>({});
  const offOf = (key: string, saved: unknown) => live[key] ?? parseOff(saved);
  const slots = [0, 1, 2, 3, 4].map(k => usePose(p, REST[k], SPREAD[k], offOf(`d${k}`, items[k]?.point), reduce));
  const pencilQ = usePose(p, PENCIL, PENCIL_SPREAD, offOf('pencil', section.options?.pencilAt), reduce);
  const startDrag = (key: string, field: string) => editorMode && edit ? (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const box = ref.current?.getBoundingClientRect(); if (!box) return;
    const from = offOf(key, key === 'pencil' ? section.options?.pencilAt : items[Number(key.slice(1))]?.point);
    const sx = e.clientX, sy = e.clientY; let moved = false; let last = from;
    const move = (ev: PointerEvent) => { const dx = (ev.clientX - sx) / box.width * 100, dy = (ev.clientY - sy) / box.height * 100; if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return; moved = true; document.body.classList.add('csb-fd-dragging'); last = [Math.round((from[0] + dx) * 10) / 10, Math.round((from[1] + dy) * 10) / 10]; setLive(l => ({ ...l, [key]: last })); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('csb-fd-dragging');
      if (!moved) return;
      // A drag is not a click: swallow the click that follows so the image menu doesn't open.
      const eat = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); window.removeEventListener('click', eat, true); };
      window.addEventListener('click', eat, true); setTimeout(() => window.removeEventListener('click', eat, true), 300);
      edit(field, `${last[0]},${last[1]}`);
      setTimeout(() => setLive(l => { const n = { ...l }; delete n[key]; return n; }), 60);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  } : undefined;
  const isTab = (k: number) => items[k]?.value ? items[k].value === 'tablet' : k === 0 && items.length > 1;
  return <div ref={ref} className={`csb-fd is-${custom ? 'custom' : bg} ${editorMode ? 'is-editing' : ''}`} style={custom ? { background: `radial-gradient(120% 90% at 50% 20%, color-mix(in srgb, ${custom} 70%, #fff), ${custom})` } : undefined}>
    <div className="csb-fd-floors" aria-hidden="true">
      {pencilOn && <FloorShadow q={pencilQ} kind="pencil" />}
      {items.map((_, k) => <FloorShadow key={k} q={slots[k]} kind={isTab(k) ? 'tablet' : 'phone'} />)}
    </div>
    <div className="csb-fd-stage">
      {pencilOn && <Pencil q={pencilQ} drag={startDrag('pencil', 'options.pencilAt')} />}
      {items.map((it, k) => <Device key={k} k={k} q={slots[k]} img={it.image} alt={it.title || 'Screen'} tablet={isTab(k)} slot={editorMode ? `${section.id}:${k}` : undefined} drag={startDrag(`d${k}`, `items.${k}.point`)} />)}
    </div>
    {editorMode && <p className="csb-fd-hint">Drag a device or the pencil to move it · click a screen to change it</p>}
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
    {(items.some(it => it.point) || o.pencilAt) && <button type="button" className="csb-ps-pick" onClick={() => onChange({ items: items.map(it => ({ ...it, point: undefined })), options: { ...o, pencilAt: undefined } })}>Put everything back in place</button>}
    <p className="csb-field-note">Drag devices and the pencil on the page to move them. Click a device to paste a Figma frame or screenshot. Add or remove devices in Content below.</p>
  </div>;
}
