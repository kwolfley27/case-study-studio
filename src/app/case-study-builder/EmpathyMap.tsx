import { useContext } from 'react';
import { motion } from 'motion/react';
import { EditableText, EditingContext } from './EditableText';
import { useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Empathy map: the user in the centre, four quadrants around them.
  items: 0 user (title name · detail context · image)
         1–4 quadrants (title label · detail notes, one per line · value icon key)
         5 pains, 6 gains (optional, item.hidden toggles)
  Presets: Says / Thinks / Does / Feels, or Sees / Hears / Says & does / Thinks & feels.
*/

export const EMPATHY_PRESETS = {
  classic: [['Says', 'says'], ['Thinks', 'thinks'], ['Does', 'does'], ['Feels', 'feels']],
  senses: [['Sees', 'sees'], ['Hears', 'hears'], ['Says & does', 'says'], ['Thinks & feels', 'thinks']],
} as const;

const Icon = ({ name }: { name?: string }) => {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    {name === 'says' && <><path {...p} d="M4 5.5h16v10H10l-4.5 3.5V15.5H4z" /><path {...p} d="M8 10h8M8 12.6h5" /></>}
    {name === 'thinks' && <><path {...p} d="M7.5 15.5a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.6 7.8 3.9 3.9 0 0 1 17 15.5z" /><circle {...p} cx="7" cy="18.5" r="1.2" /><circle {...p} cx="4.6" cy="21" r=".7" /></>}
    {name === 'does' && <><path {...p} d="M8.5 11V5.5a1.5 1.5 0 0 1 3 0V10" /><path {...p} d="M11.5 9.5V4a1.5 1.5 0 0 1 3 0v6" /><path {...p} d="M14.5 10V6a1.5 1.5 0 0 1 3 0v7.5a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-4.6-2.2L3.4 14a1.5 1.5 0 0 1 2.3-1.9l2.8 2.9V11" /></>}
    {name === 'feels' && <path {...p} d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />}
    {name === 'sees' && <><path {...p} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle {...p} cx="12" cy="12" r="3" /></>}
    {name === 'hears' && <><path {...p} d="M8 9a4 4 0 1 1 8 0c0 3-3 3.5-3 6.5a2.5 2.5 0 0 1-5 0" /><path {...p} d="M18.5 5.5a8 8 0 0 1 0 9M20.8 3.5a11 11 0 0 1 0 13" /></>}
    {name === 'pains' && <><circle {...p} cx="12" cy="12" r="8.5" /><path {...p} d="M8.5 15.5c2-1.8 5-1.8 7 0M9 9.5h.01M15 9.5h.01" /></>}
    {name === 'gains' && <><path {...p} d="M4 16l5-5 3.5 3.5L20 7" /><path {...p} d="M14.5 7H20v5.5" /></>}
  </svg>;
};

function Notes({ index, detail }: { index: number; detail: string }) {
  const { edit } = useContext(EditingContext);
  const raw = (detail || '').split('\n').map(l => l.trim());
  const lines = edit ? raw : raw.filter(Boolean);
  return <>
    <ul className="csb-em-notes">{lines.map((line, i) => <li key={i}><EditableText field={`items.${index}.detail.${i}`} value={line} /></li>)}</ul>
    {edit && <button type="button" className="csb-jm-add" onClick={e => { e.stopPropagation(); edit(`items.${index}.detail`, [...raw.filter(Boolean), 'New note'].join('\n')); }}>+ Add note</button>}
  </>;
}

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '•';

export function EmpathyMap({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const [user, ...rest] = section.items;
  const quads = rest.slice(0, 4);
  const pains = rest[4]; const gains = rest[5];
  const showRow = (item?: CaseStudySection['items'][number]) => item && !item.hidden;
  const enter = (i: number) => ({ initial: reduce ? false : { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .3 }, transition: { duration: .6, delay: .15 + i * .1, ease: [0.22, 1, 0.36, 1] as const } });
  return <div className="csb-em">
    <div className="csb-em-board">
      {quads.map((q, i) => <motion.div key={i} className={`csb-em-quad is-q${i + 1}`} {...enter(i)}>
        <div className="csb-em-label"><span className="csb-em-icon"><Icon name={q.value} /></span><strong><EditableText field={`items.${i + 1}.title`} value={q.title} /></strong></div>
        <Notes index={i + 1} detail={q.detail} />
      </motion.div>)}
      <div className="csb-em-center"><motion.div className="csb-em-user" initial={reduce ? false : { scale: .8, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        <div className="csb-em-avatar" data-image-slot={`${section.id}:0`}>{user?.image ? <img src={user.image} alt={`${user.title} portrait`} /> : <span>{initialsOf(user?.title || '')}</span>}</div>
        <strong><EditableText field="items.0.title" value={user?.title || 'User'} /></strong>
        <small><EditableText field="items.0.detail" value={user?.detail || ''} /></small>
      </motion.div></div>
    </div>
    {(showRow(pains) || showRow(gains)) && <div className="csb-em-pg">
      {showRow(pains) && <motion.div className="csb-em-pg-card is-pains" {...enter(4)}><div className="csb-em-label"><span className="csb-em-icon"><Icon name="pains" /></span><strong><EditableText field="items.5.title" value={pains!.title} /></strong></div><Notes index={5} detail={pains!.detail} /></motion.div>}
      {showRow(gains) && <motion.div className="csb-em-pg-card is-gains" {...enter(5)}><div className="csb-em-label"><span className="csb-em-icon"><Icon name="gains" /></span><strong><EditableText field="items.6.title" value={gains!.title} /></strong></div><Notes index={6} detail={gains!.detail} /></motion.div>}
    </div>}
  </div>;
}
