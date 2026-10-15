import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { navLabelFor, type CaseStudySection } from './model';

/*
  Phase group: consecutive sections that share options.group become one phase.
  A small menu of the phase's steps pins to the top on the left while you read the phase and
  is pushed up and away when the phase ends (sticky inside the group). The current step is filled.
  Group title: the group name; *word* sets it in italic.
*/
const pad = (n: number) => String(n).padStart(2, '0');
export const groupTitle = (t: string) => t.split(/(\*[^*]+\*)/g).filter(Boolean).map((p, i) => p.startsWith('*') ? <em key={i}>{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>);

export function PhaseGroup({ title, sections, render }: { title: string; sections: CaseStudySection[]; render: (s: CaseStudySection) => ReactNode }) {
  const steps = useRef<Array<HTMLDivElement | null>>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const root = steps.current[0]?.closest('.csb-preview-viewport') as HTMLElement | null;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { const k = steps.current.indexOf(e.target as HTMLDivElement); if (k >= 0) setActive(k); } });
    }, { root, rootMargin: '-35% 0px -60% 0px' });
    steps.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [sections.length]);
  const go = (k: number) => steps.current[k]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const n = sections.length;
  return <div className="csb-phase">
    <aside className="csb-phase-nav" aria-label={title.replace(/\*/g, '')}>
      <p className="csb-phase-title">{groupTitle(title)}</p>
      <ol>{sections.map((s, k) => <li key={s.id}><button type="button" className={k === active ? 'is-on' : k < active ? 'is-past' : ''} aria-current={k === active ? 'step' : undefined} onClick={() => go(k)}>
        {k === active && <motion.i layoutId={`phase-pill-${sections[0].id}`} className="csb-phase-pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
        <b>{pad(k + 1)}</b><span>{navLabelFor(s) || s.title || `Step ${k + 1}`}</span></button></li>)}</ol>
    </aside>
    <div className="csb-phase-body">
      {sections.map((s, k) => <div key={s.id} className="csb-phase-step" style={{ ['--step' as string]: `"${pad(k + 1)} / ${pad(n)}"` }} ref={el => { steps.current[k] = el; }}>{render(s)}</div>)}
    </div>
  </div>;
}
