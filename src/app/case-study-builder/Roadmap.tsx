import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useTransform } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { easeOut, useExpressive, useReducedMotion, useScrollProgress } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  Roadmap: a PM-style sprint plan. Months over weeks, one row per team (lane),
  cards that span weeks, breaks, and milestones (the big one in ink).
  On the published page a wide roadmap pins and slides sideways as you scroll,
  while a thin line under the weeks draws the passage of time.
*/
export type RoadmapCard = { id: string; lane: string; week: number; span: number; title: string; bullets: string[] };
export type RoadmapData = { start: string; weeks: number; lanes: Array<{ id: string; title: string }>; cards: RoadmapCard[]; milestones: Array<{ id: string; week: number; label: string; major?: boolean }>; breaks: number[] };

const rid = () => crypto.randomUUID().slice(0, 8);
export const defaultRoadmap = (): RoadmapData => ({
  start: '2025-10-06', weeks: 15,
  lanes: [{ id: 'design', title: 'Design' }, { id: 'dev', title: 'Development' }, { id: 'pm', title: 'Planning' }],
  cards: [
    { id: rid(), lane: 'pm', week: 0, span: 1, title: 'First sprint', bullets: ['Team intros', 'Set up the GitHub'] },
    { id: rid(), lane: 'design', week: 0, span: 1, title: 'MVP scope', bullets: ['Go over MVP details', 'Draft research questions'] },
    { id: rid(), lane: 'design', week: 1, span: 1, title: 'User research', bullets: ['Send out the survey', 'Finish interviews'] },
    { id: rid(), lane: 'design', week: 2, span: 1, title: 'Design system', bullets: ['Lo-fi listings', 'Hi-fi listings + prototype'] },
    { id: rid(), lane: 'dev', week: 2, span: 1, title: 'Tech stack', bullets: ['Get set up', 'Starter tasks'] },
    { id: rid(), lane: 'design', week: 3, span: 1, title: 'Profile + posting', bullets: ['User journey', 'Hi-fi profile', 'Posting prototype'] },
    { id: rid(), lane: 'dev', week: 3, span: 1, title: 'Listings page', bullets: ['Code the listings page'] },
    { id: rid(), lane: 'pm', week: 3, span: 1, title: 'Timeline + specs', bullets: ['Finalize MVP specs', 'Dev pairings'] },
    { id: rid(), lane: 'design', week: 4, span: 1, title: 'Posting flow', bullets: ['Finalize posting', 'Account page'] },
    { id: rid(), lane: 'dev', week: 4, span: 1, title: 'Posting', bullets: ['Code posting', 'Finalize listings'] },
    { id: rid(), lane: 'design', week: 5, span: 1, title: 'Home page', bullets: ['Lo/hi-fi home', 'Start final prototype'] },
    { id: rid(), lane: 'dev', week: 5, span: 2, title: 'Account + polish', bullets: ['Account page', 'Get existing pages working perfectly'] },
    { id: rid(), lane: 'pm', week: 5, span: 1, title: 'Showcase prep', bullets: ['Start prepping'] },
    { id: rid(), lane: 'design', week: 6, span: 1, title: 'Final prototype', bullets: ['Edit pages', 'Finalize for showcase'] },
    { id: rid(), lane: 'pm', week: 9, span: 2, title: 'Research + outreach', bullets: ['Test the final prototype', 'Outreach for launch'] },
  ],
  milestones: [{ id: rid(), week: 8, label: 'Final showcase' }, { id: rid(), week: 14, label: 'MVP release', major: true }],
  breaks: [11, 12, 13],
});

