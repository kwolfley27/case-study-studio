import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isShown, newQuestion, hasOptions, canFollowUp, QUESTION_TYPES, type Question, type Response, type Study } from './research';

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

const TYPE: Partial<Record<Question['type'], string>> = { single: 'One choice', multi: 'Checkboxes', rank: 'Rank', scale: 'Scale', nps: 'NPS', text: 'Short answer', long: 'Talk or type', contact: 'Contact', schedule: 'Book a time', photo: 'Photo', note: 'Screen', section: 'Section' };

/* What the + menu can add. "Yes / No" is a one-choice question with those two answers, ready to branch on. */
const ADD_TYPES: Array<[string, string]> = [['yesno', 'Yes / No'], ['single', 'One choice'], ['multi', 'Checkboxes'], ['slider', 'Slider 1–10'], ['long', 'Talk or type'], ['text', 'Short answer'], ['section', 'Section']];
const make = (kind: string): Question => {
  if (kind === 'yesno') return { ...newQuestion('single'), prompt: 'New yes / no question', options: ['Yes', 'No'] };
  if (kind === 'slider') return { ...newQuestion('scale'), prompt: 'New slider question', min: 1, max: 10, minLabel: 'Not at all', maxLabel: 'Very', slider: true };
  if (kind === 'section') return { ...newQuestion('section'), prompt: 'New section' };
  const q = newQuestion(kind as Question['type']); return { ...q, prompt: kind === 'long' ? 'Tell me about the last time you…' : 'New question' };
};
type AddAt = { key: string; pos: number; showIf?: Question['showIf']; bonus?: boolean };

