import { useEffect, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText } from './EditableText';
import { easeOut, useExpressive, useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Type specimen: the type system set in the real fonts, live text (not a picture).
  items: title = role (Header 1…), detail = spec line, value = sample text, font = { family, size (pt), italic, upper, tracking (%), weight, leading }.
  Google fonts named here are loaded on demand; DIN Condensed uses the system font on Mac, Barlow Condensed elsewhere.
*/
export type FontSpec = { family: string; size: number; italic?: boolean; upper?: boolean; tracking?: number; weight?: number; leading?: number };
const STACK: Record<string, string> = {
  'DIN Condensed': '"DIN Condensed","DIN Alternate","Barlow Condensed","Oswald",sans-serif',
  Lora: '"Lora",Georgia,serif',
};
const GOOGLE: Record<string, string> = { Lora: 'Lora:ital,wght@0,400;0,500;0,700;1,400;1,500', 'DIN Condensed': 'Barlow+Condensed:wght@400;500;600' };
function useFonts(families: string[]) {
  useEffect(() => {
    const want = [...new Set(families.map(f => GOOGLE[f] ?? (/^[\w\s]+$/.test(f) ? `${f.replace(/ /g, '+')}:ital,wght@0,400;0,700;1,400` : '')).filter(Boolean))];
    if (!want.length) return;
    const href = `https://fonts.googleapis.com/css2?${want.map(w => `family=${w}`).join('&')}&display=swap`;
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l);
  }, [families.join('|')]);
}

export function TypeSpecimen({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const ref = useRef<HTMLDivElement>(null); const seen = useInView(ref, { once: true, amount: .2 }) || reduce;
  const items = section.items;
  useFonts(items.map(i => i.font?.family ?? ''));
  return <div ref={ref} className="csb-type">
    {items.map((it, i) => { const f = it.font ?? { family: 'Inter', size: 18 };
      return <motion.div key={i} className="csb-type-row" initial={false} animate={{ opacity: seen ? 1 : 0, y: seen ? 0 : 14 }} transition={{ duration: .6, delay: expressive ? i * .1 : 0, ease: easeOut }}>
        <div className="csb-type-meta"><strong><EditableText field={`items.${i}.title`} value={it.title} /></strong><span><EditableText field={`items.${i}.detail`} value={it.detail} /></span></div>
        <p className="csb-type-sample" style={{ fontFamily: STACK[f.family] ?? `"${f.family}",sans-serif`, fontSize: `clamp(${Math.max(13, f.size * .55)}px, ${(f.size * 1.333 / 12).toFixed(2)}vw, ${f.size * 1.333}px)`, fontStyle: f.italic ? 'italic' : 'normal', textTransform: f.upper ? 'uppercase' : 'none', letterSpacing: `${(f.tracking ?? 0) / 100}em`, fontWeight: f.weight ?? 400, lineHeight: f.leading ? `${(f.leading / f.size).toFixed(2)}` : 1.15 }}>
          <EditableText field={`items.${i}.value`} value={it.value ?? ''} />
        </p>
      </motion.div>; })}
  </div>;
}

export function TypeSpecimenControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const items = section.items;
  const setF = (i: number, patch: Partial<FontSpec>) => onChange({ items: items.map((it, k) => k === i ? { ...it, font: { family: 'Inter', size: 18, ...it.font, ...patch } } : it) });
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-field-note">Click the samples and labels on the page to change the words. Set each style here; any Google Font name works.</p>
    {items.map((it, i) => { const f = it.font ?? { family: 'Inter', size: 18 }; return <div key={i} className="csb-ss-ctl">
      <strong style={{ fontSize: 12.5 }}>{it.title}</strong>
      <div className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr 56px 56px auto' }}>
        <input value={f.family} aria-label="Font" onChange={e => setF(i, { family: e.target.value })} />
        <input type="number" value={f.size} aria-label="Size (pt)" title="Size (pt)" onChange={e => setF(i, { size: Number(e.target.value) || 12 })} />
        <input type="number" value={f.tracking ?? 0} aria-label="Tracking %" title="Tracking %" onChange={e => setF(i, { tracking: Number(e.target.value) })} />
        <button type="button" className="csb-icon-button" aria-label="Remove style" onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
      </div>
      <div className="csb-fc-ctl-line" style={{ gridTemplateColumns: 'auto auto 1fr' }}>
        <label className="csb-check-field"><input type="checkbox" checked={!!f.italic} onChange={e => setF(i, { italic: e.target.checked })} /> Italic</label>
        <label className="csb-check-field"><input type="checkbox" checked={!!f.upper} onChange={e => setF(i, { upper: e.target.checked })} /> Caps</label>
      </div>
    </div>; })}
    <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: 'New style', detail: 'Font · size', value: 'Sample text', font: { family: 'Inter', size: 18 } }] })}><Plus size={13} /> Add style</button>
  </div>;
}
