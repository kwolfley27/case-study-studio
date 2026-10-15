import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { useExpressive, useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  User flow: a real flowchart. Ovals start and end, boxes are screens, diamonds are decisions.
  The happy path is ink; other paths (No, errors, loops) are a lighter line with a small label.
  Laid out automatically, so adding a step never means rearranging boxes.
  Lines draw along the path, node by node, when the chart scrolls into view.

  It can also be written as a short script (see parseFlow):
    (Entry)
    Welcome
    Select task
    <Correct?>
      No -> Select task
    Yes -> Details
    <Items found?>
      No -> [No items found]
    (Done)
*/
export type FlowNodeType = 'terminal' | 'screen' | 'decision';
export type FlowNode = { id: string; type: FlowNodeType; label: string; image?: string; url?: string };
export type FlowEdge = { id: string; from: string; to: string; label?: string; alt?: boolean };
export type UserFlowData = { nodes: FlowNode[]; edges: FlowEdge[]; direction?: 'LR' | 'TB'; showScreens?: boolean };

const uid = () => crypto.randomUUID().slice(0, 8);
export const defaultUserFlow = (): UserFlowData => parseFlow(`(Entry)
Welcome
Select task
<Correct?>
  No -> Select task
Yes -> Details
Find
<Items found?>
  No -> No items found
Yes -> Results
(Booked)`);

/* ---------- script ⇄ data ---------- */
const token = (raw: string): { type: FlowNodeType; label: string } => {
  const t = raw.trim();
  if (/^\(.*\)$/.test(t)) return { type: 'terminal', label: t.slice(1, -1).trim() };
  if (/^<.*>$/.test(t)) return { type: 'decision', label: t.slice(1, -1).trim() };
  if (/^\[.*\]$/.test(t)) return { type: 'screen', label: t.slice(1, -1).trim() };
  return { type: t.endsWith('?') ? 'decision' : 'screen', label: t };
};
export function parseFlow(script: string, keep?: UserFlowData): UserFlowData {
  const nodes: FlowNode[] = []; const edges: FlowEdge[] = [];
  const find = (label: string) => nodes.find(n => n.label.toLowerCase() === label.toLowerCase());
  const make = (t: { type: FlowNodeType; label: string }) => { const old = keep?.nodes.find(n => n.label.toLowerCase() === t.label.toLowerCase()); const n: FlowNode = { id: old?.id ?? uid(), type: t.type, label: t.label, ...(old?.image ? { image: old.image } : {}), ...(old?.url ? { url: old.url } : {}) }; nodes.push(n); return n; };
  const pending: Array<{ from: string; label?: string; target: string; depth: number }> = [];
  let main: FlowNode | null = null; let branch: FlowNode | null = null;
  for (const line of script.split('\n')) {
    if (!line.trim() || line.trim().startsWith('//')) continue;
    const depth = (line.match(/^\s*/)?.[0].replace(/\t/g, '  ').length ?? 0) >= 4 ? 2 : /^\s+/.test(line) ? 1 : 0;
    const m = line.trim().match(/^(?:(.*?)\s*->\s*)?(.+)$/)!; const label = m[1]?.trim() || undefined; const target = m[2].trim();
    if (depth === 0) {
      const t = token(target); const found = find(t.label); if (found && /^[(<\[]/.test(target)) found.type = t.type; const n = found ?? make(t);
      if (main) edges.push({ id: uid(), from: main.id, to: n.id, ...(label ? { label } : {}) });
      main = n; branch = null;
    } else {
      const from = depth === 2 && branch ? branch : main; if (!from) continue;
      const t = token(target); const n = find(t.label) ?? make(t);
      edges.push({ id: uid(), from: from.id, to: n.id, alt: true, ...(label ? { label } : {}) });
      if (depth === 1) branch = n;
    }
  }
  void pending;
  return { nodes, edges, direction: keep?.direction ?? 'LR', showScreens: keep?.showScreens };
}
export function flowToScript(d: UserFlowData): string {
  const mainEdges = d.edges.filter(e => !e.alt);
  const incoming = new Set(mainEdges.map(e => e.to));
  const startNode = d.nodes.find(n => !incoming.has(n.id) && mainEdges.some(e => e.from === n.id)) ?? d.nodes[0];
  const wrap = (n: FlowNode) => n.type === 'terminal' ? `(${n.label})` : n.type === 'decision' ? (n.label.endsWith('?') ? n.label : `<${n.label}>`) : n.label;
  const lines: string[] = []; const seen = new Set<string>();
  let cur: FlowNode | undefined = startNode; let inLabel: string | undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    lines.push(`${inLabel ? `${inLabel} -> ` : ''}${wrap(cur)}`);
    for (const e of d.edges.filter(x => x.alt && x.from === cur!.id)) {
      const t = d.nodes.find(n => n.id === e.to); if (!t) continue;
      lines.push(`  ${e.label ? `${e.label} ` : ''}-> ${wrap(t)}`);
      if (!d.edges.some(x => !x.alt && x.to === t.id) && t.id !== startNode?.id) for (const e2 of d.edges.filter(x => x.from === t.id)) { const t2 = d.nodes.find(n => n.id === e2.to); if (t2) lines.push(`    ${e2.label ? `${e2.label} ` : ''}-> ${wrap(t2)}`); }
    }
    const next = mainEdges.find(e => e.from === cur!.id); inLabel = next?.label; cur = next ? d.nodes.find(n => n.id === next.to) : undefined;
  }
  return lines.join('\n');
}

/* ---------- layout ---------- */
const SIZE = (n: FlowNode, screens: boolean) => {
  const w = Math.max(n.type === 'decision' ? 0 : 96, Math.min(220, n.label.length * 7.4 + 44));
  if (n.type === 'decision') { const s = Math.max(96, Math.min(150, n.label.length * 6.2 + 58)); return { w: s, h: s }; }
  if (n.type === 'terminal') return { w, h: 44 };
  return screens && n.image ? { w: 136, h: 260 } : { w: Math.max(w, 120), h: 56 };
};
type Laid = { w: number; h: number; nodes: Array<FlowNode & { x: number; y: number; w: number; h: number }>; edges: Array<FlowEdge & { d: string; lx?: number; ly?: number }> };
/*
  Snake layout, like a hand-drawn flowchart: the happy path runs across, turns down at the edge
  and comes back the other way. Branches hang just below the step they leave from; loops run
  along the lane under the row. "Down" stacks the happy path vertically with branches to the right.
*/
type P = { x: number; y: number };
function layout(d: UserFlowData, dir: 'LR' | 'TB', width = 900): Laid {
  const screens = !!d.showScreens; const size = new Map(d.nodes.map(n => [n.id, SIZE(n, screens)]));
  const mainEdges = d.edges.filter(e => !e.alt);
  const incoming = new Set(mainEdges.map(e => e.to));
  const start = d.nodes.find(n => !incoming.has(n.id) && mainEdges.some(e => e.from === n.id)) ?? d.nodes[0];
  const main: string[] = []; let cur = start?.id;
  while (cur && !main.includes(cur)) { main.push(cur); cur = mainEdges.find(e => e.from === cur)?.to; }
  const others = d.nodes.filter(n => !main.includes(n.id)).map(n => n.id);
  // Branch nodes hang off the first node that points at them; orphans go to the end of the path.
  const parent = new Map<string, string>();
  for (const id of others) { const e = d.edges.find(x => x.to === id && (main.includes(x.from) || parent.has(x.from))) ?? d.edges.find(x => x.to === id); if (e && e.from !== id) parent.set(id, e.from); else main.push(id); }
  const pos = new Map<string, P>();
  const maxW = Math.max(110, ...main.map(id => size.get(id)!.w)); const GX = 64, GY = 52;
  const colW = Math.min(250, maxW) + GX;
  const down = dir === 'TB' || width < 420;
  const M = down ? 12 : 44; // outside margin for the turn lines
  const k = down ? 1 : Math.max(2, Math.floor((width - M * 2 + GX) / colW));
  const rowOf = new Map<string, number>();
  let y = 12; const rowsY: Array<{ top: number; mid: number; bottom: number; lane: number }> = [];
  const rows = Math.ceil(main.length / k);
  for (let r = 0; r < rows; r++) {
    const ids = main.slice(r * k, r * k + k);
    const h = Math.max(...ids.map(id => size.get(id)!.h));
    const mid = y + h / 2;
    ids.forEach((id, c) => { const col = down ? 0 : (r % 2 === 0 ? c : k - 1 - c); pos.set(id, { x: M + col * colW + colW / 2 - GX / 2, y: mid }); rowOf.set(id, r); });
    // Lane under the row: room for branch boxes and loop lines.
    const hangers = [...parent.entries()].filter(([, p]) => ids.includes(p));
    const hangH = hangers.length ? Math.max(...hangers.map(([id]) => size.get(id)!.h)) : 0;
    const hasLoop = d.edges.some(e => e.alt && ids.includes(e.from) && main.includes(e.to));
    const lane = down ? 0 : (hangH ? hangH + GY * 1.4 : hasLoop ? 44 : 0);
    rowsY.push({ top: y, mid, bottom: y + h, lane });
    y += h + lane + GY + (down ? 0 : 6);
  }
  // Place hanging branches (recursively, so a branch's own branch hangs beside it).
  const place = (id: string, depth = 0): void => {
    if (pos.has(id)) return; const p = parent.get(id)!; if (!pos.has(p)) place(p, depth + 1);
    const pp = pos.get(p)!, ps = size.get(p)!, s = size.get(id)!;
    if (down) { const x = pp.x + colW; pos.set(id, { x, y: pp.y }); rowOf.set(id, rowOf.get(p) ?? 0); return; }
    const r = rowOf.get(p) ?? 0; const row = rowsY[r];
    const isMainParent = main.includes(p);
    let pt = isMainParent ? { x: pp.x, y: row.bottom + GY * .9 + s.h / 2 } : { x: pp.x + ps.w / 2 + 40 + s.w / 2, y: pp.y };
    // Nudge sideways if another box already sits there.
    for (let tries = 0; tries < 6 && [...pos.entries()].some(([o, q]) => o !== id && Math.abs(q.x - pt.x) < (size.get(o)!.w + s.w) / 2 + 16 && Math.abs(q.y - pt.y) < (size.get(o)!.h + s.h) / 2 + 8); tries++) pt = { ...pt, x: pt.x + colW / 2 };
    pos.set(id, pt); rowOf.set(id, r);
  };
  for (const id of parent.keys()) place(id);
  const box = (id: string) => { const p = pos.get(id)!, s = size.get(id)!; return { ...p, w: s.w, h: s.h, l: p.x - s.w / 2, r: p.x + s.w / 2, t: p.y - s.h / 2, b: p.y + s.h / 2 }; };
  let laneCount = 0;
  const edges = d.edges.filter(e => pos.has(e.from) && pos.has(e.to)).map(e => {
    const A = box(e.from), B = box(e.to); let pts: P[];
    const sameRow = Math.abs(A.y - B.y) < 4;
    if (!e.alt && sameRow) pts = A.x < B.x ? [{ x: A.r, y: A.y }, { x: B.l, y: B.y }] : [{ x: A.l, y: A.y }, { x: B.r, y: B.y }];
    else if (!e.alt && down) pts = [{ x: A.x, y: A.b }, { x: B.x, y: B.t }];
    else if (!e.alt) { // turn to the next row on the outside edge
      const right = A.x >= B.x - 2 && (rowOf.get(e.from) ?? 0) % 2 === 0; const between = [...pos.keys()].map(box).filter(o => o.y > A.y && o.y < B.y); const ox = right ? Math.max(A.r, B.r, ...between.map(o => o.r)) + 30 : Math.min(A.l, B.l, ...between.map(o => o.l)) - 30;
      pts = Math.abs(A.x - B.x) < 4 ? [{ x: right ? A.r : A.l, y: A.y }, { x: ox, y: A.y }, { x: ox, y: B.y }, { x: right ? B.r : B.l, y: B.y }] : [{ x: A.x, y: A.b }, { x: A.x, y: (A.b + B.t) / 2 }, { x: B.x, y: (A.b + B.t) / 2 }, { x: B.x, y: B.t }];
    } else if (down) { // branches to the right; loops along a lane on the far right
      if (sameRow) pts = [{ x: A.r, y: A.y }, { x: B.l, y: B.y }];
      else { const lx = Math.max(A.r, B.r) + 26 + (laneCount++ % 3) * 10; pts = [{ x: A.r, y: A.y }, { x: lx, y: A.y }, { x: lx, y: B.y }, { x: B.r, y: B.y }]; }
    } else if (B.t > A.b + 4 && Math.abs(A.x - B.x) < 4) pts = [{ x: A.x, y: A.b }, { x: B.x, y: B.t }]; // straight down to its branch
    else if (B.t > A.b + 4) pts = [{ x: A.x, y: A.b }, { x: A.x, y: (A.b + B.t) / 2 }, { x: B.x, y: (A.b + B.t) / 2 }, { x: B.x, y: B.t }];
    else if (A.t > B.b + 4) { // coming back up from a branch box
      if (Math.abs(A.x - B.x) < Math.max(A.w, B.w) / 2) pts = [{ x: A.x, y: A.t }, { x: B.x, y: B.b }];
      else pts = [{ x: A.x < B.x ? A.r : A.l, y: A.y }, { x: B.x, y: A.y }, { x: B.x, y: B.b }];
    } else { // loop within the row, under the boxes
      const row = rowsY[rowOf.get(e.from) ?? 0]; const ly = row.bottom + 22 + (laneCount++ % 2) * 10;
      pts = [{ x: A.x, y: A.b }, { x: A.x, y: ly }, { x: B.x, y: ly }, { x: B.x, y: B.b }];
    }
    // label sits on the longest segment
    let best = 0, bi = 0; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (l > best) { best = l; bi = i; } }
    const lx = pts.length > 1 ? (pts[bi - 1 < 0 ? 0 : bi - 1].x + pts[bi].x) / 2 : 0, ly = pts.length > 1 ? (pts[bi - 1 < 0 ? 0 : bi - 1].y + pts[bi].y) / 2 : 0;
    return { ...e, d: rounded(pts), lx, ly };
  });
  const nodes = d.nodes.filter(n => pos.has(n.id)).map(n => { const b = box(n.id); return { ...n, x: b.x, y: b.y, w: b.w, h: b.h }; });
  const W = Math.max(...nodes.map(n => n.x + n.w / 2)) + M + (down ? 40 : 30);
  const H = Math.max(...nodes.map(n => n.y + n.h / 2)) + 16;
  return { w: Math.max(W, 100), h: Math.max(H, 60), nodes, edges };
}
/* Polyline with softened corners. */
function rounded(pts: Array<{ x: number; y: number }>, r = 12) {
  if (pts.length < 2) return '';
  let s = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d1 = Math.hypot(b.x - a.x, b.y - a.y), d2 = Math.hypot(c.x - b.x, c.y - b.y); const k = Math.min(r, d1 / 2, d2 / 2);
    const p1 = { x: b.x - (b.x - a.x) / d1 * k, y: b.y - (b.y - a.y) / d1 * k }, p2 = { x: b.x + (c.x - b.x) / d2 * k, y: b.y + (c.y - b.y) / d2 * k };
    s += ` L${p1.x},${p1.y} Q${b.x},${b.y} ${p2.x},${p2.y}`;
  }
  const z = pts[pts.length - 1]; return `${s} L${z.x},${z.y}`;
}

