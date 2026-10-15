import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { EditableText } from './EditableText';
import { DeviceFrame, type Frame } from './DeviceFrame';
import { useExpressive } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Iterations: one screen through its versions. Step through v1 → v2 → v3 in the same device;
  each version says what changed and what prompted it. Shows you iterate without a wall of drafts.
  items: title = version name, detail = what changed, value = what prompted it, image / figmaUrl = the screen.
  options.device = 'phone' | 'laptop' | 'browser' | 'none'; options.stat = one line of scale ("4 rounds · 38 frames").
*/
export function Iterations({ section }: { section: CaseStudySection }) {
  const expressive = useExpressive();
  const items = section.items;
  const [k, setK] = useState(0);
  const dir = useRef(1);
  const at = Math.min(k, Math.max(0, items.length - 1));
  const it = items[at];
  const go = (n: number) => { const next = Math.max(0, Math.min(items.length - 1, n)); dir.current = next > at ? 1 : -1; setK(next); };
  const device = (section.options?.device as Frame | undefined) ?? 'phone';
  const stat = String(section.options?.stat ?? '');
  if (!it) return null;
  return <div className={`csb-it is-${device}`} onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); } }}>
    <div className="csb-it-text">
      {stat && <p className="csb-it-stat"><EditableText field="options.stat" value={stat} /></p>}
      <div className="csb-it-track" role="tablist" aria-label="Versions">
        <span className="csb-it-line" aria-hidden="true"><motion.i initial={false} animate={{ scaleX: items.length > 1 ? at / (items.length - 1) : 1 }} transition={{ duration: .5, ease: [0.22, 1, 0.36, 1] }} /></span>
        {items.map((x, i) => <button key={i} type="button" role="tab" aria-selected={i === at} className={i === at ? 'is-on' : i < at ? 'is-past' : ''} onClick={() => go(i)} title={x.title}><span>{`v${i + 1}`}</span></button>)}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={at} className="csb-it-copy" initial={expressive ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} exit={expressive ? { opacity: 0, y: -8 } : undefined} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }}>
          <p className="csb-it-count">Version {at + 1} of {items.length}</p>
          <h3><EditableText field={`items.${at}.title`} value={it.title} /></h3>
          <p className="csb-it-detail"><EditableText field={`items.${at}.detail`} value={it.detail} /></p>
          {(it.value || at > 0) && <p className="csb-it-why"><span>Prompted by</span> <EditableText field={`items.${at}.value`} value={it.value || 'What you learned that led to this change'} /></p>}
        </motion.div>
      </AnimatePresence>
      <div className="csb-it-arrows">
        <button type="button" aria-label="Previous version" disabled={at === 0} onClick={() => go(at - 1)}><ArrowLeft size={16} /></button>
        <button type="button" aria-label="Next version" disabled={at === items.length - 1} onClick={() => go(at + 1)}><ArrowRight size={16} /></button>
      </div>
    </div>
    <div className="csb-it-screen" onClick={e => { if ((e.target as HTMLElement).closest('[data-image-slot]')) return; go(at === items.length - 1 ? 0 : at + 1); }}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir.current}>
        <motion.div key={at} className="csb-it-frame" initial={expressive ? { opacity: 0, x: 24 * dir.current, filter: 'blur(6px)' } : { opacity: 0 }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -24 * dir.current, filter: expressive ? 'blur(6px)' : 'blur(0px)' }} transition={{ duration: .45, ease: [0.22, 1, 0.36, 1] }}>
          {device === 'none'
            ? <div className="csb-it-flat" data-image-slot={`${section.id}:${at}`}>{it.image ? <img src={it.image} alt={it.title} /> : <span>Add version {at + 1}</span>}</div>
            : <DeviceFrame frame={device} image={it.image} alt={it.title} slot={`${section.id}:${at}`} hint={`Add version ${at + 1}`} />}
        </motion.div>
      </AnimatePresence>
    </div>
  </div>;
}

export function IterationsControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  const items = section.items; const o = section.options ?? {};
  const set = (i: number, patch: Partial<CaseStudySection['items'][number]>) => onChange({ items: items.map((it, k) => k === i ? { ...it, ...patch } : it) });
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; onChange({ items: next }); };
  return <div className="csb-connection-section csb-fc-ctl">
    <p className="csb-panel-kicker">Device</p>
    <div className="csb-segment" role="group" aria-label="Device">{([['phone', 'iPhone'], ['laptop', 'MacBook'], ['browser', 'Browser'], ['none', 'None']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={(o.device ?? 'phone') === v} onClick={() => onChange({ options: { ...o, device: v } })}>{l}</button>)}</div>
    <label className="csb-field"><span>Scale line (optional)</span><input value={String(o.stat ?? '')} placeholder="4 rounds · 38 frames · 12 usability tests" onChange={e => onChange({ options: { ...o, stat: e.target.value } })} /></label>
    <p className="csb-panel-kicker">Versions</p>
    <p className="csb-field-note">Pick the 3–5 versions that tell the story, not every draft. Click the screen on the page to add each version (paste a Figma frame link, or copy as PNG with ⌘⇧C and paste).</p>
    {items.map((it, i) => <div key={i} className="csb-ss-ctl">
      <div className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
        <input value={it.title} aria-label={`Version ${i + 1} name`} onChange={e => set(i, { title: e.target.value })} />
        <button type="button" className="csb-icon-button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
        <button type="button" className="csb-icon-button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
        <button type="button" className="csb-icon-button" aria-label="Remove version" onClick={() => onChange({ items: items.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
      </div>
      <input value={it.value ?? ''} placeholder="Prompted by… (test, feedback, constraint)" aria-label={`Version ${i + 1} prompted by`} onChange={e => set(i, { value: e.target.value })} />
    </div>)}
    {items.length < 8 && <button type="button" className="csb-quiet-button" onClick={() => onChange({ items: [...items, { title: `Version ${items.length + 1}`, detail: 'What changed in this version.', value: '' }] })}><Plus size={13} /> Add version</button>}
  </div>;
}
