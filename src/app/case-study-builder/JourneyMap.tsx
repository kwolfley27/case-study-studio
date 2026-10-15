import { useContext, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useSpring } from 'motion/react';
import { EditableText, EditingContext } from './EditableText';
import { useExpressive, useReducedMotion, useScrollProgress } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  User journey map. Stages are columns; every row lines up under them.
  Rows can be switched on or off (section.options.row_<key>):
    scope (user · goal · scenario), actions, touchpoints, thoughts, emotion,
    pain points, opportunities, owner.
  The emotion curve has a neutral baseline with positive/negative zones, and
  each point sits exactly over its stage column.
*/

type Item = CaseStudySection['items'][number];
export const JOURNEY_ROWS: Array<{ key: 'actions' | 'touchpoints' | 'thoughts' | 'emotion' | 'pains' | 'opportunities' | 'owner'; label: string; hint: string; on: boolean }> = [
  { key: 'actions', label: 'Actions', hint: 'What they do', on: true },
  { key: 'touchpoints', label: 'Touchpoints', hint: 'Where it happens', on: false },
  { key: 'thoughts', label: 'Thoughts', hint: 'What they think', on: true },
  { key: 'emotion', label: 'Emotion', hint: 'How it feels', on: true },
  { key: 'pains', label: 'Pain points', hint: 'What gets in the way', on: true },
  { key: 'opportunities', label: 'Opportunities', hint: 'What we could improve', on: true },
  { key: 'owner', label: 'Owner', hint: 'Who leads this stage', on: false },
];
export const rowOn = (section: CaseStudySection, key: string) => { const v = section.options?.[`row_${key}`]; return v === undefined ? (key === 'scope' || (JOURNEY_ROWS.find(r => r.key === key)?.on ?? false)) : !!v; };

const sentiment = (v: number) => v >= 60 ? 'pos' : v <= 40 ? 'neg' : 'neu';
const Face = ({ mood }: { mood: 'pos' | 'neu' | 'neg' }) => <svg className={`csb-jm-face is-${mood}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
  <circle cx="12" cy="12" r="10.5" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="1.5" />
  <circle cx="8.6" cy="10" r="1.2" fill="currentColor" /><circle cx="15.4" cy="10" r="1.2" fill="currentColor" />
  {mood === 'pos' && <path d="M7.8 13.8q4.2 4 8.4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
  {mood === 'neu' && <path d="M8.2 15h7.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
  {mood === 'neg' && <path d="M7.8 16.4q4.2-3.8 8.4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
</svg>;

function Lines({ index, field, value, kind }: { index: number; field: keyof Item; value: string; kind: 'list' | 'chips' | 'quotes' | 'text' }) {
  const { edit } = useContext(EditingContext);
  const raw = (value || '').split('\n').map(l => l.trim());
  const lines = edit ? raw : raw.filter(Boolean);
  const add = (e: React.MouseEvent) => { e.stopPropagation(); edit?.(`items.${index}.${String(field)}`, [...raw.filter(Boolean), 'New'].join('\n')); };
  if (kind === 'text') return <p className="csb-jm-text"><EditableText field={`items.${index}.${String(field)}`} value={value || ''} /></p>;
  return <>
    <ul className={`csb-jm-${kind}`}>{lines.map((line, i) => <li key={i}><EditableText field={`items.${index}.${String(field)}.${i}`} value={line} /></li>)}</ul>
    {edit && <button type="button" className="csb-jm-add" onClick={add}>+ Add</button>}
  </>;
}

const Y = (v: number) => 110 - Math.min(100, Math.max(0, v));
function curve(values: number[]) {
  const pts = values.map((v, i) => ({ x: i * 100 + 50, y: Y(v) }));
  return pts.reduce((d, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${d} C ${(pts[i - 1].x + p.x) / 2} ${pts[i - 1].y}, ${(pts[i - 1].x + p.x) / 2} ${p.y}, ${p.x} ${p.y}`, '');
}

