import { useContext, useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useMotionValue, useMotionValueEvent } from 'motion/react';
import { EditableText, EditingContext } from './EditableText';
import { useReducedMotion } from './MotionKit';
import type { CaseStudySection } from './model';

/*
  A/B test: two versions of a screen in one frame, the changes between them
  (found automatically by comparing the screenshots), and what happened.

  items: 0 version A (title label · detail caption · image)
         1 version B
  section.abtest: markers (boxes on the screen, 0–1 fractions), metrics, result, method, mode.
  Metric kinds:
    rate   — a percentage: 31 → 44 shows "+13 pts" and relative lift
    number — any number with a unit; "better" says whether lower is the win (time on task)
    votes  — qualitative: "4 of 5 preferred B"
*/

export type ABMetric = { label: string; kind: 'rate' | 'number' | 'votes'; a: string; b: string; unit?: string; of?: string; better?: 'higher' | 'lower' };
export type ABMarker = { x: number; y: number; w: number; h: number; note: string; metric?: number };
export type ABTestData = { mode?: 'wipe' | 'side'; markers: ABMarker[]; metrics: ABMetric[]; result?: 'b' | 'a' | 'none'; method?: string; showMarkers?: boolean };

export const defaultABTest = (): ABTestData => ({
  mode: 'wipe', showMarkers: true, result: 'b',
  method: 'Split test · 2 weeks · 4,212 sessions · 95% confidence',
  markers: [],
  metrics: [
    { label: 'Booking completion', kind: 'rate', a: '31', b: '44', better: 'higher' },
    { label: 'Time to book', kind: 'number', a: '42', b: '18', unit: 's', better: 'lower' },
  ],
});

const num = (v?: string) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

/** The headline delta for a metric and whether it is an improvement. */
export function liftOf(m: ABMetric): { big: string; small?: string; good: boolean | null } {
  const a = num(m.a), b = num(m.b);
  if (m.kind === 'votes') { const of = num(m.of) || a + b; return { big: `${fmt(b)} of ${fmt(of)}`, small: 'preferred B', good: b > of / 2 ? true : b < of / 2 ? false : null }; }
  const diff = b - a; const rel = a ? (diff / Math.abs(a)) * 100 : 0;
  const good = diff === 0 ? null : (m.better === 'lower' ? diff < 0 : diff > 0);
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
  if (m.kind === 'rate') return { big: `${sign(diff)} pts`, small: a ? `${sign(rel)}% relative` : undefined, good };
  return { big: `${sign(rel)}%`, small: `${fmt(a)}${m.unit ?? ''} → ${fmt(b)}${m.unit ?? ''}`, good };
}

/* ---------- Change detection: compare the two screenshots pixel by pixel ---------- */
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not load a screenshot.')); img.src = src; });