export function SurveyMap({ study, responses, onPick, onChange }: { study: Study; responses?: Response[]; onPick?: (questionIndex: number) => void; /** Edit right on the map: + adds a question to a path, click a card to edit it. */ onChange?: (questions: Question[]) => void }) {
  const qs = study.questions;
  const edit = !!onChange && !responses;
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const index = new Map(qs.map((q, i) => [q.id, i]));
  const subtree = (n: Node): string[] => [n.q.id, ...n.lanes.flatMap(l => l.nodes.flatMap(subtree))];
  const endOf = (n: Node) => Math.max(...subtree(n).map(id => index.get(id) ?? 0));
  const add = (at: AddAt, kind: string) => {
    const q = { ...make(kind), ...(at.showIf ? { showIf: at.showIf } : {}), ...(at.bonus ? { bonus: true } : {}) };
    onChange!([...qs.slice(0, at.pos), q, ...qs.slice(at.pos)]); setMenu(null); setSel(q.id);
  };
  /** A + button: adds a question at this spot on the map. */
  const Plus = ({ at, label }: { at: AddAt; label?: string }) => !edit ? null : <div className={`sm-plus ${menu === at.key ? 'is-open' : ''}`}>
    <button type="button" className="sm-plus-btn" aria-label={label ?? 'Add a question here'} title={label ?? 'Add a question here'} onClick={() => setMenu(m => m === at.key ? null : at.key)}>+</button>
    {menu === at.key && <div className="sm-plus-menu" role="menu">{label && <small>{label}</small>}{ADD_TYPES.map(([k, l]) => <button key={k} type="button" role="menuitem" onClick={() => add(at, k)}>{l}</button>)}</div>}
  </div>;
  /** Split a choice question into lanes: one new question per answer. */
  const branch = (n: Node) => {
    const opts = (n.q.options ?? []).filter(o => !n.lanes.some(l => l.anyOf.includes(o)));
    const added = opts.map(o => ({ ...make('yesno'), prompt: `New question for “${o}”`, showIf: { questionId: n.q.id, anyOf: [o] }, ...(n.q.bonus ? { bonus: true } : {}) }));
    const pos = endOf(n) + 1; onChange!([...qs.slice(0, pos), ...added, ...qs.slice(pos)]); if (added[0]) setSel(added[0].id);
  };
  const remove = (id: string) => {
    const gone = new Set([id]); let grew = true;
    while (grew) { grew = false; for (const q of qs) if (q.showIf && gone.has(q.showIf.questionId) && !gone.has(q.id)) { gone.add(q.id); grew = true; } }
    if (gone.size > 1 && !window.confirm(`Delete this question and the ${gone.size - 1} question${gone.size === 2 ? '' : 's'} on its branches?`)) return;
    onChange!(qs.filter(q => !gone.has(q.id))); setSel(null);
  };
  const setQ = (id: string, patch: Partial<Question>) => onChange!(qs.map(q => q.id === id ? { ...q, ...patch } : q));
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
    return <div className={`sm-node ${lane ? 'in-lane' : ''} ${q.type === 'note' ? 'is-note' : ''} ${q.type === 'section' ? 'is-section' : ''}`}>
      <button type="button" className={`sm-card ${edit && sel === q.id ? 'is-sel' : ''}`} onClick={() => edit ? setSel(q.id) : onPick?.(node.n - 1)} disabled={!onPick && !edit}>
        <span className="sm-num">{q.type === 'note' ? '·' : q.type === 'section' ? '§' : node.n}</span>
        <span className="sm-body">
          <span className="sm-q">{short(q.prompt)}</span>
          <span className="sm-tags">
            <em>{TYPE[q.type] ?? q.type}</em>
            {q.group && <em className="is-group">Group</em>}
            {!!q.followups && <em className="is-ai">AI ×{q.followups}{q.followIf?.length ? ' (some answers)' : ''}</em>}
            {!q.required && q.type !== 'note' && q.type !== 'section' && <em>Optional</em>}
            {live && q.type !== 'note' && q.type !== 'section' && <b>{total} answered</b>}
          </span>
          {live && q.group && opts && total > 0 && <span className="sm-buckets">{opts.map(o => { const c = responses!.filter(r => { const v = r.answers[q.id]; return Array.isArray(v) ? v.includes(o) : v === o; }).length; return <span key={o} className={c ? '' : 'is-zero'}>{short(o, 36)} <b>{c}</b></span>; })}</span>}
        </span>
      </button>
      {node.lanes.length > 0 ? <Branch node={node} /> : edit && opts && sel === q.id && <button type="button" className="sm-branch-btn" onClick={() => branch(node)}>Branch on the answer</button>}
      {node.lanes.length > 0 && edit && opts && opts.some(o => !node.lanes.some(l => l.anyOf.includes(o))) && null}
    </div>;
  };
  /** A node and, below it, the + that adds the next question on the same path. */
  const Step = ({ node, lane }: { node: Node; lane?: string }) => <>
    <Card node={node} lane={lane} />
    <Plus at={{ key: `after-${node.q.id}`, pos: endOf(node) + 1, showIf: node.q.showIf, bonus: node.q.bonus }} label={lane ? 'Add to this path' : 'Add a question everyone sees'} />
  </>;

  const Branch = ({ node }: { node: Node }) => {
    const src = node.q;
    const srcCount = got(src);
    const pct = (c: number) => (srcCount ? ` · ${Math.round(c / srcCount * 100)}%` : '');
    // Answers no lane covers. For a one-choice question where every answer has its own lane, there's no "everyone else".
    const rest = src.type === 'single' && src.options?.length ? src.options.filter(o => !node.lanes.some(l => l.anyOf.includes(o))) : ['Everyone else'];
    const everyoneElse = live ? responses!.filter(r => answered(r.answers[src.id]) && !node.lanes.some(l => (Array.isArray(r.answers[src.id]) ? r.answers[src.id] as string[] : [r.answers[src.id]]).some(x => l.anyOf.includes(String(x))))).length : 0;
    return <div className="sm-split">
      <div className="sm-diamond" title={`Branches on Q${node.n}`}><span>Q{node.n}<small>which answer?</small></span></div>
      <div className="sm-lanes" style={{ gridTemplateColumns: `repeat(${node.lanes.length + (rest.length ? 1 : 0)}, max-content)` }}>
        {node.lanes.map((l, k) => { const color = LANE_COLORS[k % LANE_COLORS.length]; const c = live ? reached(l.nodes[0].q) : 0; return <div key={l.label} className="sm-lane" style={{ ['--lane' as string]: color }}>
          <span className="sm-lane-label">{short(l.label, 70)}{live && <b>{c} people{pct(c)}</b>}</span>
          {l.nodes.map(n => <Step key={n.q.id} node={n} lane={color} />)}
          <span className="sm-tail" aria-hidden="true" /><span className="sm-join" aria-hidden="true" />
        </div>; })}
        {rest.length > 0 && <div className="sm-lane is-skip" style={{ ['--lane' as string]: '#a59f97' }}>
          <span className="sm-lane-label">{src.type === 'single' && src.options?.length ? short(rest.join(' or '), 70) : 'Everyone else'}{live && <b>{everyoneElse} people{pct(everyoneElse)}</b>}</span>
          <span className="sm-skipnote">skips ahead</span>
          {edit && src.type === 'single' && <Plus at={{ key: `lane-${src.id}`, pos: endOf(node) + 1, showIf: { questionId: src.id, anyOf: rest }, bonus: src.bonus }} label={`Add a question for “${short(rest.join(' or '), 40)}”`} />}
          <span className="sm-tail" aria-hidden="true" /><span className="sm-join" aria-hidden="true" />
        </div>}
      </div>
    </div>;
  };

  const selQ = edit && sel ? qs.find(q => q.id === sel) : undefined;
  const selNode = selQ ? (function find(list: Node[]): Node | undefined { for (const n of list) { if (n.q.id === selQ.id) return n; for (const l of n.lanes) { const f = find(l.nodes); if (f) return f; } } })([...core, ...bonus]) : undefined;
  const drawer = selQ && <aside className="sm-drawer" aria-label="Edit question" onKeyDown={e => { if (e.key === 'Escape') setSel(null); }}>
    <div className="sm-drawer-head"><strong>{selQ.type === 'section' ? 'Section' : `Question ${(index.get(selQ.id) ?? 0) + 1}`}</strong><button type="button" aria-label="Close" onClick={() => setSel(null)}>×</button></div>
    <select value={selQ.type} aria-label="Question type" onChange={e => { const t = e.target.value as Question['type']; const base = newQuestion(t); setQ(selQ.id, { type: t, options: hasOptions(base) ? (selQ.options?.length ? selQ.options : base.options) : undefined, min: base.min, max: base.max, minLabel: base.minLabel, maxLabel: base.maxLabel, contact: base.contact, slider: undefined }); }}>{QUESTION_TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}</select>
    <textarea rows={3} value={selQ.prompt} aria-label="Question" autoFocus onChange={e => setQ(selQ.id, { prompt: e.target.value })} />
    <input value={selQ.hint ?? ''} placeholder={selQ.type === 'section' ? 'One line under the title (optional)' : 'Helper text (optional)'} aria-label="Helper text" onChange={e => setQ(selQ.id, { hint: e.target.value || undefined })} />
    {hasOptions(selQ) && <div className="sm-drawer-opts">{(selQ.options ?? []).map((o, k) => <div key={k}><input value={o} aria-label={`Answer ${k + 1}`} onChange={e => { const old = selQ.options![k]; const v = e.target.value; onChange!(qs.map(q => q.id === selQ.id ? { ...q, options: q.options!.map((x, j) => j === k ? v : x) } : q.showIf?.questionId === selQ.id ? { ...q, showIf: { ...q.showIf, anyOf: q.showIf.anyOf.map(x => x === old ? v : x) } } : q)); }} /><button type="button" aria-label={`Remove answer ${k + 1}`} onClick={() => setQ(selQ.id, { options: selQ.options!.filter((_, j) => j !== k) })}>×</button></div>)}
      <button type="button" className="sm-drawer-link" onClick={() => setQ(selQ.id, { options: [...(selQ.options ?? []), `Answer ${(selQ.options?.length ?? 0) + 1}`] })}>+ Add answer</button></div>}
    {selQ.type === 'scale' && <div className="sm-drawer-row"><input value={selQ.minLabel ?? ''} placeholder="Low label" aria-label="Low label" onChange={e => setQ(selQ.id, { minLabel: e.target.value })} /><input value={selQ.maxLabel ?? ''} placeholder="High label" aria-label="High label" onChange={e => setQ(selQ.id, { maxLabel: e.target.value })} /></div>}
    {canFollowUp(selQ) && <div className="sm-drawer-row"><span>AI follow-ups</span><div className="sm-seg">{[0, 1, 2].map(v => <button key={v} type="button" aria-pressed={(selQ.followups ?? 0) === v} onClick={() => setQ(selQ.id, { followups: v || undefined })}>{v ? `Up to ${v}` : 'Off'}</button>)}</div></div>}
    <div className="sm-drawer-row">{selQ.type !== 'section' && selQ.type !== 'note' && <label><input type="checkbox" checked={!!selQ.required} onChange={e => setQ(selQ.id, { required: e.target.checked })} /> Required</label>}
      {selQ.type === 'scale' && <label><input type="checkbox" checked={!!selQ.slider} onChange={e => setQ(selQ.id, { slider: e.target.checked || undefined })} /> Slider</label>}</div>
    {selNode && hasOptions(selQ) && selQ.type !== 'rank' && (selQ.options ?? []).some(o => !selNode.lanes.some(l => l.anyOf.includes(o))) && <button type="button" className="sm-drawer-btn" onClick={() => branch(selNode)}>{selNode.lanes.length ? 'Add paths for the other answers' : 'Branch on the answer'}</button>}
    <div className="sm-drawer-foot">{onPick && <button type="button" className="sm-drawer-link" onClick={() => onPick(index.get(selQ.id) ?? 0)}>All settings</button>}<button type="button" className="sm-drawer-del" onClick={() => remove(selQ.id)}>Delete</button></div>
  </aside>;
  return <Canvas overlay={drawer} onBackground={() => { setSel(null); setMenu(null); }}><div className={`sm ${live ? 'is-live' : ''} ${edit ? 'is-edit' : ''}`}>
    <div className="sm-start"><small>Start of survey</small>{live ? `${responses!.length} people` : short(study.title || qs[0]?.prompt || '', 60)}</div>
    <Plus at={{ key: 'start', pos: 0 }} label="Add a question at the start" />
    {core.map(n => <Step key={n.q.id} node={n} />)}
    {!core.length && edit && <p className="sm-empty">Tap + to add your first question.</p>}
    {bonus.length > 0 && <>
      <div className="sm-gate"><strong>Short version ends</strong><span>“Got a few more minutes?” offers the bonus round{live ? ` · ${bonusTakers} of ${responses!.length} kept going` : ''}</span></div>
      <div className="sm-bonus">
        {bonus.map(n => { const cond = n.q.showIf?.anyOf?.length ? qs.findIndex(x => x.id === n.q.showIf!.questionId) : -1; return <div key={n.q.id}>
          {cond >= 0 && n.lanes !== undefined && (qs[cond]?.bonus !== true) && <span className="sm-when is-inline">Only if Q{cond + 1} is “{short(n.q.showIf!.anyOf.join(' or '), 60)}”</span>}
          <Step node={n} />
        </div>; })}
      </div>
    </>}
    <div className="sm-start is-end">Survey complete</div>
  </div></Canvas>;
}

