import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText } from './EditableText';
import { easeOut, useExpressive, useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Jobs to be done.
  1 · The job statement as one editorial sentence: "When [who] are trying to [job] in situations where [scenario], they struggle to [challenge]."
  2 · Each job, the tool people hire for it today, why they hire it, and what gets in the way.
*/
export type JTBDRow = { job: string; tool: string; reason: string; barrier: string };
export type JTBDData = { statement: { audience: string; job: string; scenario: string; challenge: string }; showStatement?: boolean; cols: [string, string, string, string]; rows: JTBDRow[] };
export const defaultJTBD = (): JTBDData => ({
  statement: { audience: 'shift workers', job: 'fit a class around a schedule that changes weekly', scenario: 'they only know their hours a few days ahead', challenge: 'find an open spot without calling the studio' },
  showStatement: true,
  cols: ['Job', 'Tool hired today', 'Why they hire it', 'What gets in the way'],
  rows: [
    { job: 'Know what’s open right now', tool: 'Calling the front desk', reason: 'The only source that’s always current', barrier: 'Desk is busy at peak times' },
    { job: 'Hold a spot before a shift', tool: 'Paper sign-up sheet', reason: 'Fast, and friends can add each other', barrier: 'Only works if you’re in the building' },
    { job: 'Plan the week’s workouts', tool: 'Phone calendar', reason: 'Already where their shifts live', barrier: 'Class times have to be copied by hand' },
  ],
});

export function JobsToBeDone({ section }: { section: CaseStudySection }) {
  const data = section.jtbd ?? defaultJTBD();
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const sRef = useRef<HTMLParagraphElement>(null); const tRef = useRef<HTMLDivElement>(null);
  const sIn = useInView(sRef, { once: true, amount: .6 }) || reduce || !expressive;
  const tIn = useInView(tRef, { once: true, amount: .2 }) || reduce || !expressive;
  const parts: Array<[string, keyof JTBDData['statement'] | null]> = [['When ', null], ['audience', 'audience'], [' are trying to ', null], ['job', 'job'], [' in situations where ', null], ['scenario', 'scenario'], [', they struggle to ', null], ['challenge', 'challenge'], ['.', null]];
  let slot = 0;
  return <div className="csb-jtbd">
    {data.showStatement !== false && <p ref={sRef} className="csb-jtbd-statement">
      {parts.map(([text, key], i) => {
        if (!key) return <span key={i} className="csb-jtbd-glue">{text}</span>;
        const k = slot++;
        return <motion.span key={i} className="csb-jtbd-slot" initial={false} animate={{ opacity: sIn ? 1 : 0 }} transition={{ duration: .5, delay: expressive ? .15 + k * .32 : 0, ease: easeOut }}
          style={{ backgroundSize: sIn ? '100% 1.5px' : '0% 1.5px', transitionDelay: `${expressive ? .35 + k * .32 : 0}s` }}><EditableText field={`deep:jtbd.statement.${key}`} value={data.statement[key]} /></motion.span>;
      })}
    </p>}
    <div ref={tRef} className="csb-jtbd-table" role="table" aria-label="Jobs to be done">
      <div className="csb-jtbd-row is-head" role="row">{data.cols.map((c, i) => <span key={i} role="columnheader"><EditableText field={`deep:jtbd.cols.${i}`} value={c} /></span>)}</div>
      {data.rows.map((r, i) => <motion.div key={i} className="csb-jtbd-row" role="row" initial={false} animate={{ opacity: tIn ? 1 : 0, y: tIn ? 0 : 12 }} transition={{ duration: .5, delay: expressive ? .1 + i * .12 : 0, ease: easeOut }}>
        <span role="cell" className="csb-jtbd-job"><i>{String(i + 1).padStart(2, '0')}</i><EditableText field={`deep:jtbd.rows.${i}.job`} value={r.job} /></span>
        <span role="cell" className="csb-jtbd-tool"><EditableText field={`deep:jtbd.rows.${i}.tool`} value={r.tool} />
          <motion.b aria-hidden="true" initial={false} animate={{ scaleX: tIn ? 1 : 0 }} transition={{ duration: .5, delay: expressive ? .45 + i * .12 : 0, ease: easeOut }} /></span>
        <span role="cell" className="csb-jtbd-reason"><EditableText field={`deep:jtbd.rows.${i}.reason`} value={r.reason} /></span>
        <span role="cell" className="csb-jtbd-barrier"><EditableText field={`deep:jtbd.rows.${i}.barrier`} value={r.barrier} /></span>
      </motion.div>)}
    </div>
  </div>;
}

export function JTBDControls({ section, onChange }: { section: CaseStudySection; onChange: (d: JTBDData) => void }) {
  const data = section.jtbd ?? defaultJTBD();
  const set = (p: Partial<JTBDData>) => onChange({ ...data, ...p });
  return <div className="csb-connection-section csb-fc-ctl">
    <label className="csb-check-field"><input type="checkbox" checked={data.showStatement !== false} onChange={e => set({ showStatement: e.target.checked })} /> Show the job statement</label>
    <p className="csb-field-note">Click any words on the page to edit them, including the four highlighted parts of the statement.</p>
    <p className="csb-panel-kicker">Jobs</p>
    {data.rows.map((r, i) => <div key={i} className="csb-fc-ctl-line">
      <input value={r.job} aria-label={`Job ${i + 1}`} onChange={e => set({ rows: data.rows.map((x, k) => k === i ? { ...x, job: e.target.value } : x) })} />
      <button type="button" className="csb-icon-button" aria-label={`Remove ${r.job}`} disabled={data.rows.length < 2} onClick={() => set({ rows: data.rows.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
    </div>)}
    <button type="button" className="csb-quiet-button" disabled={data.rows.length >= 8} onClick={() => set({ rows: [...data.rows, { job: 'New job', tool: 'What they use today', reason: 'Why it works for them', barrier: 'What gets in the way' }] })}><Plus size={13} /> Add job</button>
  </div>;
}