export async function detectChanges(srcA: string, srcB: string): Promise<{ boxes: Array<Omit<ABMarker, 'note'>>; mismatch: boolean }> {
  const [a, b] = await Promise.all([loadImage(srcA), loadImage(srcB)]);
  const mismatch = Math.abs(a.naturalWidth / a.naturalHeight - b.naturalWidth / b.naturalHeight) > 0.03;
  const W = 240, H = Math.max(40, Math.round(W * a.naturalHeight / a.naturalWidth));
  const read = (img: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, W, H); return ctx.getImageData(0, 0, W, H).data; };
  let pa: Uint8ClampedArray, pb: Uint8ClampedArray;
  try { pa = read(a); pb = read(b); } catch { throw new Error('This image is hosted somewhere that blocks reading it. Upload the screenshot file instead.'); }
  const C = 4, GW = Math.ceil(W / C), GH = Math.ceil(H / C);
  const grid = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    let changed = 0, total = 0;
    for (let y = gy * C; y < Math.min(H, gy * C + C); y++) for (let x = gx * C; x < Math.min(W, gx * C + C); x++) {
      const i = (y * W + x) * 4; total++;
      if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 70) changed++;
    }
    grid[gy * GW + gx] = changed / total > 0.12 ? 1 : 0;
  }
  // Grow each changed cell a little so a button and its label join into one change.
  const grown = new Uint8Array(grid.length);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (grid[y * GW + x]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < GW && ny < GH) grown[ny * GW + nx] = 1; }
  const seen = new Uint8Array(grid.length); let boxes: Array<{ x0: number; y0: number; x1: number; y1: number; n: number }> = [];
  for (let s = 0; s < grown.length; s++) {
    if (!grown[s] || seen[s]) continue;
    const box = { x0: GW, y0: GH, x1: 0, y1: 0, n: 0 }; const stack = [s]; seen[s] = 1;
    while (stack.length) { const p = stack.pop()!; const x = p % GW, y = (p - x) / GW; box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y); box.x1 = Math.max(box.x1, x); box.y1 = Math.max(box.y1, y); if (grid[p]) box.n++;
      for (const q of [p - 1, p + 1, p - GW, p + GW]) if (q >= 0 && q < grown.length && !seen[q] && grown[q] && Math.abs((q % GW) - x) <= 1) { seen[q] = 1; stack.push(q); } }
    if (box.n >= 3) boxes.push(box);
  }
  // Merge boxes that overlap, then keep the biggest few in reading order.
  let merged = true;
  while (merged) { merged = false; outer: for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const p = boxes[i], q = boxes[j]; if (p.x0 <= q.x1 + 1 && q.x0 <= p.x1 + 1 && p.y0 <= q.y1 + 1 && q.y0 <= p.y1 + 1) { boxes[i] = { x0: Math.min(p.x0, q.x0), y0: Math.min(p.y0, q.y0), x1: Math.max(p.x1, q.x1), y1: Math.max(p.y1, q.y1), n: p.n + q.n }; boxes.splice(j, 1); merged = true; break outer; } } }
  boxes = boxes.sort((p, q) => q.n - p.n).slice(0, 6).sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0);
  return { mismatch, boxes: boxes.map(b => ({ x: b.x0 / GW, y: b.y0 / GH, w: (b.x1 - b.x0 + 1) / GW, h: (b.y1 - b.y0 + 1) / GH })) };
}

/* ---------- View ---------- */
/** Screen shape follows screenshot A (so nothing is cropped). */
function useRatio(src?: string) {
  const [ratio, setRatio] = useState('16 / 10');
  useEffect(() => { if (!src) { setRatio('16 / 10'); return; } const img = new Image(); img.onload = () => img.naturalWidth && setRatio(`${img.naturalWidth} / ${img.naturalHeight}`); img.src = src; }, [src]);
  return ratio;
}