const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y || 2025, (m || 1) - 1, d || 1); };
const weekDate = (data: RoadmapData, i: number) => { const d = parse(data.start); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + i * 7); };
const short = (d: Date) => `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
const monthName = (d: Date) => d.toLocaleString('en-US', { month: 'long' });

export function Roadmap({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const data = section.roadmap ?? defaultRoadmap();
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const weeks = Math.max(1, Math.min(52, data.weeks));
  const months = useMemo(() => { const out: Array<{ name: string; from: number; span: number }> = []; for (let i = 0; i < weeks; i++) { const name = monthName(weekDate(data, i)); const last = out[out.length - 1]; if (last && last.name === name) last.span++; else out.push({ name, from: i, span: 1 }); } return out; }, [data.start, weeks]);
  const save = (next: RoadmapData) => edit?.('json:roadmap', JSON.stringify(next));

  // Pinned sideways scroll on the published page when the plan is wider than the screen.
  const wrap = useRef<HTMLDivElement>(null); const track = useRef<HTMLDivElement>(null); const stage = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<{ overflow: number; top: number; h: number } | null>(null);
  const canPin = !editorMode && expressive;
  useLayoutEffect(() => {
    if (!canPin) { setPin(null); return; }
    const measure = () => {
      const t = track.current, s = stage.current; if (!t || !s) return;
      const scroller = s.closest('.csb-preview-viewport') as HTMLElement | null; const vh = scroller ? scroller.clientHeight : window.innerHeight;
      const overflow = t.scrollWidth - s.clientWidth; const h = t.offsetHeight;
      setPin(overflow > 40 && h < vh * .9 ? { overflow, top: Math.max(24, (vh - h) / 2), h } : null);
    };
    measure(); const ro = new ResizeObserver(measure); if (track.current) ro.observe(track.current); if (stage.current) ro.observe(stage.current);
    return () => ro.disconnect();
  }, [canPin, weeks, data.cards.length, data.lanes.length]);
  const vh = typeof window === 'undefined' ? 800 : ((stage.current?.closest('.csb-preview-viewport') as HTMLElement | null)?.clientHeight ?? window.innerHeight);
  const p = useScrollProgress(pin ? wrap : track, pin ? pin.top / vh : .85, pin ? (pin.top + pin.h) / vh : .3);
  const x = useTransform(p, v => pin ? -v * pin.overflow : 0);
  const line = useTransform(p, v => reduce ? 1 : v);
  const back = useTransform(x, v => -v); // lane names stay put while the weeks slide
  const [reached, setReached] = useState(reduce || !expressive ? weeks : 0);
  useMotionValueEvent(p, 'change', v => { if (expressive && !reduce) setReached(r => Math.max(r, Math.ceil(v * weeks + (pin ? 1.5 : 3)))); });
  useEffect(() => { if (!expressive || reduce || editorMode) setReached(weeks); }, [expressive, reduce, editorMode, weeks]);

  // Drag a card to move it (and drag its right edge to change how many weeks it spans).
  const drag = useRef<{ id: string; mode: 'move' | 'span'; x0: number; y0: number; week: number; span: number; lane: number; col: number; row: number } | null>(null);
  const [ghost, setGhost] = useState<{ id: string; week: number; span: number; lane: number } | null>(null);
  const startDrag = (e: React.PointerEvent, card: RoadmapCard, mode: 'move' | 'span') => {
    if (!editorMode || (e.target as HTMLElement).closest('[contenteditable=true]') && mode === 'move') return;
    const grid = track.current; if (!grid) return;
    const col = (grid.querySelector('.csb-rm-week') as HTMLElement | null)?.offsetWidth ?? 160;
    const row = (grid.querySelector('.csb-rm-lane') as HTMLElement | null)?.offsetHeight ?? 160;
    drag.current = { id: card.id, mode, x0: e.clientX, y0: e.clientY, week: card.week, span: card.span, lane: data.lanes.findIndex(l => l.id === card.lane), col, row };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dw = Math.round((e.clientX - d.x0) / d.col), dl = Math.round((e.clientY - d.y0) / d.row);
    setGhost(d.mode === 'move' ? { id: d.id, week: Math.max(0, Math.min(weeks - d.span, d.week + dw)), span: d.span, lane: Math.max(0, Math.min(data.lanes.length - 1, d.lane + dl)) } : { id: d.id, week: d.week, span: Math.max(1, Math.min(weeks - d.week, d.span + dw)), lane: d.lane });
  };
  const endDrag = () => {
    const d = drag.current; drag.current = null;
    if (d && ghost && ghost.id === d.id) save({ ...data, cards: data.cards.map(c => c.id === d.id ? { ...c, week: ghost.week, span: ghost.span, lane: data.lanes[ghost.lane]?.id ?? c.lane } : c) });
    setGhost(null);
  };
  const addCard = (lane: string, week: number) => save({ ...data, cards: [...data.cards, { id: rid(), lane, week, span: 1, title: 'New work', bullets: ['What happens this week'] }] });

  const cols = `var(--rm-lane-w) repeat(${weeks}, var(--rm-col))`;
  const grid = <div ref={track} className="csb-rm-grid" style={{ gridTemplateColumns: cols }} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
    {/* months */}
    <div className="csb-rm-corner" style={{ gridRow: '1 / 3' }} />
    {months.map(m => <div key={`${m.name}-${m.from}`} className="csb-rm-month" style={{ gridColumn: `${m.from + 2} / span ${m.span}` }}>{m.name}</div>)}
    {/* weeks + time line */}
    {Array.from({ length: weeks }, (_, i) => { const d = weekDate(data, i); const off = data.breaks.includes(i); return <div key={i} className={`csb-rm-week ${off ? 'is-off' : ''}`} style={{ gridColumn: i + 2, gridRow: 2 }}><span>{short(d)}</span>{off && <em>Break</em>}</div>; })}
    <div className="csb-rm-time" style={{ gridColumn: `2 / span ${weeks}`, gridRow: 2 }} aria-hidden="true"><motion.i style={{ scaleX: line }} /></div>
    {/* break bands + milestones behind the lanes */}
    {data.breaks.filter(w => w < weeks).map(w => <div key={`b${w}`} className="csb-rm-break" style={{ gridColumn: w + 2, gridRow: `3 / span ${data.lanes.length + 1}` }} aria-hidden="true" />)}
    {data.milestones.filter(m => m.week < weeks).map((m, i) => <motion.div key={m.id} className={`csb-rm-milestone ${m.major ? 'is-major' : ''}`} style={{ gridColumn: m.week + 2, gridRow: `3 / span ${data.lanes.length + 1}` }}
      initial={false} animate={{ opacity: m.week < reached ? 1 : 0, y: m.week < reached ? 0 : 8 }} transition={{ duration: .5, ease: easeOut }}>
      <span><EditableText field={`deep:roadmap.milestones.${i}.label`} value={m.label} /></span>
    </motion.div>)}
    {/* lanes */}
    {data.lanes.map((lane, li) => <div key={lane.id} className="csb-rm-lane" style={{ gridRow: li + 4, gridColumn: `1 / span ${weeks + 1}`, gridTemplateColumns: cols }}>
      <motion.div className="csb-rm-lane-name" style={pin ? { x: back } : undefined}><EditableText field={`deep:roadmap.lanes.${li}.title`} value={lane.title} /></motion.div>
      {editorMode && Array.from({ length: weeks }, (_, w) => w).filter(w => !data.cards.some(c => c.lane === lane.id && w >= c.week && w < c.week + c.span)).map(w => <button key={`add${w}`} type="button" className="csb-rm-add" style={{ gridColumn: w + 2, gridRow: 1 }} aria-label={`Add work to ${lane.title}, week ${w + 1}`} onClick={() => addCard(lane.id, w)}><Plus size={14} /></button>)}
      {data.cards.map((c, ci) => ({ c, ci })).sort((a, b) => a.c.week - b.c.week).filter(({ c }) => (ghost?.id === c.id ? data.lanes[ghost.lane]?.id : c.lane) === lane.id).map(({ c, ci }) => {
        const g = ghost?.id === c.id ? ghost : null; const week = g?.week ?? c.week, span = g?.span ?? c.span;
        const on = week < reached;
        return <motion.article key={c.id} className={`csb-rm-card ${g ? 'is-dragging' : ''}`} style={{ gridColumn: `${week + 2} / span ${Math.max(1, Math.min(span, weeks - week))}` }}
          initial={false} animate={{ opacity: on ? 1 : 0, y: on ? 0 : 14 }} transition={{ duration: .55, ease: easeOut }}
          onPointerDown={e => startDrag(e, c, 'move')}>
          <h4><EditableText field={`deep:roadmap.cards.${ci}.title`} value={c.title} /></h4>
          {c.bullets.length > 0 && <ul>{c.bullets.map((b, bi) => <li key={bi}><EditableText field={`deep:roadmap.cards.${ci}.bullets.${bi}`} value={b} /></li>)}</ul>}
          {editorMode && <span className="csb-rm-span" onPointerDown={e => startDrag(e, c, 'span')} title="Drag to change how many weeks" aria-hidden="true" />}
        </motion.article>;
      })}
    </div>)}
  </div>;

  return <div ref={wrap} className={`csb-rm ${pin ? 'is-pinned' : ''} ${editorMode ? 'is-editing' : ''}`} style={pin ? { height: pin.h + pin.overflow } : undefined}>
    <div ref={stage} className="csb-rm-stage" style={pin ? { position: 'sticky', top: pin.top } : undefined}>
      {pin ? <motion.div className="csb-rm-slide" style={{ x }}>{grid}</motion.div> : <div className="csb-rm-scroll">{grid}</div>}
    </div>
  </div>;
}

/* ---------- Right panel ---------- */
export function RoadmapControls({ section, onChange }: { section: CaseStudySection; onChange: (next: RoadmapData) => void }) {
  const data = section.roadmap ?? defaultRoadmap();
  const set = (patch: Partial<RoadmapData>) => onChange({ ...data, ...patch });
  const [lane, setLane] = useState(data.lanes[0]?.id ?? '');
  const weekOpts = Array.from({ length: data.weeks }, (_, i) => <option key={i} value={i}>{short(weekDate(data, i))}</option>);
  const cards = data.cards.filter(c => c.lane === lane).sort((a, b) => a.week - b.week);
  return <div className="csb-connection-section csb-rm-ctl">
    <p className="csb-panel-kicker">Timeline</p>
    <div className="csb-rm-ctl-row">
      <label className="csb-field"><span>First week starts</span><input type="date" value={data.start} onChange={e => e.target.value && set({ start: e.target.value })} /></label>
      <label className="csb-field"><span>Weeks</span><input type="number" min={1} max={52} value={data.weeks} onChange={e => set({ weeks: Math.max(1, Math.min(52, Number(e.target.value) || 1)) })} /></label>
    </div>
    <p className="csb-field-note">Breaks: tap the weeks with no sprint.</p>
    <div className="csb-rm-weeks">{Array.from({ length: data.weeks }, (_, i) => <button key={i} type="button" aria-pressed={data.breaks.includes(i)} onClick={() => set({ breaks: data.breaks.includes(i) ? data.breaks.filter(b => b !== i) : [...data.breaks, i] })}>{short(weekDate(data, i))}</button>)}</div>

    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Milestones</p>
    {data.milestones.map((m, i) => <div key={m.id} className="csb-rm-ctl-line">
      <input value={m.label} aria-label="Milestone name" onChange={e => set({ milestones: data.milestones.map((x, k) => k === i ? { ...x, label: e.target.value } : x) })} />
      <select value={m.week} aria-label="Week" onChange={e => set({ milestones: data.milestones.map((x, k) => k === i ? { ...x, week: Number(e.target.value) } : x) })}>{weekOpts}</select>
      <button type="button" className={`csb-rm-major ${m.major ? 'is-on' : ''}`} aria-pressed={!!m.major} title="Highlight as the big one" onClick={() => set({ milestones: data.milestones.map((x, k) => k === i ? { ...x, major: !x.major } : x) })}>★</button>
      <button type="button" className="csb-icon-button" aria-label="Remove milestone" onClick={() => set({ milestones: data.milestones.filter((_, k) => k !== i) })}><Trash2 size={13} /></button>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => set({ milestones: [...data.milestones, { id: rid(), week: Math.min(data.weeks - 1, 4), label: 'Milestone' }] })}><Plus size={13} /> Add milestone</button>

    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Teams</p>
    {data.lanes.map((l, i) => <div key={l.id} className="csb-rm-ctl-line is-lane">
      <input value={l.title} aria-label="Team name" onChange={e => set({ lanes: data.lanes.map((x, k) => k === i ? { ...x, title: e.target.value } : x) })} />
      <button type="button" className="csb-icon-button" aria-label={`Remove ${l.title}`} disabled={data.lanes.length < 2} onClick={() => { if (window.confirm(`Remove ${l.title} and its cards?`)) set({ lanes: data.lanes.filter(x => x.id !== l.id), cards: data.cards.filter(c => c.lane !== l.id) }); }}><Trash2 size={13} /></button>
    </div>)}
    <button type="button" className="csb-quiet-button" onClick={() => set({ lanes: [...data.lanes, { id: rid(), title: 'New team' }] })}><Plus size={13} /> Add team</button>

    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Work</p>
    <p className="csb-field-note">On the page: drag a card to move it, drag its right edge to make it longer, or tap + in an empty week. Click any text to edit it.</p>
    <div className="csb-segment" role="group" aria-label="Team">{data.lanes.map(l => <button key={l.id} type="button" aria-pressed={lane === l.id} onClick={() => setLane(l.id)}>{l.title}</button>)}</div>
    {cards.map(c => { const set1 = (patch: Partial<RoadmapCard>) => set({ cards: data.cards.map(x => x.id === c.id ? { ...x, ...patch } : x) }); return <div key={c.id} className="csb-rm-ctl-card">
      <input value={c.title} aria-label="Card title" onChange={e => set1({ title: e.target.value })} />
      <div className="csb-rm-ctl-line">
        <select value={c.week} aria-label="Starts" onChange={e => set1({ week: Number(e.target.value) })}>{weekOpts}</select>
        <select value={c.span} aria-label="Weeks long" onChange={e => set1({ span: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 8].map(n => <option key={n} value={n}>{n} wk</option>)}</select>
        <button type="button" className="csb-icon-button" aria-label="Remove card" onClick={() => set({ cards: data.cards.filter(x => x.id !== c.id) })}><Trash2 size={13} /></button>
      </div>
      <textarea rows={Math.max(2, c.bullets.length)} value={c.bullets.join('\n')} aria-label="Bullets, one per line" placeholder="One bullet per line" onChange={e => set1({ bullets: e.target.value.split('\n') })} onBlur={e => set1({ bullets: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
    </div>; })}
    <button type="button" className="csb-quiet-button" onClick={() => set({ cards: [...data.cards, { id: rid(), lane, week: 0, span: 1, title: 'New work', bullets: [] }] })}><Plus size={13} /> Add card</button>
  </div>;
}
