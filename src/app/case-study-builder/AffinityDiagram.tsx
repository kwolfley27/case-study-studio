import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate as animateValue, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { publicAnonKey } from '../../utils/supabase/info';
import { EditableText, EditingContext } from './EditableText';
import { useExpressive, useReducedMotion, useScrollProgress } from './MotionKit';
import { ENDPOINT, PASSCODE_KEY } from './AiDraft';
import type { CaseStudySection } from './model';

/*
  Affinity diagram (contextual inquiry or usability tests), built bottom-up:
    yellow  single observations rooted in the data (the building blocks)
    blue    what a cluster of yellow notes reveals, in the user's voice
    pink    a specific issue within an area of concern
    green   the overarching area of concern in the work practice
  On scroll the yellow notes start as one pile, then fly out into their clusters
  and the headings and hairlines appear above them.
*/

export type AffinityData = { groups: Array<{ title: string; issues: Array<{ title: string; aspects: Array<{ title: string; notes: string[] }> }> }>; unsorted?: string[] };

export const defaultAffinity = (): AffinityData => ({
  groups: [{ title: 'Organizing my information', issues: [
    { title: 'Show me what I have to do', aspects: [
      { title: 'I want it printed in front of me', notes: ['Transfers meetings from email to a wall calendar', 'Likes getting tasks by email rather than a call, so she can print them'] },
      { title: 'Daily to-do lists help me track progress', notes: ['Crosses items off a paper list through the day', 'Rewrites tomorrow’s list every evening before leaving'] },
    ] },
    { title: 'Keep me focused', aspects: [
      { title: 'Don’t interrupt me with non-critical stuff', notes: ['Mutes chat during deep work', 'Lets calls go to voicemail before noon', '“If it’s urgent they’ll walk over.”'] },
      { title: 'Let me batch the small things', notes: ['Answers email twice a day', 'Keeps a sticky of quick tasks for after lunch'] },
    ] },
  ] }],
  unsorted: [],
});

export const COLORS = { green: '#8fbf98', pink: '#e7a3ae', blue: '#9db7de', yellow: '#efd26b' };

/* ---------- Outline text <-> data (for the inspector) ---------- */
export function toOutline(d: AffinityData) {
  return d.groups.map(g => [`# ${g.title}`, ...g.issues.map(i => [`## ${i.title}`, ...i.aspects.map(a => [`### ${a.title}`, ...a.notes.map(n => `- ${n}`)].join('\n'))].join('\n'))].join('\n')).join('\n\n');
}
export function fromOutline(text: string, unsorted: string[] = []): AffinityData {
  const groups: AffinityData['groups'] = [];
  const g = () => groups.at(-1) ?? (groups.push({ title: 'Area of concern', issues: [] }), groups.at(-1)!);
  const i = () => { const gg = g(); return gg.issues.at(-1) ?? (gg.issues.push({ title: 'Issue', aspects: [] }), gg.issues.at(-1)!); };
  const a = () => { const ii = i(); return ii.aspects.at(-1) ?? (ii.aspects.push({ title: 'What this reveals', notes: [] }), ii.aspects.at(-1)!); };
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line) continue;
    if (line.startsWith('### ')) i().aspects.push({ title: line.slice(4).trim(), notes: [] });
    else if (line.startsWith('## ')) g().issues.push({ title: line.slice(3).trim(), aspects: [] });
    else if (line.startsWith('# ')) groups.push({ title: line.slice(2).trim(), issues: [] });
    else a().notes.push(line.replace(/^[-*•]\s*/, ''));
  }
  return { groups, unsorted };
}

/* ---------- View ---------- */
type Spot = { x: number; y: number; r: number; jx: number; jy: number };
type Geometry = { spots: Record<string, Spot>; cx: number; pileY: (v: number) => number };

const START = .58, END = .06; // board top position (fraction of the viewport) where sorting starts / ends