function Markers({ data, active, setActive, editable }: { data: ABTestData; active: number | null; setActive: (i: number | null) => void; editable: boolean }) {
  const { edit } = useContext(EditingContext);
  const drag = (event: React.PointerEvent, index: number, resize: boolean) => {
    if (!editable || !edit) return;
    event.preventDefault(); event.stopPropagation();
    const host = (event.currentTarget as HTMLElement).closest('.csb-ab-screen') as HTMLElement; const rect = host.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY }; const m0 = data.markers[index]; let next = m0;
    const move = (e: PointerEvent) => { const dx = (e.clientX - start.x) / rect.width, dy = (e.clientY - start.y) / rect.height;
      next = resize ? { ...m0, w: Math.max(.03, Math.min(1 - m0.x, m0.w + dx)), h: Math.max(.02, Math.min(1 - m0.y, m0.h + dy)) } : { ...m0, x: Math.max(0, Math.min(1 - m0.w, m0.x + dx)), y: Math.max(0, Math.min(1 - m0.h, m0.y + dy)) };
      const el = host.querySelector<HTMLElement>(`[data-marker="${index}"]`); if (el) Object.assign(el.style, { left: `${next.x * 100}%`, top: `${next.y * 100}%`, width: `${next.w * 100}%`, height: `${next.h * 100}%` }); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (next !== m0) edit('json:abtest', JSON.stringify({ ...data, markers: data.markers.map((m, i) => i === index ? next : m) })); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  return <div className="csb-ab-markers">{data.markers.map((m, i) => <div key={i} data-marker={i} data-no-slot className={`csb-ab-marker ${active === i ? 'is-active' : ''} ${editable ? 'is-editable' : ''}`} style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
    onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onPointerDown={e => drag(e, i, false)} onClick={e => e.stopPropagation()}>
    <span className="csb-ab-num">{i + 1}</span>
    {editable && <span className="csb-ab-resize" onPointerDown={e => drag(e, i, true)} aria-hidden="true" />}
  </div>)}</div>;
}

function Screen({ section, index, label }: { section: CaseStudySection; index: 0 | 1; label: string }) {
  const item = section.items[index];
  return <div className="csb-ab-layer" data-image-slot={`${section.id}:${index}`}>
    {item?.image ? <img src={item.image} alt={`${label}: ${item.title}`} draggable={false} /> : <div className="csb-ab-empty"><strong>Add screen {label}</strong><span>Drop a screenshot or paste a Figma frame link</span></div>}
  </div>;
}

function Wipe({ section, data, editorMode, active, setActive }: { section: CaseStudySection; data: ABTestData; editorMode: boolean; active: number | null; setActive: (i: number | null) => void }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: .5 });
  const pos = useMotionValue(reduce || editorMode ? 50 : 100); // % of the screen showing A, from the left
  const [view, setView] = useState<'a' | 'b' | 'compare'>('compare');
  const [p, setP] = useState(pos.get());
  useMotionValueEvent(pos, 'change', setP);
  useEffect(() => {
    if (!inView || reduce || editorMode) return;
    const run = async () => { await animate(pos, 0, { duration: 1.4, ease: [0.65, 0, 0.35, 1], delay: .3 }); await animate(pos, 50, { duration: .9, ease: [0.22, 1, 0.36, 1], delay: .5 }); };
    void run();
  }, [inView]);
  const choose = (next: 'a' | 'b' | 'compare') => { setView(next); animate(pos, next === 'a' ? 100 : next === 'b' ? 0 : 50, { duration: reduce ? 0 : .6, ease: [0.22, 1, 0.36, 1] }); };
  const dragHandle = (event: React.PointerEvent) => {
    event.preventDefault(); event.stopPropagation();
    const rect = ref.current!.getBoundingClientRect(); setView('compare');
    const move = (e: PointerEvent) => pos.set(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    move(event.nativeEvent); const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const [a, b] = section.items;
  const ratio = useRatio(a?.image || b?.image);
  const showMarkers = data.showMarkers !== false && data.markers.length > 0 && p < 99;
  return <div className="csb-ab-wipe">
    <div className="csb-ab-switch" role="group" aria-label="Show version">
      {(['a', 'compare', 'b'] as const).map(v => <button key={v} type="button" aria-pressed={view === v} onClick={e => { e.stopPropagation(); choose(v); }}>{v === 'a' ? (a?.title || 'A') : v === 'b' ? (b?.title || 'B') : 'Compare'}</button>)}
    </div>
    <div className="csb-ab-screen" ref={ref} style={{ '--ab-ar': ratio } as React.CSSProperties}>
      <Screen section={section} index={0} label="A" />
      <div className="csb-ab-top" style={{ clipPath: `inset(0 0 0 ${p}%)` }}><Screen section={section} index={1} label="B" />{showMarkers && <Markers data={data} active={active} setActive={setActive} editable={editorMode} />}</div>
      <div className="csb-ab-divider" style={{ left: `${p}%`, opacity: p <= .5 || p >= 99.5 ? 0 : 1 }} aria-hidden="true" />
      <div className="csb-ab-handle" data-no-slot role="slider" tabIndex={0} aria-label="Drag to compare A and B" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(100 - p)} style={{ left: `${p}%`, opacity: p <= .5 || p >= 99.5 ? 0 : 1 }}
        onPointerDown={dragHandle} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'ArrowLeft') pos.set(Math.max(0, p - 5)); if (e.key === 'ArrowRight') pos.set(Math.min(100, p + 5)); }}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <span className="csb-ab-tag is-a" style={{ opacity: p > 12 ? 1 : 0 }}>A</span>
      <span className="csb-ab-tag is-b" style={{ opacity: p < 88 ? 1 : 0 }}>B</span>
    </div>
  </div>;
}

