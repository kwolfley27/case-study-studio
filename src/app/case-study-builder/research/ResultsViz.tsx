import { useState } from 'react';
import { isShown, type Question, type QuestionResult, type Response, type Study } from './research';

/*
  Results charts, one form per kind of question:
  - one choice with Yes / No (or 2–3 answers): one split bar, part-to-whole
  - one choice / checkboxes: sorted bars, the top answer emphasized, the rest gray
  - slider / scale: a column per value, with the average marked
  - rank: a grid of how often each option landed in each place, sorted by average place
  - sliders that share the same scale ("How much of a pain is…"): one comparison chart
  Colors come from the validated reference palette (blue accent, orange second, gray rest).
*/

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
/** How many people were shown this question (after "Show only if"). */
export const sawCount = (q: Question, responses: Response[]) => responses.filter(r => isShown(q, r.answers as Record<string, unknown>) && (!q.bonus || r.part !== 'core')).length;

function Head({ q, answered, saw }: { q: Question; answered: number; saw: number }) {
  return <div className="rv-head"><h4>{q.prompt}</h4><span>{answered} answered{saw > answered ? ` · ${saw} saw it` : ''}{q.showIf ? ' · only some people were asked' : ''}</span></div>;
}

/** Hover readout shared by every chart: the label and its numbers. */
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const on = (text: string) => ({
    onMouseMove: (e: React.MouseEvent) => { const box = (e.currentTarget.closest('.rv') as HTMLElement).getBoundingClientRect(); setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text }); },
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent) => { const box = (e.currentTarget.closest('.rv') as HTMLElement).getBoundingClientRect(); const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left - box.left + r.width / 2, y: r.top - box.top, text }); },
    onBlur: () => setTip(null),
    tabIndex: 0, 'aria-label': text,
  });
  const el = tip && <div className="rv-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>;
  return { on, el };
}

/** Sorted horizontal bars. The top answer carries the accent; everything else is quiet gray. */
export function Bars({ rows, of, unit = 'people', multi }: { rows: Array<{ label: string; count: number }>; of: number; unit?: string; multi?: boolean }) {
  const { on, el } = useTip();
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map(r => r.count));
  return <div className="rv rv-bars">
    {sorted.map(r => <div key={r.label} className={`rv-bar ${r.count === sorted[0].count && r.count > 0 ? 'is-top' : ''} ${r.count ? '' : 'is-zero'}`} {...on(`${r.label}: ${r.count} of ${of} ${unit} (${pct(r.count, of)}%)`)}>
      <span className="rv-label">{r.label}</span>
      <span className="rv-track"><i style={{ width: `${(r.count / max) * 100}%` }} /></span>
      <span className="rv-val"><b>{pct(r.count, of)}%</b> · {r.count}</span>
    </div>)}
    {multi && <small className="rv-note">People could pick more than one, so these add up to more than 100%.</small>}
    {el}
  </div>;
}

/** One 100% bar for Yes / No style answers: part-to-whole at a glance. */
const SPLIT = ['var(--rv-1)', 'var(--rv-2)', 'var(--rv-gray)'];
function Split({ rows, of }: { rows: Array<{ label: string; count: number }>; of: number }) {
  const { on, el } = useTip();
  const total = rows.reduce((n, r) => n + r.count, 0) || 1;
  return <div className="rv rv-split">
    <div className="rv-split-bar">{rows.map((r, i) => r.count > 0 && <span key={r.label} style={{ flexGrow: r.count, background: SPLIT[i] }} {...on(`${r.label}: ${r.count} of ${of} (${pct(r.count, total)}%)`)} />)}</div>
    <div className="rv-legend">{rows.map((r, i) => <span key={r.label}><i style={{ background: SPLIT[i] }} />{r.label} <b>{pct(r.count, total)}%</b> <em>{r.count}</em></span>)}</div>
    {el}
  </div>;
}

/** A column per value with the average marked. Sliders and 1–5 scales. */
function Histogram({ q, dist, mean, answered }: { q: Question; dist: number[]; mean: number; answered: number }) {
  const { on, el } = useTip();
  const lo = q.min ?? 1, hi = q.max ?? (dist.length + lo - 1);
  const max = Math.max(1, ...dist);
  const sorted = dist.flatMap((c, k) => Array(c).fill(lo + k)); const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
  const at = (v: number) => ((v - lo) / (hi - lo + 1)) * 100 + 100 / (hi - lo + 1) / 2;
  return <div className="rv rv-hist">
    <div className="rv-hero"><strong>{answered ? mean.toFixed(1) : '–'}</strong><span>average out of {hi}{answered ? ` · middle answer ${median}` : ''}</span></div>
    <div className="rv-cols" style={{ gridTemplateColumns: `repeat(${dist.length}, 1fr)` }}>
      {dist.map((c, k) => <div key={k} className="rv-col" {...on(`${lo + k}: ${c} ${c === 1 ? 'person' : 'people'} (${pct(c, answered)}%)`)}><i style={{ height: `${(c / max) * 100}%` }} />{c > 0 && <em>{c}</em>}</div>)}
      {answered > 0 && <span className="rv-mean" style={{ left: `${at(mean)}%` }}><b>avg {mean.toFixed(1)}</b></span>}
    </div>
    <div className="rv-axis" style={{ gridTemplateColumns: `repeat(${dist.length}, 1fr)` }}>{dist.map((_, k) => <span key={k}>{lo + k}</span>)}</div>
    {(q.minLabel || q.maxLabel) && <div className="rv-ends"><span>{q.minLabel}</span><span>{q.maxLabel}</span></div>}
    {el}
  </div>;
}