export function JourneyMap({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  // In the editor everything shows at once (no scroll reveal), so it's easy to edit.
  const editing = !!useContext(EditingContext).edit;
  const expressive = useExpressive() && !editing;
  const stages = section.items.slice(0, 6);
  const n = Math.max(1, stages.length);
  const values = stages.map(s => Number(s.value) || 50);
  const lowest = values.indexOf(Math.min(...values));
  const o = section.options ?? {};
  const wrap = useRef<HTMLDivElement>(null);
  const progress = useSpring(useScrollProgress(wrap, .9, .45), { stiffness: 120, damping: 24, restDelta: .001 });
  const [reached, setReached] = useState(expressive ? -1 : n);
  useMotionValueEvent(progress, 'change', v => { if (!expressive) return; const k = v <= .01 ? -1 : Math.min(n - 1, Math.floor(v * n + .15)); setReached(r => r === k ? r : k); });
  const show = (i: number) => !expressive || reached >= i;
  const d = curve(values);
  const W = n * 100;
  const rows = JOURNEY_ROWS.filter(r => rowOn(section, r.key));
  const cell = (i: number, children: React.ReactNode, cls = '') => <div key={i} className={`csb-jm-cell ${cls} ${show(i) ? 'is-in' : ''}`}>{children}</div>;

  return <div ref={wrap} className="csb-jm-scroll">
    <div className="csb-jm" style={{ '--jm-n': n } as React.CSSProperties}>
      {rowOn(section, 'scope') && <div className="csb-jm-scope">
        {([['user', 'User'], ['goal', 'Goal'], ['scenario', 'Scenario']] as const).map(([k, label]) => <div key={k}><small>{label}</small><p><EditableText field={`options.${k}`} value={String(o[k] ?? ({ user: 'New member, first week', goal: 'Book a class that fits their schedule', scenario: 'On their phone, between meetings' } as Record<string, string>)[k])} /></p></div>)}
      </div>}

      <div className="csb-jm-label csb-jm-label-phase"><strong>Stages</strong></div>
      {stages.map((s, i) => cell(i, <><small>{String(i + 1).padStart(2, '0')}</small><h3><EditableText field={`items.${i}.title`} value={s.title} /></h3></>, `csb-jm-stage ${i === 0 ? 'is-first' : ''}`))}

      {rows.map(row => row.key === 'emotion'
        ? <div key="emotion" className="csb-jm-emotion" style={{ gridColumn: '1 / -1' }}>
            <div className="csb-jm-label"><strong>{row.label}</strong></div>
            <div className="csb-jm-chart">
              <div className="csb-jm-scale" aria-hidden="true"><span style={{ top: `${Y(80) / 120 * 100}%` }}>Positive</span><span style={{ top: "50%" }}>Neutral</span><span style={{ top: `${Y(20) / 120 * 100}%` }}>Negative</span></div>
              <svg viewBox={`0 0 ${W} 120`} preserveAspectRatio="none" role="img" aria-label={`Emotion across stages: ${stages.map((s, i) => `${s.title} ${values[i]} of 100`).join(', ')}`}>
                <defs>
                  <clipPath id={`jm-up-${section.id}`}><rect x="0" y="0" width={W} height="60" /></clipPath>
                  <clipPath id={`jm-down-${section.id}`}><rect x="0" y="60" width={W} height="60" /></clipPath>
                </defs>
                <rect x="0" y="0" width={W} height="40" className="csb-jm-zone is-pos" />
                <rect x="0" y="80" width={W} height="40" className="csb-jm-zone is-neg" />
                {Array.from({ length: n - 1 }, (_, i) => <line key={i} x1={(i + 1) * 100} x2={(i + 1) * 100} y1="0" y2="120" className="csb-jm-col" vectorEffect="non-scaling-stroke" />)}
                <line x1="0" x2={W} y1="60" y2="60" className="csb-jm-base" vectorEffect="non-scaling-stroke" />
                {editing ? <path d={d} className="csb-jm-line" vectorEffect="non-scaling-stroke" /> : expressive ? <motion.path d={d} className="csb-jm-line" vectorEffect="non-scaling-stroke" style={{ pathLength: progress }} />
                  : <motion.path d={d} className="csb-jm-line" vectorEffect="non-scaling-stroke" initial={reduce || editing ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true, amount: .4 }} transition={{ duration: 1.3, ease: 'easeInOut' }} />}
              </svg>
              {values.map((v, i) => <motion.div key={i} className={`csb-jm-point is-${sentiment(v)} ${i === lowest ? 'is-lowest' : ''}`} style={{ left: `${(i + .5) / n * 100}%`, top: `${Y(v) / 120 * 100}%` }} initial={false} animate={{ opacity: show(i) ? 1 : 0, scale: show(i) ? 1 : .6 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}>
                <Face mood={sentiment(v) as 'pos' | 'neu' | 'neg'} />
                <span className="csb-jm-dot" />
                <span className="csb-jm-word"><EditableText field={`items.${i}.detail`} value={(stages[i].detail || '').split(/\s+[·—–-]\s+/)[0]} /></span>
              </motion.div>)}
            </div>
          </div>
        : <div key={row.key} className={`csb-jm-row is-${row.key}`} style={{ gridColumn: '1 / -1' }}>
            <div className="csb-jm-label"><strong>{row.label}</strong><small>{row.hint}</small></div>
            {stages.map((s, i) => cell(i, <Lines index={i} field={row.key as keyof Item} value={String((s as Record<string, unknown>)[row.key] ?? '')} kind={row.key === 'touchpoints' ? 'chips' : row.key === 'thoughts' ? 'quotes' : row.key === 'owner' ? 'text' : 'list'} />))}
          </div>)}
    </div>
  </div>;
}