function Note({ id, text, field, p, geo, order, total, animate }: { id: string; text: string; field: string; p: MotionValue<number>; geo: React.MutableRefObject<Geometry | null>; order: number; total: number; animate: boolean }) {
  // Each note leaves the pile in its own slice of the scroll, so they peel off one after another.
  const s = .12 + (order / Math.max(1, total)) * .38; const e = s + .32;
  const rest = [-2.2, 1.4, -.8, 2, -1.5, .9, -2.6, 1.8][order % 8]; // a slight, hand-placed tilt
  const x = useMotionValue(0), y = useMotionValue(0), rotate = useMotionValue(rest), zIndex = useMotionValue(1);
  useEffect(() => {
    const update = (v: number) => {
      const g = geo.current; const spot = g?.spots[id];
      if (!animate || !g || !spot) { x.set(0); y.set(0); rotate.set(rest); zIndex.set(1); return; }
      const k = Math.min(1, Math.max(0, (v - s) / (e - s))); const left = 1 - (1 - Math.pow(1 - k, 3));
      x.set((g.cx + spot.jx - spot.x) * left); y.set((g.pileY(v) + spot.jy - spot.y) * left); rotate.set(rest + spot.r * left); zIndex.set(k < 1 ? 50 + total - order : 1);
    };
    update(p.get());
    const off = p.on('change', update);
    const tick = window.setInterval(() => update(p.get()), 250); // picks up re-measured geometry
    return () => { off(); window.clearInterval(tick); };
  }, [p, animate, id, s, e, total, order]);
  return <motion.li data-note={id} className="csb-af-note" style={{ x, y, rotate, zIndex }}><div className="csb-af-paper"><EditableText field={field} value={text} /></div></motion.li>;
}

function Reveal({ p, from = .62, children, className, as = 'div' }: { p: MotionValue<number>; from?: number; children: React.ReactNode; className?: string; as?: 'div' | 'h3' | 'h4' | 'p' }) {
  const opacity = useTransform(p, [from, from + .16], [0, 1]);
  const y = useTransform(p, [from, from + .16], [8, 0]);
  const Tag = motion[as];
  return <Tag className={className} style={{ opacity, y }}>{children}</Tag>;
}

function Line({ p, from = .58, vertical }: { p: MotionValue<number>; from?: number; vertical?: boolean }) {
  const scale = useTransform(p, [from, from + .2], [0, 1]);
  return <motion.span aria-hidden="true" className={`csb-af-rule ${vertical ? 'is-v' : ''}`} style={vertical ? { scaleY: scale } : { scaleX: scale }} />;
}

