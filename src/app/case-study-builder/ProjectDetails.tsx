import { useContext } from 'react';
import { motion } from 'motion/react';
import { useReducedMotion } from './MotionKit';
import { EditableText, EditingContext } from './EditableText';
import type { CaseStudySection } from './model';

/*
  Project details: role, timeline, team and anything else that frames the work.
  Each detail is an item { title: label, detail: value }. item.hidden hides it
  without deleting it. The Team detail lists people one per line
  ("Name — Role"); when item.value === 'solo' it shows a solo project instead.
*/

export const detailPresets: Array<{ label: string; item: CaseStudySection['items'][number] }> = [
  { label: 'My role', item: { title: 'My role', detail: 'Product designer — research, UX and UI' } },
  { label: 'Timeline', item: { title: 'Timeline', detail: '6 weeks · Summer 2026' } },
  { label: 'Team', item: { title: 'Team', detail: 'Me — Product designer\nAlex Kim — Product manager\nSam Lee — Engineer' } },
  { label: 'Tools', item: { title: 'Tools', detail: 'Figma, Notion, Maze' } },
  { label: 'Platform', item: { title: 'Platform', detail: 'iOS and web' } },
  { label: 'Deliverables', item: { title: 'Deliverables', detail: 'Research report, prototype, UI kit' } },
  { label: 'Client', item: { title: 'Client', detail: 'Company or course' } },
  { label: 'Methods', item: { title: 'Methods', detail: 'Interviews, usability testing, card sorting' } },
  { label: 'Outcome', item: { title: 'Outcome', detail: 'What changed because of this work' } },
  { label: 'Custom', item: { title: 'Label', detail: 'Value' } },
];

export const isTeam = (item: CaseStudySection['items'][number]) => /^team\b|collaborat/i.test(item.title.trim());
const initials = (name: string) => name.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '•';

/* One quiet row: label above value, hairlines top and bottom. The team is a small stack of
   initials with the names; roles show on hover (and in the editor as editable lines). */
export function ProjectDetails({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const { edit } = useContext(EditingContext);
  const shown = section.items.map((item, index) => ({ item, index })).filter(({ item }) => !item.hidden);
  return <dl className="csb-details">
    {shown.map(({ item, index }, k) => {
      const team = isTeam(item);
      const solo = team && item.value === 'solo';
      const raw = team && !solo ? item.detail.split('\n').map(line => line.trim()) : [];
      const people = raw.filter(Boolean).map(line => { const [name, role] = line.split(/\s+[—–-]\s+/); return { name: name.trim(), role: role?.trim() }; });
      return <motion.div key={index} className={`csb-detail ${team ? 'is-team' : ''}`} initial={reduce ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .5, delay: k * .05, ease: [0.22, 1, 0.36, 1] }}>
        <dt><EditableText field={`items.${index}.title`} value={item.title} /></dt>
        <dd>
          {solo ? <EditableText field={`items.${index}.detail`} value={item.detail || 'Solo project'} />
            : team && edit ? <ul className="csb-detail-edit">{raw.map((line, i) => <li key={i}><EditableText field={`items.${index}.detail.${i}`} value={line} /></li>)}
              <li><button type="button" className="csb-persona-add" onClick={e => { e.stopPropagation(); edit(`items.${index}.detail`, [...raw.filter(Boolean), 'Name — Role'].join('\n')); }}>+ Add person</button></li></ul>
            : team ? <span className="csb-detail-team">
                <span className="csb-detail-faces" aria-hidden="true">{people.slice(0, 4).map((p, i) => <i key={i} title={p.role ? `${p.name}, ${p.role}` : p.name}>{initials(p.name)}</i>)}</span>
                <span>{people.map((p, i) => <span key={i} title={p.role}>{p.name}{i < people.length - 1 ? ', ' : ''}</span>)}</span>
              </span>
            : <EditableText field={`items.${index}.detail`} value={item.detail} />}
        </dd>
      </motion.div>;
    })}
  </dl>;
}
