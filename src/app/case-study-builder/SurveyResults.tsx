import { motion, useReducedMotion } from 'motion/react';
import { EditableText } from './EditableText';
import type { CaseStudySection, SurveyQuestion } from './model';

const percent = (count: number, answered: number) => answered ? Math.round(count / answered * 100) : 0;

function ResponseBars({ question }: { question: SurveyQuestion }) {
  const reduce = useReducedMotion();
  return <div className="csb-apple-survey-bars" role="img" aria-label={`${question.sourceName}. ${question.options.map(option => `${option.label}: ${percent(option.count, question.answered)} percent, ${option.count} of ${question.answered}`).join('; ')}`}>
    {question.options.slice(0, 6).map((option, index) => <div className="csb-apple-survey-bar" key={option.label}>
      <div><span>{option.label}</span><strong>{percent(option.count, question.answered)}%</strong></div>
      <div className="csb-apple-survey-track"><motion.span initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: percent(option.count, question.answered) / 100 }} viewport={{ once: true, amount: .4 }} transition={{ duration: .8, delay: index * .1, ease: [0.2, 0.8, 0.2, 1] }} /></div>
      <small>{option.count} of {question.answered}</small>
    </div>)}
  </div>;
}

function RankedAnswers({ question }: { question: SurveyQuestion }) {
  return <div className="csb-apple-survey-ranks">{question.options.slice(0, 6).map((option, index) => <motion.div key={option.label} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * .1 }}><span>{index + 1}</span><strong>{option.label}</strong><small>{option.count}/{question.answered}</small></motion.div>)}</div>;
}

export function SurveyResults({ section }: { section: CaseStudySection }) {
  const source = section.surveySource;
  if (!source?.questions.length) return <div className="csb-survey-empty"><span>RESEARCH DATA</span><strong>Connect a Google Forms response Sheet or import a CSV</strong><p>Choose your questions in the inspector. Counts and percentages will appear here.</p></div>;
  const lead = source.questions[0];
  const top = lead.options[0];
  const leadPercent = top ? percent(top.count, lead.answered) : 0;
  const filledDots = Math.round(leadPercent / 4);
  const detailQuestion = source.questions[1] || lead;
  const rankQuestion = source.questions[2] || detailQuestion;
  return <div className="csb-apple-survey">
    <div className="csb-apple-survey-feature">
      <div><motion.strong initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .65 }}>{leadPercent}%</motion.strong><p><EditableText field="items.0.title" value={section.items[0]?.title || lead.sourceName} /></p><small>{top?.label} · {top?.count} of {lead.answered} respondents</small></div>
      <div className="csb-apple-pictogram" role="img" aria-label={`${filledDots} of 25 dots highlighted to represent ${leadPercent} percent`}>{Array.from({ length: 25 }, (_, index) => <motion.i key={index} className={index < filledDots ? 'is-filled' : ''} initial={{ opacity: 0, scale: .4 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: index * .025, duration: .3 }} />)}</div>
    </div>
    <div className="csb-apple-survey-detail">
      <div><h3><EditableText field={`items.${source.questions[1] ? 1 : 0}.title`} value={section.items[source.questions[1] ? 1 : 0]?.title || detailQuestion.sourceName} /></h3><ResponseBars question={detailQuestion} /></div>
      <div><h3>{rankQuestion === detailQuestion ? 'Most common responses' : <EditableText field="items.2.title" value={section.items[2]?.title || rankQuestion.sourceName} />}</h3><RankedAnswers question={rankQuestion} /></div>
    </div>
    {source.questions.map((question, index) => section.items[index]?.detail && <p className="csb-apple-survey-takeaway" key={question.sourceName}><EditableText field={`items.${index}.detail`} value={section.items[index].detail} /></p>)}
    <p className="csb-survey-source-note">Source: Google Forms responses · {source.totalResponses} total · {lead.answered} answered the lead question · updated {new Date(source.updatedAt).toLocaleDateString()}{source.questions.some(question => question.multiSelect) ? ' · multiple answers allowed on some questions' : ''}</p>
  </div>;
}