export function AffinityDiagram({ section, editorMode }: { section: CaseStudySection; editorMode: boolean }) {
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion();
  const expressive = useExpressive();
  // In the editor the board shows sorted; "Play the sort" runs the animation once on demand.
  const demo = useMotionValue(1);
  const [playing, setPlaying] = useState(false);
  const demoRef = useRef(false); demoRef.current = playing;
  const animate = (!editorMode && !reduce && expressive) || playing;
  const data: AffinityData = section.affinity ?? defaultAffinity();
  const boardRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const scroll = useScrollProgress(sentinel, START, END);
  const done = useTransform(scroll, () => 1);
  const p = playing ? demo : animate ? scroll : done;
  const play = () => { if (playing) return; demo.set(0); setPlaying(true); window.setTimeout(() => { void animateValue(demo, 1, { duration: 3.4, ease: 'linear' }).then(() => window.setTimeout(() => setPlaying(false), 400)); }, 350); };
  const geo = useRef<Geometry | null>(null);

  // Measure where every note ends up. The pile sits in the middle of the screen
  // while you scroll, and each note flies from it to its place.
  useLayoutEffect(() => {
    const board = boardRef.current; if (!board || !animate) return;
    const scroller = board.closest('.csb-preview-viewport') as HTMLElement | null;
    const measure = () => {
      const vh = scroller ? scroller.clientHeight : window.innerHeight;
      const spots: Record<string, Spot> = {}; let n = 0;
      board.querySelectorAll<HTMLElement>('[data-note]').forEach(el => {
        let x = 0, y = 0, node: HTMLElement | null = el;
        while (node && node !== board) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
        spots[el.dataset.note!] = { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2, r: Math.sin(n * 3.1) * 10, jx: Math.sin(n * 2.3) * 34, jy: Math.cos(n * 1.7) * 22 };
        n++;
      });
      // Board top (relative to the screen) moves linearly from START·vh to END·vh as progress goes 0 → 1.
      const pileY = (v: number) => { if (demoRef.current) return Math.min(240, board.offsetHeight / 2); const top = vh * (START - (START - END) * v); return Math.max(110, vh * .48 - top); };
      geo.current = { spots, cx: board.offsetWidth / 2, pileY };
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(board);
    return () => ro.disconnect();
  }, [animate, JSON.stringify(data.groups)]);

  const total = data.groups.reduce((s, g) => s + g.issues.reduce((t, i) => t + i.aspects.reduce((u, a) => u + a.notes.length, 0), 0), 0);
  let order = 0;
  const legend = [['green', 'Area of concern'], ['pink', 'Issue'], ['blue', 'What a cluster reveals'], ['yellow', 'Observation']] as const;

  return <div className={`csb-af ${playing ? 'is-playing' : ''}`} style={Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [`--af-${k}`, v])) as React.CSSProperties}>
    {editorMode && <button type="button" className="csb-af-play" data-no-slot onClick={e => { e.stopPropagation(); play(); }} disabled={playing}>{playing ? 'Sorting…' : '▶ Play the sort'}</button>}
    <div ref={sentinel} aria-hidden="true" />
    <div ref={boardRef} className="csb-af-board">
      {data.groups.map((g, gi) => <section key={gi} className="csb-af-group">
        <Line p={p} from={.7} />
        <Reveal p={p} from={.8} className="csb-af-green"><small>Area of concern</small><h3><EditableText field={`deep:affinity.groups.${gi}.title`} value={g.title} /></h3></Reveal>
        <div className="csb-af-issues">
          {g.issues.map((iss, ii) => <div key={ii} className="csb-af-issue" style={{ '--n': Math.max(1, iss.aspects.length) } as React.CSSProperties}>
            {ii > 0 && <Line p={p} from={.7} vertical />}
            <Reveal p={p} from={.76} className="csb-af-pink"><small>Issue {ii + 1}</small><h4><EditableText field={`deep:affinity.groups.${gi}.issues.${ii}.title`} value={iss.title} /></h4></Reveal>
            <div className="csb-af-aspects">
              {iss.aspects.map((asp, ai) => <div key={ai} className="csb-af-aspect">
                <Reveal p={p} from={.7} as="p" className="csb-af-blue">“<EditableText field={`deep:affinity.groups.${gi}.issues.${ii}.aspects.${ai}.title`} value={asp.title} />”</Reveal>
                <ul className="csb-af-notes">{asp.notes.map((note, ni) => { const id = `${gi}-${ii}-${ai}-${ni}`; const o = order++; return <Note key={id} id={id} text={note} field={`deep:affinity.groups.${gi}.issues.${ii}.aspects.${ai}.notes.${ni}`} p={p} geo={geo} order={o} total={total} animate={animate} />; })}</ul>
              </div>)}
            </div>
          </div>)}
        </div>
      </section>)}
    </div>
    {edit && (data.unsorted?.length ?? 0) > 0 && <div className="csb-af-unsorted"><small>{data.unsorted!.length} notes not sorted yet · sort them in the panel</small><ul>{data.unsorted!.map((n, k) => <li key={k} className="csb-af-note"><div className="csb-af-paper">{n}</div></li>)}</ul></div>}
  </div>;
}