function Side({ section, data, editorMode, active, setActive }: { section: CaseStudySection; data: ABTestData; editorMode: boolean; active: number | null; setActive: (i: number | null) => void }) {
  const style = { '--ab-ar': useRatio(section.items[0]?.image || section.items[1]?.image) } as React.CSSProperties;
  return <div className="csb-ab-side">
    {[0, 1].map(i => <figure key={i}>
      <div className="csb-ab-screen" style={style}><Screen section={section} index={i as 0 | 1} label={i ? 'B' : 'A'} />{i === 1 && data.showMarkers !== false && <Markers data={data} active={active} setActive={setActive} editable={editorMode} />}<span className={`csb-ab-tag ${i ? 'is-b' : 'is-a'}`}>{i ? 'B' : 'A'}</span></div>
      <figcaption><strong><EditableText field={`items.${i}.title`} value={section.items[i]?.title || ''} /></strong><span><EditableText field={`items.${i}.detail`} value={section.items[i]?.detail || ''} /></span></figcaption>
    </figure>)}
  </div>;
}

function MetricRow({ m, index, highlight, delay }: { m: ABMetric; index: number; highlight: boolean; delay: number }) {
  const reduce = useReducedMotion();
  const lift = liftOf(m);
  const a = num(m.a), b = num(m.b);
  // Bars start at zero width, which an in-view check can't see, so the row drives them.
  const rowRef = useRef<HTMLDivElement>(null);
  const shown = useInView(rowRef, { once: true, amount: .4 });
  const grow = (pct: number, d: number) => ({ initial: reduce ? false : { scaleX: 0 }, animate: shown || reduce ? { scaleX: 1 } : { scaleX: 0 }, transition: { duration: 1, delay: delay + d, ease: [0.22, 1, 0.36, 1] as const }, style: { width: `${Math.max(2, pct)}%` } });
  let bars: React.ReactNode;
  if (m.kind === 'votes') {
    const of = Math.max(1, Math.min(30, Math.round(num(m.of) || a + b)));
    bars = <div className="csb-ab-dots" aria-label={`${fmt(b)} of ${of} preferred B`}>{Array.from({ length: of }, (_, i) => <motion.i key={i} className={i < b ? 'is-b' : ''} initial={reduce ? false : { scale: 0, opacity: 0 }} animate={shown || reduce ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }} transition={{ delay: delay + .2 + i * .06, type: 'spring', stiffness: 400, damping: 22 }} />)}</div>;
  } else {
    const max = m.kind === 'rate' ? 100 : Math.max(a, b) || 1;
    bars = <div className="csb-ab-bars">
      <div><small>A</small><span className="csb-ab-track"><motion.span className="csb-ab-bar" {...grow((a / max) * 100, .1)} /></span><em>{fmt(a)}{m.kind === 'rate' ? '%' : m.unit ?? ''}</em></div>
      <div><small>B</small><span className="csb-ab-track"><motion.span className="csb-ab-bar is-b" {...grow((b / max) * 100, .25)} /></span><em>{fmt(b)}{m.kind === 'rate' ? '%' : m.unit ?? ''}</em></div>
    </div>;
  }
  return <motion.div ref={rowRef} className={`csb-ab-metric ${highlight ? 'is-active' : ''}`} initial={reduce ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .5 }} transition={{ duration: .6, delay, ease: [0.22, 1, 0.36, 1] }}>
    <div className="csb-ab-metric-head"><span><EditableText field={`abtest.metrics.${index}.label`} value={m.label} /></span>
      <span className={`csb-ab-lift ${lift.good === true ? 'is-good' : lift.good === false ? 'is-bad' : ''}`}>
        {lift.good !== null && m.kind !== 'votes' && <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d={num(m.b) >= num(m.a) ? 'M6 10V2M2.5 5.5 6 2l3.5 3.5' : 'M6 2v8M2.5 6.5 6 10l3.5-3.5'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        {lift.big}</span></div>
    {bars}
    {lift.small && <small className="csb-ab-sub">{lift.small}{m.kind !== 'votes' && lift.good !== null ? ` · ${lift.good ? 'better' : 'worse'}` : ''}</small>}
  </motion.div>;
}

export function ABTest({ section, editorMode }: { section: CaseStudySection; editorMode: boolean }) {
  const data: ABTestData = { ...defaultABTest(), ...(section.abtest ?? {}) };
  const [active, setActive] = useState<number | null>(null);
  const activeMetric = active !== null ? data.markers[active]?.metric : undefined;
  const result = data.result ?? 'b';
  const resultLabel = result === 'b' ? `${section.items[1]?.title || 'B'} won` : result === 'a' ? `${section.items[0]?.title || 'A'} held` : 'No clear winner';
  return <div className={`csb-ab is-${data.mode ?? 'wipe'}`}>
    {data.mode === 'side' ? <Side section={section} data={data} editorMode={editorMode} active={active} setActive={setActive} /> : <Wipe section={section} data={data} editorMode={editorMode} active={active} setActive={setActive} />}
    {(data.markers.length > 0 && data.showMarkers !== false) && <ol className="csb-ab-changes">{data.markers.map((m, i) => <li key={i} className={active === i ? 'is-active' : ''} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}><span className="csb-ab-num">{i + 1}</span><EditableText field={`abtest.markers.${i}.note`} value={m.note} /></li>)}</ol>}
    {data.metrics.length > 0 && <div className="csb-ab-results">
      <div className="csb-ab-verdict"><span className={`csb-ab-pill is-${result}`}>{resultLabel}</span><small><EditableText field="abtest.method" value={data.method || ''} /></small></div>
      <div className="csb-ab-metrics" style={{ '--ab-cols': Math.min(3, data.metrics.length) } as React.CSSProperties}>{data.metrics.map((m, i) => <MetricRow key={i} m={m} index={i} highlight={activeMetric === i} delay={i * .12} />)}</div>
    </div>}
  </div>;
}

