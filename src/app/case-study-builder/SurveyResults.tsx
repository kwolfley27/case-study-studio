import { motion } from 'motion/react';
import { useExpressive, useReducedMotion } from './MotionKit';
import { EditableText } from './EditableText';
import type { CaseStudySection, SurveyQuestion } from './model';
import { CountUp } from './MotionKit';

const percent = (count: number, answered: number) => answered ? Math.round(count / answered * 100) : 0;

function _ResponseBars({ question }: { question: SurveyQuestion }) {
  const reduce = useReducedMotion();
  const expressive = useExpressive();
  return <div className="csb-apple-survey-bars" role="img" aria-label={`${question.sourceName}. ${question.options.map(option => `${option.label}: ${percent(option.count, question.answered)} percent, ${option.count} of ${question.answered}`).join('; ')}`}>
    {question.options.slice(0, 6).map((option, index) => <div className="csb-apple-survey-bar" key={option.label}>
      <div><span>{option.label}</span><strong>{expressive ? <CountUp value={`${percent(option.count, question.answered)}%`} duration={1300} delay={index * 120} /> : `${percent(option.count, question.answered)}%`}</strong></div>
      <div className="csb-apple-survey-track"><motion.span initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: percent(option.count, question.answered) / 100 }} viewport={{ once: true, amount: .4 }} transition={expressive ? { type: 'spring', stiffness: 70, damping: 11, delay: index * .12 } : { duration: .8, delay: index * .1, ease: [0.2, 0.8, 0.2, 1] }} /></div>
      <small>{option.count} of {question.answered}</small>
    </div>)}
  </div>;
}

function _RankedAnswers({ question }: { question: SurveyQuestion }) {
  return <div className="csb-apple-survey-ranks">{[...question.options].sort((x, y) => y.count - x.count).slice(0, 6).map((option, index) => <motion.div key={option.label} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * .1 }}><span>{index + 1}</span><strong>{option.label}</strong><small>{option.count}/{question.answered}</small></motion.div>)}</div>;
}

/* Scale answers are labelled "1", "2 · Very easy"… keep them in order and chart them as columns. */
const scaleOf = (q: SurveyQuestion) => { const nums = q.options.map(o => Number(String(o.label).split(' · ')[0])); return nums.every(n => Number.isFinite(n)) && q.options.length >= 3 ? nums : null; };

function QuestionBlock({ section, question, index }: { section: CaseStudySection; question: SurveyQuestion; index: number }) {
  const reduce = useReducedMotion();
  const nums = scaleOf(question);
  const sorted = nums ? question.options.map((o, i) => ({ ...o, n: nums[i] })).sort((a, b) => a.n - b.n) : [...question.options].sort((a, b) => b.count - a.count);
  const total = question.answered || 1;
  const top = [...question.options].sort((a, b) => b.count - a.count)[0];
  const topPct = top ? percent(top.count, question.answered) : 0;
  const avg = nums ? sorted.reduce((s, o) => s + (o as { n: number }).n * o.count, 0) / Math.max(1, sorted.reduce((s, o) => s + o.count, 0)) : 0;
  const lo = nums ? Math.min(...nums) : 0, hi = nums ? Math.max(...nums) : 0;
  const maxPct = Math.max(1, ...sorted.map(o => percent(o.count, total)));
  const ends = nums ? [String(sorted[0].label).split(' · ')[1], String(sorted[sorted.length - 1].label).split(' · ')[1]] : [];
  return <motion.div className={`csb-sv-q ${nums ? 'is-scale' : ''}`} initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .6, delay: (index % 2) * .08, ease: [0.22, 1, 0.36, 1] }}>
    <h3><EditableText field={`items.${index}.title`} value={section.items[index]?.title || question.sourceName} /></h3>
    {nums
      ? <p className="csb-sv-lead"><strong><CountUp value={avg.toFixed(1)} duration={1200} /></strong><span>average, out of {hi}</span></p>
      : top && <p className="csb-sv-lead"><strong><CountUp value={`${topPct}%`} duration={1200} /></strong><span>chose “{top.label}”</span></p>}
    {nums ? <div className="csb-sv-cols" role="img" aria-label={`${question.sourceName}. Average ${avg.toFixed(1)} of ${hi}. ${sorted.map(o => `${String(o.label).split(' · ')[0]}: ${percent(o.count, total)} percent`).join('; ')}`}>
        <div className="csb-sv-plot">
          {sorted.map((o, k) => { const pct = percent(o.count, total); return <div key={o.label} className="csb-sv-col">
            <motion.em initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: .5 + k * .08 }}>{pct}%</motion.em>
            <motion.i style={{ height: `${Math.max(2, (pct / maxPct) * 100)}%` }} className={o.count === top?.count ? 'is-top' : ''} initial={reduce ? false : { scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, amount: .4 }} transition={{ type: 'spring', stiffness: 90, damping: 14, delay: .15 + k * .08 }} />
          </div>; })}
          <motion.span className="csb-sv-avg" style={{ left: `${((avg - lo) / Math.max(1, hi - lo)) * (100 - 100 / sorted.length) + 50 / sorted.length}%` }} initial={reduce ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: .9, duration: .5 }}><b>avg</b></motion.span>
        </div>
        <div className="csb-sv-axis">{sorted.map(o => <span key={o.label}>{String(o.label).split(' · ')[0]}</span>)}</div>
        {(ends[0] || ends[1]) && <div className="csb-sv-ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
      </div>
      : <div className="csb-sv-bars" role="img" aria-label={`${question.sourceName}. ${sorted.map(o => `${o.label}: ${percent(o.count, total)} percent`).join('; ')}`}>
        {sorted.slice(0, 7).map((o, k) => { const pct = percent(o.count, total); return <div key={o.label} className={`csb-sv-bar ${k === 0 ? 'is-top' : ''}`}>
          <span className="csb-sv-label">{o.label}</span><span className="csb-sv-pct">{pct}%</span>
          <span className="csb-sv-track"><motion.i initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: pct / 100 }} viewport={{ once: true, amount: .5 }} transition={{ type: 'spring', stiffness: 70, damping: 13, delay: .2 + k * .1 }} /></span>
        </div>; })}
      </div>}
    {section.items[index]?.detail && <p className="csb-sv-takeaway"><EditableText field={`items.${index}.detail`} value={section.items[index].detail} /></p>}
    <small className="csb-sv-n">{question.answered} answered{question.multiSelect ? ' · more than one answer allowed' : ''}</small>
  </motion.div>;
}

export function SurveyResults({ section }: { section: CaseStudySection }) {
  const source = section.surveySource;
  if (!source?.questions.length) return <div className="csb-survey-empty"><span>RESEARCH DATA</span><strong>Connect one of your surveys, or Google Forms</strong><p>Select this section, then choose a survey and its questions in the right-hand panel.</p></div>;
  return <div className={`csb-sv ${source.questions.length === 1 ? 'is-single' : ''}`}>
    <div className="csb-sv-grid">{source.questions.map((q, i) => <QuestionBlock key={`${q.sourceName}-${i}`} section={section} question={q} index={i} />)}</div>
    <p className="csb-survey-source-note">{source.studyTitle ? `Source: “${source.studyTitle}” survey` : 'Source: Google Forms responses'} · {source.totalResponses} response{source.totalResponses === 1 ? '' : 's'} · updated {new Date(source.updatedAt).toLocaleDateString()}</p>
  </div>;
}