/* ---------- Inspector ---------- */
export function AffinityControls({ section, onChange }: { section: CaseStudySection; onChange: (next: AffinityData) => void }) {
  const data: AffinityData = section.affinity ?? defaultAffinity();
  const [outline, setOutline] = useState(() => toOutline(data));
  const [inbox, setInbox] = useState((data.unsorted ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [passcode, setPasscode] = useState(() => { try { return localStorage.getItem(PASSCODE_KEY) || ''; } catch { return ''; } });
  const [needsPass, setNeedsPass] = useState(false);
  const lastSeen = useRef(JSON.stringify(data));
  if (JSON.stringify(data) !== lastSeen.current) { lastSeen.current = JSON.stringify(data); const fresh = toOutline(data); if (fresh !== outline) setOutline(fresh); }
  const unsortedList = (text: string) => text.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  const commit = (text: string, inboxText = inbox) => { const next = fromOutline(text, unsortedList(inboxText)); lastSeen.current = JSON.stringify(next); onChange(next); };

  const sortWithAI = async () => {
    const all = [...data.groups.flatMap(g => g.issues.flatMap(i => i.aspects.flatMap(a => a.notes))), ...unsortedList(inbox)];
    if (all.length < 3) { setNote({ text: 'Add at least three notes first.', error: true }); return; }
    if (!ENDPOINT) { setNote({ text: 'AI sorting is not connected on this site.', error: true }); return; }
    setBusy(true); setNote(null);
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey, 'X-Studio-Passcode': passcode }, body: JSON.stringify({ task: 'affinity', notes: all }) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) { setNeedsPass(true); throw new Error('Enter your Studio passcode to use AI sorting.'); }
      if (!response.ok || !Array.isArray(result.groups)) throw new Error(/Notion research link/.test(result.error || '') ? 'AI sorting needs the latest studio-ai-draft function deployed. Ask Codex to redeploy it.' : (result.error || 'Sorting failed. Try again.'));
      const next: AffinityData = { groups: result.groups, unsorted: Array.isArray(result.unsorted) ? result.unsorted : [] };
      setInbox((next.unsorted ?? []).join('\n')); lastSeen.current = JSON.stringify(next); setOutline(toOutline(next)); onChange(next);
      setNote({ text: `Sorted ${all.length} notes into ${next.groups.reduce((s, g) => s + g.issues.reduce((t, i) => t + i.aspects.length, 0), 0)} clusters. Read it through and rename anything that doesn't sound like your users.` });
    } catch (error) { setNote({ text: error instanceof TypeError ? 'Could not reach the AI service. Check your connection and try again.' : error instanceof Error ? error.message : 'Sorting failed.', error: true }); }
    finally { setBusy(false); }
  };

  return <>
    <div className="csb-field"><label htmlFor="csb-af-inbox">Notes to sort</label>
      <textarea id="csb-af-inbox" rows={5} value={inbox} placeholder={'One observation per line\nTransfers meetings to a wall calendar\n“I print everything I have to do.”'} onChange={e => { setInbox(e.target.value); commit(outline, e.target.value); }} />
      <span className="csb-field-note">Paste raw observations and quotes, one per line. AI clusters them bottom-up and names each cluster; it never rewrites your notes.</span>
    </div>
    {needsPass && <input type="password" autoComplete="off" className="csb-af-pass" value={passcode} placeholder="Studio passcode" aria-label="Studio passcode" onChange={e => { setPasscode(e.target.value); try { localStorage.setItem(PASSCODE_KEY, e.target.value); } catch { /* ignore */ } }} />}
    <button type="button" className="csb-primary-button" disabled={busy} onClick={() => void sortWithAI()}>{busy ? 'Sorting…' : 'Sort with AI'}</button>
    {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`} role="status">{note.text}</p>}
    <div className="csb-inspector-divider" />
    <div className="csb-field"><label htmlFor="csb-af-outline">Diagram outline</label>
      <textarea id="csb-af-outline" className="csb-af-outline" rows={14} spellCheck={false} value={outline} onChange={e => { setOutline(e.target.value); commit(e.target.value); }} />
      <span className="csb-field-note"><code># </code>green area · <code>## </code>pink issue · <code>### </code>blue cluster · <code>- </code>yellow note. Or edit any note right on the page.</span>
    </div>
  </>;
}
