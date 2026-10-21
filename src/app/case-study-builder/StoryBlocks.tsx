import { useRef, useState } from 'react';
import { Media } from './Media';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
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

/* Interview highlights — people on the left; their summary and a side-scrolling row of labeled cards
   (Finding, Concern, Quote, or any label). item.cards holds the cards; older studies without cards
   show their finding and quote as the first two. */
export type InterviewCard = { label: string; text: string; note?: string; tone?: string };
const TONES: Array<[RegExp, string]> = [[/finding|insight|learn|valid/i, '#43A853'], [/concern|pain|risk|barrier|problem|frustrat/i, '#CF9A1E'], [/opportun|idea|need|want/i, '#3B82F6'], [/quote|said/i, 'var(--csb-accent,#1c1917)']];
export const toneOf = (c: InterviewCard) => (c.tone && c.tone.trim()) || TONES.find(([re]) => re.test(c.label))?.[1] || 'var(--csb-accent,#1c1917)';
export function interviewCards(item: CaseStudySection['items'][number] & { cards?: InterviewCard[] }): InterviewCard[] {
  if (item.cards) return item.cards;
  const out: InterviewCard[] = [];
  if ((item.finding || '').trim()) out.push({ label: 'Finding', text: item.finding || '', note: item.findingNote || '' });
  if ((item.quote || '').trim()) out.push({ label: 'Quote', text: item.quote || '', note: item.quoteNote || '' });
  return out;
}
export function Interviews({ section, editorMode = false }: { section: CaseStudySection; editorMode?: boolean }) {
  const reduce = useReducedMotion();
  const people = visibleItems(section);
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const index = Math.min(active, people.length - 1);
  const person = people[index] as (CaseStudySection['items'][number] & { cards?: InterviewCard[] }) | undefined;
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (next: number) => { const target = (next + people.length) % people.length; setActive(target); tabs.current[target]?.focus(); };
  if (!person) return null;
  const cards = interviewCards(person);
  const stored = !!person.cards;
  // Field paths: stored cards edit in place; older finding/quote fields edit their own field.
  const field = (k: number, part: 'text' | 'note' | 'label') => stored ? `deep:items.${index}.cards.${k}.${part}` : `items.${index}.${cards[k].label === 'Quote' ? (part === 'text' ? 'quote' : 'quoteNote') : (part === 'text' ? 'finding' : 'findingNote')}`;
  const scroll = (d: number) => { const el = track.current; if (!el) return; const card = el.querySelector<HTMLElement>('.csb-ivc-card'); el.scrollBy({ left: d * ((card?.offsetWidth ?? 320) + 20), behavior: reduce ? 'auto' : 'smooth' }); };
  return <div className="csb-interviews csb-ivc">
    <div className="csb-interviews-people" role="tablist" aria-label="Interview participants">
      {people.map((item, i) => <button key={i} type="button" ref={node => { tabs.current[i] = node; }} role="tab" id={`${section.id}-tab-${i}`} aria-selected={i === index} aria-controls={`${section.id}-panel`} tabIndex={i === index ? 0 : -1} className={i === index ? 'is-active' : ''} onClick={event => { event.stopPropagation(); setActive(i); }} onKeyDown={event => { if ((event.target as HTMLElement).isContentEditable) return; if (['ArrowDown', 'ArrowRight'].includes(event.key)) { event.preventDefault(); move(i + 1); } if (['ArrowUp', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); move(i - 1); } }}>
        <strong><EditableText field={`items.${i}.title`} value={item.title} /></strong>
        <small><EditableText field={`items.${i}.value`} value={item.value || ''} /></small>
      </button>)}
    </div>
    <motion.div key={index} className="csb-interviews-panel" role="tabpanel" id={`${section.id}-panel`} aria-labelledby={`${section.id}-tab-${index}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4, ease }}>
      <p className="csb-interviews-summary"><EditableText field={`items.${index}.detail`} value={person.detail} /></p>
      {cards.length > 0 && <div className="csb-ivc-wrap">
        {cards.length > 2 && <div className="csb-ivc-nav"><button type="button" aria-label="Previous card" onClick={e => { e.stopPropagation(); scroll(-1); }}><ChevronLeft size={16} /></button><button type="button" aria-label="Next card" onClick={e => { e.stopPropagation(); scroll(1); }}><ChevronRight size={16} /></button></div>}
        <div className="csb-ivc-track" ref={track} tabIndex={0} aria-label="What this interview showed — scroll sideways for more">
          {cards.map((c, k) => { const quote = /quote/i.test(c.label); return <div key={k} className={`csb-ivc-card ${quote ? 'is-quote' : ''}`} style={{ ['--tone' as string]: toneOf(c) }}>
            <span className="csb-ivc-label">{stored ? <EditableText field={field(k, 'label')} value={c.label} /> : c.label}</span>
            <p className="csb-ivc-text">{quote && !/^\s*["“”'‘]/.test(c.text) && '“'}<EditableText field={field(k, 'text')} value={c.text} />{quote && !/["“”'’]\s*$/.test(c.text) && '”'}</p>
            {(editorMode || (c.note || '').trim()) && <small className="csb-ivc-note"><EditableText field={field(k, 'note')} value={c.note || ''} /></small>}
          </div>; })}
        </div>
      </div>}
    </motion.div>
  </div>;
}

export function InterviewsControls({ section, onChange }: { section: CaseStudySection; onChange: (p: Partial<CaseStudySection>) => void }) {
  type P = CaseStudySection['items'][number] & { cards?: InterviewCard[] };
  const people = visibleItems(section) as P[];
  const setCards = (i: number, cards: InterviewCard[]) => onChange({ items: section.items.map((it, k) => k === i ? { ...it, cards } as P : it) });
  const presets = ['Finding', 'Concern', 'Quote', 'Opportunity'];
  return <div className="csb-tsc">
    <div className="csb-tsc-head"><span className="csb-sb-label">Cards per person</span><small>Each person gets a summary and a row of cards that scrolls sideways. Type the words on the page; add, label and color cards here.</small></div>
    {people.map((p, i) => { const cards = interviewCards(p); return <div key={i} className="csb-tsc-card">
      <div className="csb-tsc-top"><strong style={{ fontSize: 13.5 }}>{p.title || `Participant ${i + 1}`}</strong></div>
      {cards.map((c, k) => <div key={k} className="csb-brand-ctl-row">
        <input type="color" aria-label="Card color" value={/^#[0-9a-f]{6}$/i.test(toneOf(c)) ? toneOf(c) : '#1c1917'} onChange={e => setCards(i, cards.map((x, j) => j === k ? { ...x, tone: e.target.value } : x))} />
        <input className="csb-brand-ctl-name" aria-label="Card label" value={c.label} list="csb-ivc-labels" onChange={e => setCards(i, cards.map((x, j) => j === k ? { ...x, label: e.target.value, tone: undefined } : x))} />
        <button type="button" className="csb-tsc-del" aria-label={`Remove ${c.label} card`} onClick={() => setCards(i, cards.filter((_, j) => j !== k))}><Trash2 size={13} /></button>
      </div>)}
      <div className="csb-sb-chips" role="group" aria-label="Add a card">{presets.map(l => <button key={l} type="button" onClick={() => setCards(i, [...cards, { label: l, text: l === 'Quote' ? 'Their exact words.' : `What this ${l.toLowerCase()} was.`, note: 'Why it mattered for the design.' }])}><Plus size={11} /> {l}</button>)}</div>
    </div>; })}
    <datalist id="csb-ivc-labels">{presets.map(l => <option key={l} value={l} />)}</datalist>
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
        <div className="csb-carousel-image" data-image-slot={`${section.id}:${index}`}>{item.image ? <Media src={item.image} alt={item.title} loading="lazy" /> : <div className="csb-carousel-empty"><strong>Screen {String(index + 1).padStart(2, '0')}</strong><span>Click to add an image or Figma frame</span></div>}</div>
        <figcaption><div><strong><EditableText field={`items.${index}.title`} value={item.title} /></strong><span><EditableText field={`items.${index}.detail`} value={item.detail} /></span></div><ChevronRight size={18} aria-hidden="true" /></figcaption>
      </motion.figure>)}
    </div>
  </div>;
}