/* An infinite canvas: drag (or scroll) to pan, pinch or ⌘/Ctrl + scroll to zoom, Fit and Full screen. */
function Canvas({ children, overlay, onBackground }: { children: React.ReactNode; overlay?: React.ReactNode; onBackground?: () => void }) {
  const view = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0, k: 1 });
  const [full, setFull] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const moved = useRef(false);
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
      onPointerDown={e => { if ((e.target as HTMLElement).closest('button, input, textarea, select')) return; drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }; moved.current = false; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={e => { const d = drag.current; if (d) { if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) moved.current = true; setT(p => ({ ...p, x: d.tx + e.clientX - d.x, y: d.ty + e.clientY - d.y })); } }}
      onPointerUp={() => { if (drag.current && !moved.current) onBackground?.(); drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div ref={content} className="sm-content" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}>{children}</div>
    </div>
    <div className="sm-tools" role="toolbar" aria-label="Map view">
      <button type="button" aria-label="Zoom out" onClick={() => { const v = view.current!; zoomAt(t.k / 1.25, v.clientWidth / 2, v.clientHeight / 2); }}>−</button>
      <span>{Math.round(t.k * 100)}%</span>
      <button type="button" aria-label="Zoom in" onClick={() => { const v = view.current!; zoomAt(t.k * 1.25, v.clientWidth / 2, v.clientHeight / 2); }}>+</button>
      <button type="button" onClick={fit}>Fit</button>
      <button type="button" onClick={() => setFull(f => !f)}>{full ? 'Exit full screen' : 'Full screen'}</button>
    </div>
    {overlay}
    <p className="sm-help">Drag to move · pinch or ⌘ + scroll to zoom{onBackground ? ' · + adds a question to that path' : ''}</p>
  </div>;
}
