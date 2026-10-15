import { useMemo, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useSpring, useTransform } from 'motion/react';
import { useExpressive, useReducedMotion, useScrollProgress } from './MotionKit';
import { EditableText } from './EditableText';
import type { CaseStudySection } from './model';

/*
  Work timeline: one row per phase, one column per week.
  Each activity is an item { title, value: phase name, when: "2" or "1-2" }.
  Phases live on section.phases ({ title, detail: a short note }).
  Read it like a table: find the phase on the left, the week along the top.
*/

const ease = [0.22, 1, 0.36, 1] as const;

export function parseWhen(when?: string): [number, number] {
  const numbers = (when || '').match(/\d+/g)?.map(Number).filter(n => n > 0) ?? [];
  if (!numbers.length) return [1, 1];
  const start = numbers[0];
  const end = Math.max(start, numbers[numbers.length - 1]);
  return [start, Math.min(end, start + 23)];
}

export function timelinePhases(section: CaseStudySection) {
  const named = section.phases?.length ? section.phases : [];
  const extra = [...new Set(section.items.map(item => item.value?.trim()).filter((v): v is string => !!v))]
    .filter(name => !named.some(phase => phase.title.trim() === name))
    .map(title => ({ title, detail: '' }));
  return [...named, ...extra];
}

function useTimeline(section: CaseStudySection) {
  return useMemo(() => {
    const phases = timelinePhases(section);
    const activities = section.items.map((item, index) => {
      const [start, end] = parseWhen(item.when);
      const phase = Math.max(0, phases.findIndex(p => p.title.trim() === (item.value || '').trim()));
      return { item, index, start, end, phase };
    });
    const units = Math.max(1, ...activities.map(a => a.end));
    const lanes = (phases.length ? phases : [{ title: 'Phase', detail: '' }]).map((phase, i) => {
      // Stack activities inside the lane only when they overlap in time.
      const rowEnds: number[] = [];
      const chips = activities.filter(a => a.phase === i).sort((a, b) => a.start - b.start || a.index - b.index).map(a => {
        let row = rowEnds.findIndex(end => end < a.start);
        if (row === -1) { row = rowEnds.length; rowEnds.push(0); }
        rowEnds[row] = a.end;
        return { ...a, row };
      });
      return { phase, i, chips, rows: Math.max(1, rowEnds.length) };
    });
    return { units, lanes };
  }, [section]);
}

const tone = (phase: number) => ({ '--wt-tone': `color-mix(in srgb, var(--csb-accent) ${Math.max(52, 100 - phase * 14)}%, #1d1d1f)` } as React.CSSProperties);

export function WorkTimeline({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const { units, lanes } = useTimeline(section);
  const [active, setActive] = useState<number | null>(null);
  const unit = section.timeUnit?.trim() || 'Week';
  const range = (a: number, b: number) => a === b ? `${unit} ${a}` : `${unit}s ${a}–${b}`;
  // Expressive: a "now" line sweeps across the weeks as you scroll and lights up what it passes.
  const expressive = useExpressive();
  const wrap = useRef<HTMLDivElement>(null);
  const progress = useSpring(useScrollProgress(wrap, .8, .4), { stiffness: 110, damping: 24, restDelta: .001 });
  const sweepLeft = useTransform(progress, v => `${v * 100}%`);
  const [now, setNow] = useState(0);
  useMotionValueEvent(progress, 'change', v => { const next = Math.round(v * units * 8) / 8; setNow(n => n === next ? n : next); });
  const lit = (start: number) => !expressive || now >= start - 1 + .2;

  return <div ref={wrap} className={`csb-wt ${expressive ? 'is-sweep' : ''}`} style={{ '--wt-units': units } as React.CSSProperties} onMouseLeave={() => setActive(null)}>
    {expressive && <div className="csb-wt-sweep" aria-hidden="true"><motion.i style={{ left: sweepLeft }}><b>{unit} {Math.min(units, Math.max(1, Math.ceil(now)))}</b></motion.i></div>}
    <div className="csb-wt-heads" aria-hidden="true">
      <span />
      {Array.from({ length: units }, (_, i) => <motion.span key={i} initial={reduce ? false : { opacity: 0, y: -6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .45, delay: i * .06, ease }}>{unit} {i + 1}</motion.span>)}
    </div>
    {lanes.map(lane => <motion.div key={lane.i} className={`csb-wt-lane ${active !== null && active !== lane.i ? 'is-dim' : ''}`} style={{ gridTemplateRows: `repeat(${lane.rows}, auto)`, ...tone(lane.i) }} onMouseEnter={() => setActive(lane.i)}
      initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .6, delay: lane.i * .1, ease }}>
      <div className="csb-wt-label" style={{ gridRow: `1 / span ${lane.rows}` }}>
        <span className="csb-wt-num">{String(lane.i + 1).padStart(2, '0')}</span>
        <strong><EditableText field={`phases.${lane.i}.title`} value={lane.phase.title} /></strong>
        <p><EditableText field={`phases.${lane.i}.detail`} value={lane.phase.detail} /></p>
      </div>
      {Array.from({ length: units }, (_, w) => <span key={`c${w}`} className="csb-wt-cell" style={{ gridColumn: w + 2, gridRow: `1 / span ${lane.rows}` }} aria-hidden="true" />)}
      {lane.chips.map(chip => <motion.div key={chip.index} className={`csb-wt-chip ${lit(chip.start) ? '' : 'is-ahead'}`} style={{ gridColumn: `${chip.start + 1} / ${chip.end + 2}`, gridRow: chip.row + 1 }}
        initial={reduce ? false : { opacity: 0, scaleX: .5 }} whileInView={{ opacity: 1, scaleX: 1 }} viewport={{ once: true, amount: .4 }} transition={{ duration: .6, delay: .2 + (chip.start - 1) * .12 + chip.row * .05, ease }}>
        <EditableText field={`items.${chip.index}.title`} value={chip.item.title} />
        <small>{range(chip.start, chip.end)}</small>
      </motion.div>)}
      {!lane.chips.length && <span className="csb-wt-empty" style={{ gridColumn: `2 / span ${units}` }}>No activities in this phase yet</span>}
    </motion.div>)}
  </div>;
}
