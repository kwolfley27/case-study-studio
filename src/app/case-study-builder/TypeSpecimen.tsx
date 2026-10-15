import { useEffect, useRef, type CSSProperties } from 'react';
import { motion, useInView } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText } from './EditableText';
import { easeOut, useExpressive, useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Type system: shown in the real fonts as live text, never a picture. Three parts, each can be hidden:
  1. Typefaces: one panel per family with a large "Aa", its name, what it's used for, the styles in use and the alphabet.
  2. Scale (off unless switched on): a column per style whose height follows its size (largest first), with an "Ag" set in that style.
  3. In use: each style set at its size with its role and spec.
  items: title = role, detail = spec line, value = sample text, font = FontSpec.
  options.showFaces / showScale / showRows (default on); options["use:<family>"] = what that face is for.
*/
export type FontSpec = { family: string; size: number; italic?: boolean; upper?: boolean; tracking?: number; weight?: number; leading?: number };
const STACK: Record<string, string> = {
  'DIN Condensed': '"DIN Condensed","DIN Alternate","Barlow Condensed","Oswald",sans-serif',
  Lora: '"Lora",Georgia,serif',
  'SF Pro': '-apple-system,"SF Pro Text","SF Pro Display",system-ui,sans-serif',
};
const GOOGLE: Record<string, string> = { Lora: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500', 'DIN Condensed': 'Barlow+Condensed:wght@400;500;600;700', 'SF Pro': '' };
const WEIGHT: Record<number, string> = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
const stackOf = (family: string) => STACK[family] ?? `"${family}",system-ui,sans-serif`;
const DEFAULT: FontSpec = { family: 'Inter', size: 18 };

function useFonts(families: string[]) {
  useEffect(() => {
    const want = [...new Set(families.map(f => GOOGLE[f] ?? (/^[\w\s]+$/.test(f) ? `${f.replace(/ /g, '+')}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400` : '')).filter(Boolean))];
    if (!want.length) return;
    const href = `https://fonts.googleapis.com/css2?${want.map(w => `family=${w}`).join('&')}&display=swap`;
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l);
  }, [families.join('|')]);
}

const styleOf = (f: FontSpec, px: number, leading?: boolean): CSSProperties => ({
  fontFamily: stackOf(f.family), fontSize: px, fontStyle: f.italic ? 'italic' : 'normal', textTransform: f.upper ? 'uppercase' : 'none',
  letterSpacing: `${(f.tracking ?? 0) / 100}em`, fontWeight: f.weight ?? 400, lineHeight: leading && f.leading ? (f.leading / f.size).toFixed(2) : 1.12,
});
// Points on the page scale with the viewport but keep their proportions.
const fluid = (pt: number) => `clamp(${Math.max(13, pt * .5).toFixed(1)}px, ${(pt * .075).toFixed(2)}vw, ${(pt * 1.05).toFixed(1)}px)`;

type Face = { family: string; roles: string[]; styles: string[] };
function facesOf(items: CaseStudySection['items']): Face[] {
  const map = new Map<string, Face>();
  items.forEach(it => {
    const f = it.font ?? DEFAULT; const face = map.get(f.family) ?? { family: f.family, roles: [], styles: [] };
    face.roles.push(it.title);
    [WEIGHT[f.weight ?? 400] ?? String(f.weight), f.italic && 'Italic', f.upper && 'Caps'].forEach(s => { if (s && !face.styles.includes(s)) face.styles.push(s); });
    map.set(f.family, face);
  });
  return [...map.values()];
}

export function TypeSpecimen({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const ref = useRef<HTMLDivElement>(null); const seen = useInView(ref, { once: true, amount: .15 }) || reduce;
  const items = section.items; const o = section.options ?? {};
  useFonts(items.map(i => i.font?.family ?? ''));
  const faces = facesOf(items);
  const bySize = items.map((it, i) => ({ it, i, f: it.font ?? DEFAULT })).sort((a, b) => b.f.size - a.f.size);
  const max = Math.max(...items.map(i => i.font?.size ?? 18), 1);
  const t = (d: number, dur = .7) => ({ duration: expressive ? dur : .3, delay: expressive ? d : 0, ease: easeOut });

  return <div ref={ref} className="csb-type">
    {o.showFaces !== false && faces.length > 0 && <div className="csb-type-faces" style={{ ['--faces' as string]: Math.min(faces.length, 3) }}>
      {faces.map((face, k) => { const f = items.find(i => (i.font ?? DEFAULT).family === face.family)?.font ?? DEFAULT; const regular = { ...f, italic: false, upper: false, tracking: 0 };
        return <div key={face.family} className="csb-type-face">
          <motion.span className="csb-type-glyph" aria-hidden="true" style={{ fontFamily: stackOf(face.family), fontWeight: f.weight ?? 400 }}
            initial={false} animate={{ clipPath: seen ? 'inset(0% 0% 0% 0%)' : 'inset(100% 0% 0% 0%)', y: seen ? 0 : 30 }} transition={t(k * .15, 1)}>Aa</motion.span>
          <motion.div className="csb-type-faceinfo" initial={false} animate={{ opacity: seen ? 1 : 0, y: seen ? 0 : 10 }} transition={t(.35 + k * .15)}>
            <h3>{face.family}</h3>
            <p className="csb-type-use"><EditableText field={`options.use:${face.family}`} value={String(o[`use:${face.family}`] ?? face.roles.join(' · '))} /></p>
            <ul className="csb-type-styles">{face.styles.map(s => <li key={s}>{s}</li>)}</ul>
            <p className="csb-type-alpha" style={styleOf(regular, 15)}>ABCDEFGHIJKLM abcdefghijklm 0123456789</p>
          </motion.div>
        </div>; })}
    </div>}

    {o.showScale === true && items.length > 1 && <div className="csb-type-scale" role="list" aria-label="Type scale">
      {bySize.map(({ it, f }, k) => <div key={k} className="csb-type-step" role="listitem">
        <motion.div className="csb-type-bar" style={{ height: `${Math.max(22, (f.size / max) * 100)}%` }} initial={false} animate={{ scaleY: seen ? 1 : 0 }} transition={t(.2 + k * .08, .9)}>
          <motion.div className="csb-type-bar-top" initial={false} animate={{ opacity: seen ? 1 : 0 }} transition={t(.6 + k * .08, .5)}>
            <b>{f.size}<small>pt</small></b>
            <span style={styleOf(f, Math.round(f.size * 1.333 * .9))}>Ag</span>
          </motion.div>
          <span className="csb-type-bar-role">{it.title}</span>
        </motion.div>
      </div>)}
    </div>}

    {o.showRows !== false && <div className="csb-type-rows">
      {items.map((it, i) => { const f = it.font ?? DEFAULT;
        return <motion.div key={i} className="csb-type-row" initial={false} animate={{ opacity: seen ? 1 : 0, y: seen ? 0 : 14 }} transition={t(.3 + i * .08, .6)}>
          <div className="csb-type-meta"><strong><EditableText field={`items.${i}.title`} value={it.title} /></strong><span><EditableText field={`items.${i}.detail`} value={it.detail} /></span></div>
          <p className="csb-type-sample" style={{ ...styleOf(f, 0, true), fontSize: fluid(f.size) }}><EditableText field={`items.${i}.value`} value={it.value ?? ''} /></p>
        </motion.div>; })}
    </div>}
  </div>;
}

export function TypeSpecimenControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const items = section.items; const o = section.options ?? {};
  const setF = (i: number, patch: Partial<FontSpec>) => onChange({ items: items.map((it, k) => k === i ? { ...it, font: { ...DEFAULT, ...it.font, ...patch } } : it) });
  const setItem = (i: number, patch: Partial<CaseStudySection['items'][number]>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  const opt = (k: string, v: boolean) => onChange({ options: { ...o, [k]: v } });
  const show: Array<[string, string, boolean]> = [['showFaces', 'Typefaces', o.showFaces !== false], ['showScale', 'Size scale', o.showScale === true], ['showRows', 'Styles in use', o.showRows !== false]];
  return <div className="csb-tsc">
    <div className="csb-sb-row">
      <span className="csb-sb-label">Show</span>
      <div className="csb-sb-chips" role="group" aria-label="Parts to show">{show.map(([k, l, on]) => <button key={k} type="button" aria-pressed={on} onClick={() => opt(k, !on)}>{l}</button>)}</div>
    </div>
    <div className="csb-tsc-head"><span className="csb-sb-label">Styles</span><small>Any Google Font name works. Click a sample on the page to change its words.</small></div>
    {items.map((it, i) => { const f = it.font ?? DEFAULT; const id = `${section.id}-ts-${i}`; return <div key={i} className="csb-tsc-card">
      <div className="csb-tsc-top">
        <input className="csb-tsc-name" value={it.title} aria-label="Style name" onChange={e => setItem(i, { title: e.target.value })} />
        <button type="button" className="csb-tsc-del" aria-label={`Remove ${it.title}`} title="Remove style" onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
      </div>
      <label className="csb-tsc-field is-font"><span>Font</span><input id={`${id}-f`} value={f.family} style={{ fontFamily: stackOf(f.family) }} onChange={e => setF(i, { family: e.target.value })} /></label>
      <div className="csb-tsc-grid">
        <label className="csb-tsc-field"><span>Size</span><span className="csb-tsc-unit"><input type="number" min={6} max={200} value={f.size} onChange={e => setF(i, { size: Number(e.target.value) || 12 })} /><em>pt</em></span></label>
        <label className="csb-tsc-field"><span>Letter spacing</span><span className="csb-tsc-unit"><input type="number" step={1} value={f.tracking ?? 0} onChange={e => setF(i, { tracking: Number(e.target.value) })} /><em>%</em></span></label>
        <label className="csb-tsc-field"><span>Weight</span><select value={f.weight ?? 400} onChange={e => setF(i, { weight: Number(e.target.value) })}>{[300, 400, 500, 600, 700].map(w => <option key={w} value={w}>{WEIGHT[w]}</option>)}</select></label>
      </div>
      <div className="csb-sb-chips" role="group" aria-label="Style">
        <button type="button" aria-pressed={!!f.italic} onClick={() => setF(i, { italic: !f.italic })}><i style={{ fontStyle: 'italic' }}>Italic</i></button>
        <button type="button" aria-pressed={!!f.upper} onClick={() => setF(i, { upper: !f.upper })}>All caps</button>
      </div>
    </div>; })}
    <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'New style', detail: 'Font · size', value: 'Sample text', font: { ...DEFAULT } }] })}><Plus size={13} /> Add a style</button>
  </div>;
}
