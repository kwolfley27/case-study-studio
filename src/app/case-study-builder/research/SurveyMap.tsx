import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isShown, type Question, type Response, type Study } from './research';

/*
  Survey map: the survey as a flowchart.
  Questions everyone sees run down the middle. Where a question has "Show only if" questions,
  the path splits into lanes (one per answer condition, plus "everyone else") that rejoin below.
  The bonus round is its own section. With responses, every node and lane shows real counts.
*/

type Node = { q: Question; n: number; lanes: Lane[] };
type Lane = { label: string; anyOf: string[]; nodes: Node[] };

const short = (p: string, max = 90) => (p.length > max ? `${p.slice(0, max - 1).trimEnd()}…` : p);
const answered = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v as object).some(Boolean));

function buildTree(questions: Question[], include: (q: Question) => boolean): Node[] {
  const index = new Map(questions.map((q, i) => [q.id, i]));
  const kids = new Map<string, Question[]>();
  const roots: Question[] = [];
  for (const q of questions) {
    if (!include(q)) continue;
    const src = q.showIf?.questionId && q.showIf.anyOf?.length ? q.showIf.questionId : '';
    // A condition on a question that isn't earlier in the survey can never be met here; show it as a normal step.
    if (src && index.has(src) && (index.get(src) ?? 0) < (index.get(q.id) ?? 0) && include(questions[index.get(src)!])) {
      kids.set(src, [...(kids.get(src) ?? []), q]);
    } else roots.push(q);
  }
  const make = (q: Question): Node => {
    const groups = new Map<string, Question[]>();
    for (const c of kids.get(q.id) ?? []) { const key = [...c.showIf!.anyOf].sort().join('\u0000'); groups.set(key, [...(groups.get(key) ?? []), c]); }
    const lanes = [...groups.entries()].map(([key, list]) => ({ label: key.split('\u0000').join(' or '), anyOf: key.split('\u0000'), nodes: list.map(make) }));
    return { q, n: (index.get(q.id) ?? 0) + 1, lanes };
  };
  return roots.map(make);
}

const TYPE: Partial<Record<Question['type'], string>> = { single: 'One choice', multi: 'Checkboxes', rank: 'Rank', scale: 'Scale', nps: 'NPS', text: 'Short answer', long: 'Talk or type', contact: 'Contact', schedule: 'Book a time', photo: 'Photo', note: 'Screen' };

export function SurveyMap({ study, responses, onPick }: { study: Study; responses?: Response[]; onPick?: (questionIndex: number) => void }) {
  const qs = study.questions;
  const core = useMemo(() => buildTree(qs, q => !q.bonus), [qs]);
  // Bonus questions that branch off a core question keep their condition, shown as a label.
  const bonus = useMemo(() => buildTree(qs, q => !!q.bonus), [qs]);
  const live = !!responses;
  const reached = (q: Question) => responses?.filter(r => isShown(q, r.answers as Record<string, unknown>) && (!q.bonus || r.part !== 'core')).length ?? 0;
  const got = (q: Question) => responses?.filter(r => answered(r.answers[q.id])).length ?? 0;
  const bonusTakers = responses?.filter(r => r.part !== 'core').length ?? 0;

  const LANE_COLORS = ['#2f8a55', '#9b59d0', '#c27a12', '#1f6fd1', '#c2410c'];
  const Card = ({ node, lane }: { node: Node; lane?: string }) => {
    const { q } = node;
    const opts = (q.type === 'single' || q.type === 'multi') && q.options?.length ? q.options : null;
    const total = got(q);
    return <div className={`sm-node ${lane ? 'in-lane' : ''} ${q.type === 'note' ? 'is-note' : ''}`}>
      <button type="button" className="sm-card" onClick={() => onPick?.(node.n - 1)} disabled={!onPick}>
        <span className="sm-num">{q.type === 'note' ? '·' : node.n}</span>
        <span className="sm-body">
          <span className="sm-q">{short(q.prompt)}</span>
          <span className="sm-tags">
            <em>{TYPE[q.type] ?? q.type}</em>
            {q.group && <em className="is-group">Group</em>}
            {!!q.followups && <em className="is-ai">AI ×{q.followups}{q.followIf?.length ? ' (some answers)' : ''}</em>}
            {!q.required && q.type !== 'note' && <em>Optional</em>}
            {live && q.type !== 'note' && <b>{total} answered</b>}
          </span>
          {live && q.group && opts && total > 0 && <span className="sm-buckets">{opts.map(o => { const c = responses!.filter(r => { const v = r.answers[q.id]; return Array.isArray(v) ? v.includes(o) : v === o; }).length; return <span key={o} className={c ? '' : 'is-zero'}>{short(o, 36)} <b>{c}</b></span>; })}</span>}
        </span>
      </button>
      {node.lanes.length > 0 && <Branch node={node} />}
    </div>;
  };

  const Branch = ({ node }: { node: Node }) => {
    const src = node.q;
    const srcCount = got(src);
    const pct = (c: number) => (srcCount ? ` · ${Math.round(c / srcCount * 100)}%` : '');
    const everyoneElse = live ? responses!.filter(r => answered(r.answers[src.id]) && !node.lanes.some(l => (Array.isArray(r.answers[src.id]) ? r.answers[src.id] as string[] : [r.answers[src.id]]).some(x => l.anyOf.includes(String(x))))).length : 0;
    return <div className="sm-split">
      <div className="sm-diamond" title={`Branches on Q${node.n}`}><span>Q{node.n}<small>which answer?</small></span></div>
      <div className="sm-lanes" style={{ gridTemplateColumns: `repeat(${node.lanes.length + 1}, max-content)` }}>
        {node.lanes.map((l, k) => { const color = LANE_COLORS[k % LANE_COLORS.length]; const c = live ? reached(l.nodes[0].q) : 0; return <div key={l.label} className="sm-lane" style={{ ['--lane' as string]: color }}>
          <span className="sm-lane-label">{short(l.label, 70)}{live && <b>{c} people{pct(c)}</b>}</span>
          {l.nodes.map(n => <Card key={n.q.id} node={n} lane={color} />)}
          <span className="sm-tail" aria-hidden="true" /><span className="sm-join" aria-hidden="true" />
        </div>; })}
        <div className="sm-lane is-skip" style={{ ['--lane' as string]: '#a59f97' }}>
          <span className="sm-lane-label">Everyone else{live && <b>{everyoneElse} people{pct(everyoneElse)}</b>}</span>
          <span className="sm-skipnote">skips ahead</span>
          <span className="sm-tail" aria-hidden="true" /><span className="sm-join" aria-hidden="true" />
        </div>
      </div>
    </div>;
  };

  return <Canvas><div className={`sm ${live ? 'is-live' : ''}`}>
    <div className="sm-start"><small>Start of survey</small>{live ? `${responses!.length} people` : short(qs[0]?.prompt ?? '', 60)}</div>
    {core.map(n => <Card key={n.q.id} node={n} />)}
    {bonus.length > 0 && <>
      <div className="sm-gate"><strong>Short version ends</strong><span>“Got a few more minutes?” offers the bonus round{live ? ` · ${bonusTakers} of ${responses!.length} kept going` : ''}</span></div>
      <div className="sm-bonus">
        {bonus.map(n => { const cond = n.q.showIf?.anyOf?.length ? qs.findIndex(x => x.id === n.q.showIf!.questionId) : -1; return <div key={n.q.id}>
          {cond >= 0 && n.lanes !== undefined && (qs[cond]?.bonus !== true) && <span className="sm-when is-inline">Only if Q{cond + 1} is “{short(n.q.showIf!.anyOf.join(' or '), 60)}”</span>}
          <Card node={n} />
        </div>; })}
      </div>
    </>}
    <div className="sm-start is-end">Survey complete</div>
  </div></Canvas>;
}

