import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EditableText } from './EditableText';
import type { CaseStudySection } from './model';

/*
  Work timeline: what you did, week by week, grouped into phases.
  Each activity is an item { title, value: phase name, when: "2" or "1-2" }.
  Phases live on section.phases ({ title, detail: one note per line }).
  Activities that start in the same week cascade down and across the column;
  phase bars span the weeks their activities cover.
*/

const ease = [0.22, 1, 0.36, 1] as const;
const SUB = 8; // sub-columns per time unit, used for the cascading stagger

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
    // Rows: first row whose last activity ends before this one starts.
    const rowEnds: number[] = [];
    const byStart = [...activities].sort((a, b) => a.start - b.start || a.index - b.index);
    const placed = byStart.map(activity => {
      let row = rowEnds.findIndex(end => end < activity.start);
      if (row === -1) { row = rowEnds.length; rowEnds.push(0); }
      rowEnds[row] = activity.end;
      return { ...activity, row };
    });
    // Stagger single-unit activities that share a start across the column.
    const groups = new Map<number, typeof placed>();
    for (const a of placed) if (a.start === a.end) groups.set(a.start, [...(groups.get(a.start) ?? []), a]);
    const chips = placed.map(a => {
      if (a.start !== a.end) return { ...a, col: (a.start - 1) * SUB + 1, span: (a.end - a.start + 1) * SUB };
      const group = groups.get(a.start)!; const k = group.indexOf(a); const n = group.length;
      // Lone chips use most of their column; groups cascade. Long timelines
      // (narrow columns) use wider chips with a smaller step.
      const span = n === 1 ? (units >= 5 ? SUB : SUB - 2) : units >= 5 ? 6 : 5;
      const shift = n === 1 ? (SUB - span) / 2 : Math.round(k * (SUB - span) / (n - 1));
      return { ...a, col: (a.start - 1) * SUB + 1 + shift, span };
    });
    // Phase bars span the units their activities cover; overlapping bars stack.
    const bars = phases.map((phase, i) => {
      const own = activities.filter(a => a.phase === i);
      const start = own.length ? Math.min(...own.map(a => a.start)) : 1;
      const end = own.length ? Math.max(...own.map(a => a.end)) : units;
      return { phase, i, start, end };
    });
    const barRows: number[] = [];
    const placedBars = bars.map(bar => {
      let row = barRows.findIndex(end => end < bar.start);
      if (row === -1) { row = barRows.length; barRows.push(0); }
      barRows[row] = bar.end;
      return { ...bar, row };
    });
    return { phases, chips, units, rows: Math.max(1, rowEnds.length), bars: placedBars };
  }, [section]);
}

const tone = (phase: number) => ({ '--wt-tone': `color-mix(in srgb, var(--csb-accent) ${Math.max(46, 100 - phase * 18)}%, #1d1d1f)` } as React.CSSProperties);

export function WorkTimeline({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const { chips, units, rows, bars } = useTimeline(section);
  const [active, setActive] = useState<number | null>(null);
  const unit = section.timeUnit?.trim() || 'Week';
  const unitLabel = (n: number) => `${unit} ${n}`;
  const dim = (phase: number) => active !== null && active !== phase;
  const order = [...chips].sort((a, b) => a.start - b.start || a.row - b.row);

  return <div className="csb-wt" style={{ '--wt-units': units, '--wt-rows': rows, '--wt-sub': SUB } as React.CSSProperties} onMouseLeave={() => setActive(null)}>
    {/* Desktop: week columns with cascading activity chips */}
    <div className="csb-wt-board" aria-hidden={false}>
      <div className="csb-wt-heads">{Array.from({ length: units }, (_, i) => <motion.div key={i} className="csb-wt-head" initial={reduce ? false : { opacity: 0, y: -8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .6 }} transition={{ duration: .5, delay: i * .08, ease }}><i /><span>{unitLabel(i + 1)}</span></motion.div>)}</div>
      <div className="csb-wt-grid">
        {Array.from({ length: units }, (_, i) => <motion.span key={i} className="csb-wt-band" style={{ gridColumn: `${i * SUB + 1} / span ${SUB}`, gridRow: `1 / ${rows + 1}` }} initial={reduce ? false : { scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .7, delay: i * .08, ease }} />)}
        {chips.map(chip => <motion.div key={chip.index} className={`csb-wt-chip ${dim(chip.phase) ? 'is-dim' : ''}`} style={{ gridColumn: `${chip.col} / span ${chip.span}`, gridRow: chip.row + 1, ...tone(chip.phase) }}
          initial={reduce ? false : { opacity: 0, y: 14, scale: .96 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .55, delay: .25 + order.indexOf(chip) * .06, ease }}
          onMouseEnter={() => setActive(chip.phase)}>
          <EditableText field={`items.${chip.index}.title`} value={chip.item.title} />
        </motion.div>)}
      </div>
      <div className="csb-wt-phases">{bars.map(bar => <div key={bar.i} className={`csb-wt-phase ${dim(bar.i) ? 'is-dim' : ''}`} style={{ gridColumn: `${bar.start} / ${bar.end + 1}`, gridRow: bar.row + 1, ...tone(bar.i) }} onMouseEnter={() => setActive(bar.i)}>
        <motion.div className="csb-wt-bar" initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .8, delay: .5 + bar.i * .15, ease }}>
          <span>{String(bar.i + 1).padStart(2, '0')}</span><strong><EditableText field={`phases.${bar.i}.title`} value={bar.phase.title} /></strong>
        </motion.div>
        <motion.p initial={reduce ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .5, delay: .8 + bar.i * .15 }}><EditableText field={`phases.${bar.i}.detail`} value={bar.phase.detail} /></motion.p>
      </div>)}</div>
    </div>

    {/* Narrow screens: a vertical list, one time unit at a time */}
    <ol className="csb-wt-list">{Array.from({ length: units }, (_, u) => {
      const here = chips.filter(c => c.start === u + 1).sort((a, b) => a.row - b.row);
      if (!here.length) return null;
      return <li key={u}><span className="csb-wt-list-unit">{unitLabel(u + 1)}{here.some(c => c.end > c.start) ? '+' : ''}</span><div>{here.map(chip => <span key={chip.index} className="csb-wt-chip" style={tone(chip.phase)}><EditableText field={`items.${chip.index}.title`} value={chip.item.title} />{chip.end > chip.start && <small> · {unit.toLowerCase()}s {chip.start}–{chip.end}</small>}</span>)}</div></li>;
    })}</ol>
  </div>;
}
