import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { EditableText } from './EditableText';
import type { CaseStudySection } from './model';

const ZOOM_LEVELS = [1, 1.5, 2] as const;

export function WireframeShowcase({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const screens = section.items.slice(0, 4);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const active = activeIndex === null ? null : screens[activeIndex];
  const openScreen = (index: number) => { setActiveIndex(index); setZoomIndex(0); };
  const showAdjacent = (direction: -1 | 1) => {
    setActiveIndex(index => index === null ? null : (index + direction + screens.length) % screens.length);
    setZoomIndex(0);
  };

  return <div className="csb-wireframes" data-count={screens.length}>
    <div className="csb-phone-stage">{screens.map((item, i) => <motion.figure className="csb-phone-figure" key={item.frameId || i} initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .5, delay: reduce ? 0 : i * .09 }}>
      <button className="csb-phone-open" type="button" disabled={!item.image} onClick={event => { event.stopPropagation(); openScreen(i); }} aria-label={`View ${item.title} up close`}>
        <div className="csb-phone-shell"><div className="csb-phone-screen">{item.image ? <img src={item.image} alt="" style={{ objectFit: section.fit || 'contain' }} loading="lazy" /> : <div className="csb-phone-empty"><span>DESIGNED MEDIA</span><small>Link a Figma frame</small></div>}</div>{!item.image && <><span className="csb-phone-island" /><span className="csb-phone-home" /></>}</div>
        {item.image && <span className="csb-phone-open-hint"><Maximize2 size={13} /> View up close</span>}
      </button>
      <figcaption><strong><EditableText field={`items.${i}.title`} value={item.title} /></strong><span><EditableText field={`items.${i}.detail`} value={item.detail} /></span></figcaption>
    </motion.figure>)}</div>
    <Dialog open={activeIndex !== null} onOpenChange={open => { if (!open) setActiveIndex(null); }}>
      <DialogContent className="csb-screen-dialog" onKeyDown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); showAdjacent(-1); } if (event.key === 'ArrowRight') { event.preventDefault(); showAdjacent(1); } }}>
        <div className="csb-screen-dialog-header"><div><span className="csb-panel-kicker">SCREEN {String((activeIndex ?? 0) + 1).padStart(2, '0')} / {String(screens.length).padStart(2, '0')}</span><DialogTitle>{active?.title || 'Screen detail'}</DialogTitle><DialogDescription>{active?.detail || 'Figma screen'}</DialogDescription></div><div className="csb-screen-dialog-tools"><button type="button" aria-label="Previous screen" onClick={() => showAdjacent(-1)} disabled={screens.length < 2}><ChevronLeft size={18} /></button><button type="button" aria-label="Next screen" onClick={() => showAdjacent(1)} disabled={screens.length < 2}><ChevronRight size={18} /></button><span className="csb-screen-tool-divider" /><button type="button" aria-label="Zoom out" onClick={() => setZoomIndex(i => Math.max(0, i - 1))} disabled={zoomIndex === 0}><Minus size={16} /></button><span className="csb-screen-zoom-label">{Math.round(ZOOM_LEVELS[zoomIndex] * 100)}%</span><button type="button" aria-label="Zoom in" onClick={() => setZoomIndex(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))} disabled={zoomIndex === ZOOM_LEVELS.length - 1}><Plus size={16} /></button></div></div>
        <div className="csb-screen-dialog-scroll" key={activeIndex}><div className="csb-screen-dialog-image" style={{ width: `${402 * ZOOM_LEVELS[zoomIndex]}px` }}>{active?.image && <img src={active.image} alt={`${active.title} full screen`} />}</div></div>
        <p className="csb-screen-dialog-foot">Select another screen with the arrows. Scroll inside the image to inspect details. Press Esc to close.</p>
      </DialogContent>
    </Dialog>
  </div>;
}
