import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useReducedMotion } from './MotionKit';
import { EditableText } from './EditableText';
import type { CaseStudySection } from './model';

const ease = [0.22, 1, 0.36, 1] as const;
const visibleItems = (section: CaseStudySection) => section.items.slice(0, section.layout?.count ?? section.items.length);

/* Numbered findings — a hairline list with accent numbers (from AttendEase "The problem"). */
export function Findings({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  return <ol className="csb-findings">{visibleItems(section).map((item, index) =>
    <motion.li key={index} initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .6, delay: index * .08, ease }}>
      <span className="csb-findings-number">{String(index + 1).padStart(2, '0')}</span>
      <div><h3><EditableText field={`items.${index}.title`} value={item.title} /></h3><p><EditableText field={`items.${index}.detail`} value={item.detail} /></p></div>
    </motion.li>)}</ol>;
}

/* Interview highlights — choose a participant, read the summary, the finding and their words. */
export function Interviews({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const people = visibleItems(section);
  const [active, setActive] = useState(0);
  const index = Math.min(active, people.length - 1);
  const person = people[index];
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (next: number) => { const target = (next + people.length) % people.length; setActive(target); tabs.current[target]?.focus(); };
  if (!person) return null;
  return <div className="csb-interviews">
    <div className="csb-interviews-people" role="tablist" aria-label="Interview participants" aria-orientation="vertical">
      {people.map((item, i) => <button key={i} ref={node => { tabs.current[i] = node; }} role="tab" id={`${section.id}-tab-${i}`} aria-selected={i === index} aria-controls={`${section.id}-panel`} tabIndex={i === index ? 0 : -1} className={i === index ? 'is-active' : ''} onClick={event => { event.stopPropagation(); setActive(i); }} onKeyDown={event => { if (['ArrowDown', 'ArrowRight'].includes(event.key)) { event.preventDefault(); move(i + 1); } if (['ArrowUp', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); move(i - 1); } }}>
        <strong><EditableText field={`items.${i}.title`} value={item.title} /></strong>
        <small><EditableText field={`items.${i}.value`} value={item.value || ''} /></small>
      </button>)}
    </div>
    <motion.div key={index} className="csb-interviews-panel" role="tabpanel" id={`${section.id}-panel`} aria-labelledby={`${section.id}-tab-${index}`} initial={reduce ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .45, ease }}>
      <p className="csb-interviews-summary"><EditableText field={`items.${index}.detail`} value={person.detail} /></p>
      <div className="csb-interviews-evidence">
        <div className="is-finding"><span>Finding</span><p><EditableText field={`items.${index}.finding`} value={person.finding || ''} /></p><small><EditableText field={`items.${index}.findingNote`} value={person.findingNote || ''} /></small></div>
        <div className="is-quote"><span>In their words</span><blockquote>“<EditableText field={`items.${index}.quote`} value={person.quote || ''} />”</blockquote><small><EditableText field={`items.${index}.quoteNote`} value={person.quoteNote || ''} /></small></div>
      </div>
    </motion.div>
  </div>;
}

/* Screen carousel — large screens in a horizontal, snapping scroller with arrows. */
export function ScreenCarousel({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const scrollBy = (direction: number) => { const el = track.current; if (!el) return; const card = el.querySelector<HTMLElement>('.csb-carousel-card'); el.scrollBy({ left: direction * ((card?.offsetWidth ?? 600) + 24), behavior: reduce ? 'auto' : 'smooth' }); };
  return <div className="csb-carousel">
    <div className="csb-carousel-nav">
      <button type="button" aria-label="Previous screen" onClick={event => { event.stopPropagation(); scrollBy(-1); }}><ChevronLeft size={18} /></button>
      <button type="button" aria-label="Next screen" onClick={event => { event.stopPropagation(); scrollBy(1); }}><ChevronRight size={18} /></button>
    </div>
    <div className="csb-carousel-track" ref={track} tabIndex={0} aria-label={`${section.title} — scroll horizontally`}>
      {visibleItems(section).map((item, index) => <motion.figure key={index} className="csb-carousel-card" initial={reduce ? false : { opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .7, delay: index * .08, ease }}>
        <div className="csb-carousel-image" data-image-slot={`${section.id}:${index}`}>{item.image ? <img src={item.image} alt={item.title} loading="lazy" /> : <div className="csb-carousel-empty"><strong>Screen {String(index + 1).padStart(2, '0')}</strong><span>Click to add an image or Figma frame</span></div>}</div>
        <figcaption><div><strong><EditableText field={`items.${index}.title`} value={item.title} /></strong><span><EditableText field={`items.${index}.detail`} value={item.detail} /></span></div><ChevronRight size={18} aria-hidden="true" /></figcaption>
      </motion.figure>)}
    </div>
  </div>;
}