/* ---------- view ---------- */
const norm = (l: string) => l.trim().toLowerCase();
type Mark = 'added' | 'removed';
type ChartProps = {
  data: UserFlowData; g: Laid; scale: number; sid: string; field: string; seen: boolean; expressive: boolean; editorMode?: boolean;
  marks?: Record<string, Mark>; keyByLabel?: boolean; sel?: string | null; setSel?: (id: string | null) => void; ops?: FlowOps; markLabel?: Partial<Record<Mark, string>>; quick?: boolean;
};
type FlowOps = { next: (id: string) => void; branch: (id: string) => void; type: (id: string, t: FlowNodeType) => void; remove: (id: string) => void };

/* Reveal order: walk from the start, happy path first. */
function revealOrder(data: UserFlowData) {
  const incoming = new Set(data.edges.filter(e => !e.alt).map(e => e.to));
  const start = data.nodes.find(n => !incoming.has(n.id)) ?? data.nodes[0]; const out = new Map<string, number>(); const q = start ? [start.id] : [];
  while (q.length) { const id = q.shift()!; if (out.has(id)) continue; out.set(id, out.size); for (const e of [...data.edges.filter(x => x.from === id && !x.alt), ...data.edges.filter(x => x.from === id && x.alt)]) q.push(e.to); }
  data.nodes.forEach(n => { if (!out.has(n.id)) out.set(n.id, out.size); });
  return out;
}

