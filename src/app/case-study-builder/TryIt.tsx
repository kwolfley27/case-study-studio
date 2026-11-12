import { useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { EditableText, EditingContext } from './EditableText';
import { Media } from './Media';
import { useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Try it yourself: the old and new screens side by side as a switch. Each has one clickable spot
  (the button that matters); clicking it shows what happens, in a small message at the bottom of the screen.
  items[0] = before, items[1] = after: { title (tab label), detail (what happens), value (the hint), image, point "x,y" in % }.
*/
const spot = (p?: string): [number, number] => { const [x, y] = (p || '').split(',').map(Number); return [Number.isFinite(x) ? x : 70, Number.isFinite(y) ? y : 88]; };

export function TryIt({ section }: { section: CaseStudySection }) {
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion();
  const [which, setWhich] = useState(0);
  const [said, setSaid] = useState<number | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const item = section.items[which] ?? { title: '', detail: '' };
  const [x, y] = drag ?? spot(item.point);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const pick = (k: number) => { setWhich(k); setSaid(null); };
  const press = () => { if (edit) return; setSaid(which); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setSaid(null), 3600); };
  // While editing, drag the spot onto the button it stands for.
  const startDrag = (event: React.PointerEvent) => {
    if (!edit || !frame.current) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const at = (e: { clientX: number; clientY: number }): [number, number] => { const r = frame.current!.getBoundingClientRect(); return [Math.round(Math.min(98, Math.max(2, (e.clientX - r.left) / r.width * 100))), Math.round(Math.min(98, Math.max(2, (e.clientY - r.top) / r.height * 100)))]; };
    let last = at(event); setDrag(last);
    const move = (e: PointerEvent) => { last = at(e); setDrag(last); };
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); edit(`items.${which}.point`, last.join(',')); setDrag(null); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up);
  };
  return <div className="csb-try">
    <div className="csb-try-bar">
      <div className="csb-ab-switch" role="group" aria-label="Show version">
        {[0, 1].map(k => <button key={k} type="button" aria-pressed={which === k} onClick={e => { e.stopPropagation(); pick(k); }}>{section.items[k]?.title || (k ? 'After' : 'Before')}</button>)}
      </div>
      <p className="csb-try-hint"><EditableText field={`items.${which}.value`} value={item.value || 'Try clicking the highlighted button'} /></p>
    </div>
    <div className="csb-try-frame" ref={frame} data-image-slot={`${section.id}:${which}`}>
      {item.image ? <Media src={item.image} alt={item.title} /> : <div className="csb-carousel-empty"><strong>{which ? 'After' : 'Before'} screen</strong><span>Click to add the screenshot</span></div>}
      {(item.image || edit) && <button type="button" data-no-slot className={`csb-try-spot ${edit ? 'is-editing' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} aria-label={edit ? 'Drag onto the button it stands for' : `Try it: ${item.value || 'press the button'}`}
        onPointerDown={startDrag} onClick={e => { e.stopPropagation(); press(); }}><span aria-hidden="true" /></button>}
      <AnimatePresence>
        {said === which && <motion.div key={which} className="csb-try-toast" role="status" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }} transition={{ duration: .3, ease: [0.22, 1, 0.36, 1] }}>{item.detail}</motion.div>}
      </AnimatePresence>
    </div>
    {edit && <p className="csb-try-edit"><span>What happens when it's clicked:</span> <EditableText field={`items.${which}.detail`} value={item.detail} /></p>}
  </div>;
}