/** Rank: how often each option landed in each place (darker = more people), sorted by average place. */
function RankGrid({ q, responses, items }: { q: Question; responses: Response[]; items: Array<{ label: string; avg: number; firsts: number }> }) {
  const { on, el } = useTip();
  const n = (q.options ?? []).length;
  const rows = items.map(it => ({ ...it, at: Array.from({ length: n }, (_, k) => responses.filter(r => Array.isArray(r.answers[q.id]) && (r.answers[q.id] as string[])[k] === it.label).length) }));
  const max = Math.max(1, ...rows.flatMap(r => r.at));
  return <div className="rv rv-rank">
    <div className="rv-rank-grid" style={{ gridTemplateColumns: `minmax(120px, 1.6fr) repeat(${n}, minmax(26px, 1fr)) 64px` }}>
      <span />{Array.from({ length: n }, (_, k) => <span key={k} className="rv-rank-h">{k === 0 ? '1st' : k === 1 ? '2nd' : k === 2 ? '3rd' : `${k + 1}th`}</span>)}<span className="rv-rank-h">avg</span>
      {rows.map((r, i) => <div key={r.label} className="rv-rank-row" style={{ display: 'contents' }}>
        <span className={`rv-label ${i === 0 ? 'is-top' : ''}`}>{r.label}</span>
        {r.at.map((c, k) => <span key={k} className={`rv-cell ${c / max > 0.55 ? 'is-dark' : ''}`} style={{ ['--a' as string]: String(c / max) }} {...on(`${r.label}: ranked ${k + 1} by ${c} ${c === 1 ? 'person' : 'people'}`)}>{c || ''}</span>)}
        <span className="rv-val"><b>{r.avg ? r.avg.toFixed(1) : '–'}</b></span>
      </div>)}
    </div>
    <small className="rv-note">Darker = more people put it in that place. Sorted by average place (1 = most important).</small>
    {el}
  </div>;
}

/** The chart that fits this question. */
export function QuestionViz({ r, responses }: { r: QuestionResult; responses: Response[] }) {
  const saw = sawCount(r.q, responses);
  if (r.kind === 'choice') {
    const yesNo = r.q.type === 'single' && (r.q.options ?? []).length <= 3 && (r.q.options ?? []).some(o => /^(yes|no)\b/i.test(o));
    return <><Head q={r.q} answered={r.answered} saw={saw} />{yesNo ? <Split rows={r.options} of={r.answered} /> : <Bars rows={r.options} of={r.answered} multi={r.q.type === 'multi'} />}</>;
  }
  if (r.kind === 'scale') return <><Head q={r.q} answered={r.answered} saw={saw} /><Histogram q={r.q} dist={r.dist} mean={r.mean} answered={r.answered} /></>;
  if (r.kind === 'rank') return <><Head q={r.q} answered={r.answered} saw={saw} /><RankGrid q={r.q} responses={responses} items={r.items} /></>;
  return null;
}
export const hasViz = (r: QuestionResult) => r.kind === 'choice' || r.kind === 'scale' || r.kind === 'rank';

/** Sliders asked on the same scale (like the pain sliders in each section), compared side by side. */
export function CompareScales({ study, results }: { study: Study; results: QuestionResult[] }) {
  const { on, el } = useTip();
  const scales = results.filter((r): r is Extract<QuestionResult, { kind: 'scale' }> => r.kind === 'scale' && !r.q.preset && r.answered > 0);
  const groups = new Map<string, typeof scales>();
  for (const r of scales) { const k = `${r.q.min ?? 1}-${r.q.max ?? 5}|${(r.q.minLabel ?? '').toLowerCase()}|${(r.q.maxLabel ?? '').toLowerCase()}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const sets = [...groups.values()].filter(g => g.length >= 2);
  if (!sets.length) return null;
  const sectionOf = (q: Question) => { let cur = ''; for (const x of study.questions) { if (x.type === 'section') cur = x.prompt; if (x.id === q.id) return cur; } return ''; };
  const name = (q: Question) => { const m = /pain is ([^?]+?)(?: for you)?\?/i.exec(q.prompt); return m ? m[1].replace(/^\w/, c => c.toUpperCase()) : sectionOf(q) || q.prompt; };
  return <>{sets.map((set, k) => { const hi = set[0].q.max ?? 5; const sorted = [...set].sort((a, b) => b.mean - a.mean); return <div key={k} className="rw-res">
    <div className="rv-head"><h4>{/pain/i.test(set[0].q.prompt) ? 'Which is the biggest pain?' : 'Side by side'}</h4><span>Average out of {hi} · {set[0].q.minLabel} → {set[0].q.maxLabel}</span></div>
    <div className="rv rv-bars rv-compare">
      {sorted.map((r, i) => <div key={r.q.id} className={`rv-bar ${i === 0 ? 'is-top' : ''}`} {...on(`${name(r.q)}: average ${r.mean.toFixed(1)} out of ${hi}, from ${r.answered} people`)}>
        <span className="rv-label">{name(r.q)}</span>
        <span className="rv-track"><i style={{ width: `${(r.mean / hi) * 100}%` }} /></span>
        <span className="rv-val"><b>{r.mean.toFixed(1)}</b></span>
      </div>)}
      {el}
    </div>
  </div>; })}</>;
}
