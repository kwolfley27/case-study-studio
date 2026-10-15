import { motion } from 'motion/react';
import { EditableText } from './EditableText';
import { useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Problem statement as one clear sentence:
    [who] [need a way to] [need] [because] [insight].
  The filled-in parts are highlighted; the connecting words are editable too.
  Optional: a "How might we…" question and a success measure.
  items: 0 who · 1 need (title = connector) · 2 insight (title = connector)
         3 How might we · 4 success (hidden toggles them off)
*/
const connector = (title: string | undefined, fallback: string) => {
  const t = (title || '').trim();
  if (!t || /^needs?$/i.test(t)) return fallback === 'because' ? 'because' : 'need a way to';
  if (/^because$/i.test(t)) return 'because';
  return t;
};

export function ProblemStatement({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const [who, need, why, hmw, success] = section.items;
  const mark = (index: number, value: string) => <motion.mark className="csb-ps-mark" initial={reduce ? false : { backgroundSize: '0% 38%' }} whileInView={{ backgroundSize: '100% 38%' }} viewport={{ once: true, amount: .8 }} transition={{ duration: .8, delay: .25 + index * .35, ease: [0.22, 1, 0.36, 1] }}><EditableText field={`items.${index}.detail`} value={value} /></motion.mark>;
  return <div className="csb-ps">
    <motion.p className="csb-ps-sentence" initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}>
      {mark(0, who?.detail || '')}{' '}
      <EditableText field="items.1.title" value={connector(need?.title, 'need')} />{' '}
      {mark(1, need?.detail || '')}{' '}
      <EditableText field="items.2.title" value={connector(why?.title, 'because')} />{' '}
      {mark(2, why?.detail || '')}.
    </motion.p>
    {((hmw && !hmw.hidden) || (success && !success.hidden)) && <div className="csb-ps-extras">
      {hmw && !hmw.hidden && <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .6, delay: .9 }}><small><EditableText field="items.3.title" value={hmw.title || 'How might we'} /></small><p><EditableText field="items.3.detail" value={hmw.detail} /></p></motion.div>}
      {success && !success.hidden && <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .6, delay: 1.05 }}><small><EditableText field="items.4.title" value={success.title || "We'll know it worked when"} /></small><p><EditableText field="items.4.detail" value={success.detail} /></p></motion.div>}
    </div>}
  </div>;
}