function FlowChart({ data, g, scale, sid, field, seen, expressive, editorMode, marks, keyByLabel, sel, setSel, ops, markLabel, quick }: ChartProps) {
  const order = useMemo(() => revealOrder(data), [JSON.stringify(data.edges), data.nodes.length]);
  const step = expressive && !quick ? .16 : 0; const at = (id: string) => (order.get(id) ?? 0) * step;
  const keyOf = (n: FlowNode) => keyByLabel ? `n-${norm(n.label)}` : n.id;
  const byId = new Map(data.nodes.map(n => [n.id, n]));
  const edgeKey = (e: FlowEdge) => keyByLabel ? `e-${norm(byId.get(e.from)?.label ?? '')}-${norm(byId.get(e.to)?.label ?? '')}-${e.alt ? 1 : 0}` : e.id;
  return <div className="csb-uf-canvas" style={{ width: g.w, height: g.h, transform: `scale(${scale})` }} onClick={e => { if (e.target === e.currentTarget) setSel?.(null); }}>
    <svg className="csb-uf-lines" width={g.w} height={g.h} aria-hidden="true">
      <defs><marker id={`uf-arrow-${sid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="context-stroke" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></marker></defs>
      {g.edges.map(e => { const m = marks?.[e.to] ?? marks?.[e.from]; return <motion.path key={edgeKey(e) + e.d.length} d={e.d} className={`${e.alt ? 'is-alt' : ''} ${m ? `is-${m}` : ''}`} markerEnd={`url(#uf-arrow-${sid})`} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: seen ? 1 : 0, opacity: seen ? 1 : 0 }} transition={{ pathLength: { duration: expressive ? .5 : 0, delay: (quick ? .35 : 0) + at(e.from) + .12, ease: 'easeInOut' }, opacity: { duration: .01, delay: (quick ? .35 : 0) + at(e.from) + .12 } }} />; })}
    </svg>
    {g.edges.filter(e => e.label).map(e => <motion.span key={`l${edgeKey(e)}`} className={`csb-uf-elabel ${e.alt ? 'is-alt' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: seen ? 1 : 0, left: e.lx, top: e.ly }} transition={{ opacity: { duration: .3, delay: (quick ? .5 : 0) + at(e.from) + .4 }, default: { duration: 0 } }}>
      <EditableText field={`deep:${field}.edges.${data.edges.findIndex(x => x.id === e.id)}.label`} value={e.label ?? ''} />
    </motion.span>)}
    <AnimatePresence>
    {g.nodes.map(n => { const i = data.nodes.findIndex(x => x.id === n.id); const m = marks?.[n.id]; return <motion.div key={keyOf(n)} className={`csb-uf-node is-${n.type} ${sel === n.id ? 'is-sel' : ''} ${n.image && data.showScreens ? 'has-img' : ''} ${m ? `is-${m}` : ''}`}
      initial={{ opacity: 0, scale: .9, left: n.x - n.w / 2, top: n.y - n.h / 2, width: n.w, height: n.h }}
      animate={{ opacity: seen ? 1 : 0, scale: seen ? 1 : .9, left: n.x - n.w / 2, top: n.y - n.h / 2, width: n.w, height: n.h }}
      exit={{ opacity: 0, scale: .85, transition: { duration: .3 } }}
      transition={{ opacity: { duration: .4, delay: at(n.id) }, scale: { duration: .4, delay: at(n.id), ease: [0.22, 1, 0.36, 1] }, default: { type: 'spring', stiffness: 120, damping: 20 } }}
      onClick={editorMode && setSel ? e => { e.stopPropagation(); setSel(n.id); } : undefined}>
      {n.type === 'decision' && <i className="csb-uf-diamond" aria-hidden="true" />}
      {n.image && data.showScreens && n.type === 'screen' && <img src={n.image} alt="" loading="lazy" />}
      <span className="csb-uf-label"><EditableText field={`deep:${field}.nodes.${i}.label`} value={n.label} /></span>
      {m && <em className="csb-uf-tag">{markLabel?.[m] ?? (m === 'added' ? 'New' : 'Cut')}</em>}
      {editorMode && ops && sel === n.id && <div className="csb-uf-tools" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => ops.next(n.id)} title="Add the next step"><Plus size={13} /> Next</button>
        <button type="button" onClick={() => ops.branch(n.id)} title="Add another path from here"><GitBranch size={13} /> Branch</button>
        <span className="csb-uf-seg">{(['terminal', 'screen', 'decision'] as const).map(t => <button key={t} type="button" aria-pressed={n.type === t} onClick={() => ops.type(n.id, t)} title={t === 'terminal' ? 'Start / end' : t === 'screen' ? 'Screen' : 'Decision'}><i className={`csb-uf-shape is-${t}`} /></button>)}</span>
        <button type="button" onClick={() => ops.remove(n.id)} aria-label="Delete step"><Trash2 size={13} /></button>
      </div>}
    </motion.div>; })}
    </AnimatePresence>
  </div>;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null); const [w, setW] = useState(900);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}
function makeOps(data: UserFlowData, save: (d: UserFlowData) => void, setSel: (id: string | null) => void): FlowOps {
  return {
    next: id => { const n: FlowNode = { id: uid(), type: 'screen', label: 'New screen' }; const out = data.edges.find(e => e.from === id && !e.alt); const edges = out ? [...data.edges.filter(e => e.id !== out.id), { id: uid(), from: id, to: n.id, label: out.label }, { id: uid(), from: n.id, to: out.to }] : [...data.edges, { id: uid(), from: id, to: n.id }]; save({ ...data, nodes: [...data.nodes, n], edges }); setSel(n.id); },
    branch: id => { const src = data.nodes.find(x => x.id === id); const n: FlowNode = { id: uid(), type: 'screen', label: 'Other path' }; save({ ...data, nodes: [...data.nodes, n], edges: [...data.edges, { id: uid(), from: id, to: n.id, alt: true, label: src?.type === 'decision' ? 'No' : undefined }] }); setSel(n.id); },
    type: (id, type) => save({ ...data, nodes: data.nodes.map(n => n.id === id ? { ...n, type } : n) }),
    remove: id => { const inn = data.edges.filter(e => e.to === id && !e.alt), out = data.edges.find(e => e.from === id && !e.alt); const bridged = out ? inn.map(e => ({ id: uid(), from: e.from, to: out.to, label: e.label })) : []; save({ ...data, nodes: data.nodes.filter(n => n.id !== id), edges: [...data.edges.filter(e => e.from !== id && e.to !== id), ...bridged] }); setSel(null); },
  };
}

export function UserFlow({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const data = section.userFlow ?? defaultUserFlow();
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const [wrap, cw] = useWidth();
  const dir: 'LR' | 'TB' = data.direction ?? 'LR';
  const g = useMemo(() => layout(data, dir, cw), [JSON.stringify(data), dir, cw]);
  const scale = Math.max(.6, Math.min(1, cw / Math.max(1, g.w)));
  const seen = useInView(wrap, { once: true, amount: .35 }) || reduce || !expressive || !!editorMode;
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (!editorMode) setSel(null); }, [editorMode]);
  const save = (next: UserFlowData) => edit?.('json:userFlow', JSON.stringify(next));
  return <div ref={wrap} className={`csb-uf ${editorMode ? 'is-editing' : ''}`}>
    <div className="csb-uf-scroll" style={{ height: g.h * scale + (editorMode ? 56 : 8) }}>
      <FlowChart data={data} g={g} scale={scale} sid={section.id} field="userFlow" seen={seen} expressive={expressive} editorMode={editorMode} sel={sel} setSel={setSel} ops={makeOps(data, save, setSel)} />
    </div>
  </div>;
}

/* ---------- Flow redesign: before → after ---------- */
export type FlowDiffData = { before: UserFlowData; after: UserFlowData; beforeLabel?: string; afterLabel?: string; direction?: 'LR' | 'TB' };
export const defaultFlowDiff = (): FlowDiffData => ({
  beforeLabel: 'Before', afterLabel: 'After', direction: 'LR',
  before: parseFlow(`(Open app)
Home
Classes tab
Studio list
Studio page
Schedule
Class details
<Signed in?>
  No -> Create account
    -> Class details
Yes -> Payment
Review
(Booked)`),
  after: parseFlow(`(Open app)
Home
Class details
<Signed in?>
  No -> Apple Pay sign-in
    -> Class details
Yes -> Payment
(Booked)`),
});

export function FlowDiff({ section, editorMode }: { section: CaseStudySection; editorMode?: boolean }) {
  const data = section.flowDiff ?? defaultFlowDiff();
  const reduce = useReducedMotion(); const expressive = useExpressive();
  const [wrap, cw] = useWidth();
  const inView = useInView(wrap, { once: true, amount: .35 });
  const seen = inView || reduce || !expressive || !!editorMode;
  const [phase, setPhase] = useState<'before' | 'after'>(editorMode || reduce || !expressive ? 'after' : 'before');
  const [touched, setTouched] = useState(false);
  // On the page: show the old flow, then morph into the new one.
  useEffect(() => { if (!inView || touched || editorMode || !expressive || reduce) return; const t = setTimeout(() => setPhase('after'), 2600); return () => clearTimeout(t); }, [inView, touched, editorMode, expressive, reduce]);
  const dir: 'LR' | 'TB' = data.direction ?? 'LR';
  const gb = useMemo(() => layout(data.before, dir, cw), [JSON.stringify(data.before), dir, cw]);
  const ga = useMemo(() => layout(data.after, dir, cw), [JSON.stringify(data.after), dir, cw]);
  const before = new Set(data.before.nodes.map(n => norm(n.label))), after = new Set(data.after.nodes.map(n => norm(n.label)));
  const marksB = Object.fromEntries(data.before.nodes.filter(n => !after.has(norm(n.label))).map(n => [n.id, 'removed' as Mark]));
  const marksA = Object.fromEntries(data.after.nodes.filter(n => !before.has(norm(n.label))).map(n => [n.id, 'added' as Mark]));
  const cur = phase === 'before' ? data.before : data.after; const g = phase === 'before' ? gb : ga;
  const W = Math.max(gb.w, ga.w), H = Math.max(gb.h, ga.h);
  const scale = Math.max(.6, Math.min(1, cw / Math.max(1, W)));
  const count = (d: UserFlowData) => d.nodes.filter(n => n.type !== 'terminal').length;
  const nb = count(data.before), na = count(data.after); const cut = Object.keys(marksB).length, added = Object.keys(marksA).length;
  const pick = (p: 'before' | 'after') => { setTouched(true); setPhase(p); };
  return <div ref={wrap} className={`csb-uf csb-ufd ${editorMode ? 'is-editing' : ''}`}>
    <div className="csb-ufd-bar">
      <div className="csb-ufd-toggle" role="tablist" aria-label="Which flow">
        {(['before', 'after'] as const).map(p => <button key={p} type="button" role="tab" aria-selected={phase === p} onClick={() => pick(p)}>
          {phase === p && <motion.i layoutId={`ufd-pill-${section.id}`} className="csb-ufd-pill" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
          <span>{p === 'before' ? data.beforeLabel || 'Before' : data.afterLabel || 'After'}</span>
        </button>)}
      </div>
      <p className="csb-ufd-sum"><strong>{nb}</strong> steps <span aria-hidden="true">→</span> <strong>{na}</strong>{cut ? <> · <em className="is-removed">{cut} cut</em></> : null}{added ? <> · <em className="is-added">{added} new</em></> : null}</p>
    </div>
    <div className="csb-uf-scroll" style={{ height: H * scale + 12 }}>
      <div style={{ position: 'relative', width: W, height: H }}>
        <FlowChart data={cur} g={g} scale={scale} sid={`${section.id}-${phase}`} field={`flowDiff.${phase}`} seen={seen} expressive={expressive} editorMode={editorMode} marks={phase === 'before' ? marksB : marksA} keyByLabel quick />
      </div>
    </div>
  </div>;
}

/* ---------- right panel ---------- */
export function UserFlowControls({ section, onChange, onRecord }: { section: CaseStudySection; onChange: (d: UserFlowData) => void; onRecord?: () => void }) {
  const data = section.userFlow ?? defaultUserFlow();
  const [text, setText] = useState(() => flowToScript(data));
  const last = useRef(JSON.stringify(data));
  if (JSON.stringify(data) !== last.current) { last.current = JSON.stringify(data); const s = flowToScript(data); if (s !== text) setText(s); }
  const apply = (t: string) => { setText(t); const next = parseFlow(t, data); last.current = JSON.stringify(next); onChange(next); };
  return <div className="csb-connection-section csb-uf-ctl">
    <p className="csb-panel-kicker">Layout</p>
    <div className="csb-segment" role="group" aria-label="Direction">
      <button type="button" aria-pressed={(data.direction ?? 'LR') === 'LR'} onClick={() => onChange({ ...data, direction: 'LR' })}>Across</button>
      <button type="button" aria-pressed={data.direction === 'TB'} onClick={() => onChange({ ...data, direction: 'TB' })}>Down</button>
    </div>
    {data.nodes.some(n => n.image) && <label className="csb-check-field"><input type="checkbox" checked={!!data.showScreens} onChange={e => onChange({ ...data, showScreens: e.target.checked })} /> Show screenshots in the boxes</label>}
    {onRecord && <><div className="csb-inspector-divider" /><button type="button" className="csb-primary-button" onClick={onRecord}>Record a flow…</button></>}
    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Write the flow</p>
    <p className="csb-field-note">One step per line. <code>(Start)</code> oval · <code>Screen</code> box · <code>&lt;Decision?&gt;</code> diamond. Indent a line to branch: <code>No -&gt; Error screen</code>. Name an earlier step to loop back. <code>Yes -&gt; Next</code> labels the main arrow.</p>
    <textarea className="csb-uf-script" rows={Math.min(22, Math.max(8, text.split('\n').length + 1))} value={text} spellCheck={false} onChange={e => apply(e.target.value)} aria-label="Flow script" />
    <p className="csb-field-note">Or click any step on the page for Next, Branch, shape and delete.</p>
  </div>;
}

export function FlowDiffControls({ section, onChange }: { section: CaseStudySection; onChange: (d: FlowDiffData) => void }) {
  const data = section.flowDiff ?? defaultFlowDiff();
  const [tb, setTb] = useState(() => flowToScript(data.before)); const [ta, setTa] = useState(() => flowToScript(data.after));
  const last = useRef(JSON.stringify(data));
  if (JSON.stringify(data) !== last.current) { last.current = JSON.stringify(data); const b = flowToScript(data.before), a = flowToScript(data.after); if (b !== tb) setTb(b); if (a !== ta) setTa(a); }
  const set = (patch: Partial<FlowDiffData>) => { const next = { ...data, ...patch }; last.current = JSON.stringify(next); onChange(next); };
  return <div className="csb-connection-section csb-uf-ctl">
    <p className="csb-field-note">Steps with the same name in both flows glide to their new place. Steps only in the old flow are marked Cut; steps only in the new one are marked New.</p>
    <div className="csb-segment" role="group" aria-label="Direction">
      <button type="button" aria-pressed={(data.direction ?? 'LR') === 'LR'} onClick={() => set({ direction: 'LR' })}>Across</button>
      <button type="button" aria-pressed={data.direction === 'TB'} onClick={() => set({ direction: 'TB' })}>Down</button>
    </div>
    <div className="csb-fc-ctl-grid">
      <label className="csb-field"><span>First label</span><input value={data.beforeLabel ?? 'Before'} onChange={e => set({ beforeLabel: e.target.value })} /></label>
      <label className="csb-field"><span>Second label</span><input value={data.afterLabel ?? 'After'} onChange={e => set({ afterLabel: e.target.value })} /></label>
    </div>
    <p className="csb-panel-kicker">{data.beforeLabel || 'Before'}</p>
    <textarea className="csb-uf-script" rows={Math.min(18, tb.split('\n').length + 1)} value={tb} spellCheck={false} aria-label="Old flow" onChange={e => { setTb(e.target.value); set({ before: parseFlow(e.target.value, data.before) }); }} />
    <p className="csb-panel-kicker">{data.afterLabel || 'After'}</p>
    <textarea className="csb-uf-script" rows={Math.min(18, ta.split('\n').length + 1)} value={ta} spellCheck={false} aria-label="New flow" onChange={e => { setTa(e.target.value); set({ after: parseFlow(e.target.value, data.after) }); }} />
    <p className="csb-field-note">One step per line. <code>(Start)</code> oval · <code>Screen</code> box · <code>&lt;Decision?&gt;</code> diamond · indent to branch: <code>No -&gt; Error</code>.</p>
  </div>;
}