/* An infinite canvas: drag (or scroll) to pan, pinch or ⌘/Ctrl + scroll to zoom, Fit and Full screen. */
function Canvas({ children }: { children: React.ReactNode }) {
  const view = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0, k: 1 });
  const [full, setFull] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const clampK = (k: number) => Math.min(2, Math.max(0.2, k));
  const fit = () => {
    const v = view.current, c = content.current; if (!v || !c) return;
    const k = clampK(Math.min(1, (v.clientWidth - 48) / c.scrollWidth));
    setT({ k, x: (v.clientWidth - c.scrollWidth * k) / 2, y: 24 });
  };
  useLayoutEffect(fit, [full]);
  useEffect(() => { const on = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); }; addEventListener('keydown', on); return () => removeEventListener('keydown', on); }, []);
  const zoomAt = (k: number, cx: number, cy: number) => setT(p => { const nk = clampK(k); return { k: nk, x: cx - (cx - p.x) * (nk / p.k), y: cy - (cy - p.y) * (nk / p.k) }; });
  useEffect(() => {
    const v = view.current; if (!v) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = v.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) setT(p => { const nk = clampK(p.k * Math.exp(-e.deltaY * 0.01)); const cx = e.clientX - r.left, cy = e.clientY - r.top; return { k: nk, x: cx - (cx - p.x) * (nk / p.k), y: cy - (cy - p.y) * (nk / p.k) }; });
      else setT(p => ({ ...p, x: p.x - e.deltaX, y: p.y - e.deltaY }));
    };
    v.addEventListener('wheel', onWheel, { passive: false }); return () => v.removeEventListener('wheel', onWheel);
  }, []);
  return <div className={`sm-canvas ${full ? 'is-full' : ''}`}>
    <div ref={view} className="sm-view"
      onPointerDown={e => { if ((e.target as HTMLElement).closest('button')) return; drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={e => { const d = drag.current; if (d) setT(p => ({ ...p, x: d.tx + e.clientX - d.x, y: d.ty + e.clientY - d.y })); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div ref={content} className="sm-content" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}>{children}</div>
    </div>
    <div className="sm-tools" role="toolbar" aria-label="Map view">
      <button type="button" aria-label="Zoom out" onClick={() => { const v = view.current!; zoomAt(t.k / 1.25, v.clientWidth / 2, v.clientHeight / 2); }}>−</button>
      <span>{Math.round(t.k * 100)}%</span>
      <button type="button" aria-label="Zoom in" onClick={() => { const v = view.current!; zoomAt(t.k * 1.25, v.clientWidth / 2, v.clientHeight / 2); }}>+</button>
      <button type="button" onClick={fit}>Fit</button>
      <button type="button" onClick={() => setFull(f => !f)}>{full ? 'Exit full screen' : 'Full screen'}</button>
    </div>
    <p className="sm-help">Drag to move · pinch or ⌘ + scroll to zoom</p>
  </div>;
}