/* ---------- Inspector controls ---------- */
export function ABTestControls({ section, onChange }: { section: CaseStudySection; onChange: (next: ABTestData) => void }) {
  const data: ABTestData = { ...defaultABTest(), ...(section.abtest ?? {}) };
  const set = (patch: Partial<ABTestData>) => onChange({ ...data, ...patch });
  const setMetric = (i: number, patch: Partial<ABMetric>) => set({ metrics: data.metrics.map((m, k) => k === i ? { ...m, ...patch } : m) });
  const setMarker = (i: number, patch: Partial<ABMarker>) => set({ markers: data.markers.map((m, k) => k === i ? { ...m, ...patch } : m) });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [a, b] = section.items;
  const find = async () => {
    if (!a?.image || !b?.image) { setNote({ text: 'Add both screenshots first.', error: true }); return; }
    setBusy(true); setNote(null);
    try {
      const { boxes, mismatch } = await detectChanges(a.image, b.image);
      if (!boxes.length) { setNote({ text: 'No visual differences found. Are these two different screens?', error: true }); return; }
      set({ markers: boxes.map((box, i) => ({ ...box, note: data.markers[i]?.note || `Describe change ${i + 1}` })), showMarkers: true });
      setNote({ text: `Found ${boxes.length} change${boxes.length > 1 ? 's' : ''}. Write a short note for each on the page, or remove ones that don't matter.${mismatch ? ' The screenshots are different sizes, so the boxes may be a little off.' : ''}` });
    } catch (error) { setNote({ text: error instanceof Error ? error.message : 'Could not compare the screenshots.', error: true }); }
    finally { setBusy(false); }
  };
  return <>
    <div className="csb-field"><span className="csb-field-label">Show versions</span><div className="csb-segment" role="group" aria-label="A/B layout">
      {([['wipe', 'Wipe'], ['side', 'Side by side']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={(data.mode ?? 'wipe') === v} onClick={() => set({ mode: v })}>{l}</button>)}
    </div></div>
    <div className="csb-inspector-divider" /><p className="csb-panel-kicker">What changed</p>
    <button type="button" className="csb-quiet-button" disabled={busy} onClick={() => void find()}>{busy ? 'Comparing…' : data.markers.length ? 'Find changes again' : 'Find changes automatically'}</button>
    {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`} role="status">{note.text}</p>}
    {data.markers.map((m, i) => <div key={i} className="csb-ab-ctl-row">
      <span className="csb-ab-ctl-num">{i + 1}</span>
      <input aria-label={`Change ${i + 1} note`} value={m.note} onChange={e => setMarker(i, { note: e.target.value })} />
      <select aria-label={`Change ${i + 1} moves metric`} value={m.metric ?? ''} onChange={e => setMarker(i, { metric: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">No metric</option>{data.metrics.map((mm, k) => <option key={k} value={k}>{mm.label}</option>)}</select>
      <button type="button" aria-label={`Remove change ${i + 1}`} onClick={() => set({ markers: data.markers.filter((_, k) => k !== i) })}>×</button>
    </div>)}
    <button type="button" className="csb-jm-add" onClick={() => set({ markers: [...data.markers, { x: .35, y: .4, w: .3, h: .15, note: `Describe change ${data.markers.length + 1}` }], showMarkers: true })}>+ Mark a change by hand</button>
    {data.markers.length > 0 && <label className="csb-check-field"><input type="checkbox" checked={data.showMarkers !== false} onChange={e => set({ showMarkers: e.target.checked })} /> Show numbered changes</label>}
    <p className="csb-field-note">Drag a box on the page to move it; drag its corner to resize.</p>
    <div className="csb-inspector-divider" /><p className="csb-panel-kicker">Results</p>
    <div className="csb-field"><label htmlFor="csb-ab-result">Outcome</label><select id="csb-ab-result" value={data.result ?? 'b'} onChange={e => set({ result: e.target.value as ABTestData['result'] })}><option value="b">B won</option><option value="a">A held (B didn't win)</option><option value="none">No clear winner</option></select></div>
    {data.metrics.map((m, i) => <div key={i} className="csb-ab-ctl-metric">
      <div className="csb-ab-ctl-line"><input aria-label={`Metric ${i + 1} name`} value={m.label} onChange={e => setMetric(i, { label: e.target.value })} /><button type="button" aria-label={`Remove metric ${i + 1}`} onClick={() => set({ metrics: data.metrics.filter((_, k) => k !== i), markers: data.markers.map(mk => mk.metric === i ? { ...mk, metric: undefined } : mk.metric !== undefined && mk.metric > i ? { ...mk, metric: mk.metric - 1 } : mk) })}>×</button></div>
      <div className="csb-segment" role="group" aria-label={`Metric ${i + 1} type`}>{([['rate', '%'], ['number', 'Number'], ['votes', 'People']] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={m.kind === v} onClick={() => setMetric(i, { kind: v, ...(v === 'votes' ? { a: m.kind === 'votes' ? m.a : '1', b: m.kind === 'votes' ? m.b : '4', of: m.of || '5' } : {}) })}>{l}</button>)}</div>
      {m.kind === 'votes'
        ? <div className="csb-ab-ctl-line"><input type="number" min={0} aria-label="Preferred B" value={m.b} onChange={e => setMetric(i, { b: e.target.value })} /><span>of</span><input type="number" min={1} aria-label="Participants" value={m.of ?? ''} onChange={e => setMetric(i, { of: e.target.value })} /><span>preferred B</span></div>
        : <div className="csb-ab-ctl-line"><span>A</span><input aria-label={`Metric ${i + 1} A value`} inputMode="decimal" value={m.a} onChange={e => setMetric(i, { a: e.target.value })} /><span>B</span><input aria-label={`Metric ${i + 1} B value`} inputMode="decimal" value={m.b} onChange={e => setMetric(i, { b: e.target.value })} />
            {m.kind === 'number' && <input className="is-unit" aria-label="Unit" placeholder="unit" value={m.unit ?? ''} onChange={e => setMetric(i, { unit: e.target.value })} />}</div>}
      {m.kind !== 'votes' && <label className="csb-check-field"><input type="checkbox" checked={m.better === 'lower'} onChange={e => setMetric(i, { better: e.target.checked ? 'lower' : 'higher' })} /> Lower is better (e.g. time, errors)</label>}
    </div>)}
    {data.metrics.length < 3 && <button type="button" className="csb-jm-add" onClick={() => set({ metrics: [...data.metrics, { label: 'New metric', kind: 'rate', a: '20', b: '25', better: 'higher' }] })}>+ Add metric</button>}
    <p className="csb-field-note">Edit the test details line (method, sample, confidence) on the page.</p>
  </>;
}
