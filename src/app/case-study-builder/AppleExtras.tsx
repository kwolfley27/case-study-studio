import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useSpring, useTransform } from 'motion/react';
import { useExpressive, useReducedMotion, useScrollProgress } from './MotionKit';
import { EditableText, EditingContext } from './EditableText';
import type { CaseStudySection } from './model';

const lines = (value: string) => value.split(/\n+/).map(line => line.trim()).filter(Boolean);

type PersonaBlockType = 'list' | 'text' | 'quote' | 'day' | 'meter';
export const personaBlockType = (item: CaseStudySection['items'][number] | undefined, index: number): PersonaBlockType => item?.blockType ?? (index === 3 ? 'day' : 'list');
export const personaBlockPresets: Array<{ label: string; item: CaseStudySection['items'][number] }> = [
  { label: 'Goals', item: { blockType: 'list', title: 'Goals', detail: 'Goal one\nGoal two\nGoal three' } },
  { label: 'Pain points', item: { blockType: 'list', title: 'Pain points', detail: 'Pain one\nPain two\nPain three' } },
  { label: 'Motivations', item: { blockType: 'list', title: 'Motivations', detail: 'What drives them\nWhat they care about' } },
  { label: 'Frustrations', item: { blockType: 'list', title: 'Frustrations', detail: 'What gets in the way\nWhat they work around' } },
  { label: 'Needs', item: { blockType: 'list', title: 'Needs', detail: 'What they need from the product' } },
  { label: 'Tools they use', item: { blockType: 'list', title: 'Tools they use', detail: 'Tool one\nTool two' } },
  { label: 'Background', item: { blockType: 'text', title: 'Background', detail: 'A few sentences of context about their situation.' } },
  { label: 'Quote', item: { blockType: 'quote', title: 'In their words', detail: 'A short line that captures how they think.' } },
  { label: 'Scale (e.g. tech comfort)', item: { blockType: 'meter', title: 'Tech comfort', detail: 'Low · High', value: '70' } },
  { label: 'A day in their life', item: { blockType: 'day', title: 'A day in their life', detail: 'Morning: a key moment\nAfternoon: another moment\nEvening: a final moment' } },
  { label: 'Custom list', item: { blockType: 'list', title: 'Custom list', detail: 'First point\nSecond point' } },
];

function LineList({ index, detail, as = 'p' }: { index: number; detail: string; as?: 'p' | 'day' }) {
  const { edit } = useContext(EditingContext);
  const reduce = useReducedMotion();
  const raw = detail.split('\n').map(line => line.trim());
  const items = edit ? raw : raw.filter(Boolean);
  const add = (event: React.MouseEvent) => { event.stopPropagation(); edit?.(`items.${index}.detail`, [...raw.filter(Boolean), 'New point'].join('\n')); };
  if (as === 'day') return <div>{items.map((line, i) => <motion.div key={i} initial={reduce ? false : { opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: .6 }} transition={{ delay: i * .22, duration: .55, ease: [0.22, 1, 0.36, 1] }}><i /><span>{String(i + 1).padStart(2, '0')}</span><p><EditableText field={`items.${index}.detail.${i}`} value={line} /></p></motion.div>)}{edit && <button type="button" className="csb-persona-add" onClick={add}>+ Add moment</button>}</div>;
  return <>{items.map((line, i) => <p key={i}><EditableText field={`items.${index}.detail.${i}`} value={line} /></p>)}{edit && <button type="button" className="csb-persona-add" onClick={add}>+ Add point</button>}</>;
}

export function Persona({ section }: { section: CaseStudySection }) {
  const person = section.items[0];
  const blocks = section.items.slice(1).map((item, i) => ({ item, index: i + 1, type: personaBlockType(item, i + 1) }));
  const showPortrait = section.options?.portrait !== false;
  const side = blocks.filter(block => block.type !== 'day');
  const days = blocks.filter(block => block.type === 'day');
  return <div className={`csb-apple-persona ${showPortrait ? '' : 'is-no-portrait'}`}>
    <div className="csb-apple-persona-profile">
      {showPortrait && <div className="csb-apple-persona-portrait" data-image-slot={`${section.id}:0`}>{person?.image ? <img src={person.image} alt={`${person.title} portrait`} /> : <div><strong>Portrait</strong><span>880 × 1120 · designed media</span></div>}</div>}
      <div className="csb-apple-persona-copy">
        <h3><EditableText field="items.0.title" value={person?.title || 'The person'} /></h3>
        <p><EditableText field="items.0.detail" value={person?.detail || ''} /></p>
        <span className="csb-apple-persona-traits"><EditableText field="items.0.value" value={person?.value || ''} /></span>
        {side.length > 0 && <div className="csb-apple-persona-lists">{side.map(({ item, index, type }) => <div key={index} className={`csb-persona-block is-${type}`}>
          <h4><EditableText field={`items.${index}.title`} value={item.title} /></h4>
          {type === 'list' && <LineList index={index} detail={item.detail} />}
          {type === 'text' && <p className="csb-persona-text"><EditableText field={`items.${index}.detail`} value={item.detail} /></p>}
          {type === 'quote' && <blockquote>“<EditableText field={`items.${index}.detail`} value={item.detail} />”</blockquote>}
          {type === 'meter' && <div className="csb-persona-meter"><span><motion.i initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, Math.max(0, Number(item.value) || 0))}%` }} viewport={{ once: true }} transition={{ duration: .9, ease: [0.22, 1, 0.36, 1] }} /></span><small><EditableText field={`items.${index}.detail`} value={item.detail} /></small></div>}
        </div>)}</div>}
      </div>
    </div>
    {days.map(({ item, index }) => <div key={index} className="csb-apple-persona-day"><h4><EditableText field={`items.${index}.title`} value={item.title} /></h4><LineList index={index} detail={item.detail} as="day" /></div>)}
  </div>;
}

function journeyPath(values: number[]) {
  const points = values.map((value,index) => ({x:80+index*220,y:190-Math.min(100,Math.max(0,value))*1.45}));
  return points.reduce((path, point, index) => index === 0 ? `M ${point.x} ${point.y}` : `${path} C ${(points[index-1].x+point.x)/2} ${points[index-1].y}, ${(points[index-1].x+point.x)/2} ${point.y}, ${point.x} ${point.y}`, '');
}

function JourneyCalm({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const items = section.items.slice(0, 5);
  const values = items.map(item => Number(item.value) || 50);
  const path = journeyPath(values);
  const lowest = values.indexOf(Math.min(...values));
  return <div className="csb-apple-journey"><svg viewBox="0 0 1040 260" preserveAspectRatio="none" role="img" aria-label={`Emotion journey across ${items.map(item => item.title).join(', ')}`}><motion.path d={`${path} L 960 255 L 80 255 Z`} fill="var(--csb-accent)" initial={reduce?{opacity:.09}:{opacity:0}} whileInView={{opacity:.09}} viewport={{once:true}} transition={{delay:1.1,duration:.8}}/><motion.path d={path} fill="none" stroke="var(--csb-accent)" strokeWidth="3" initial={reduce ? false : {pathLength:0}} whileInView={{pathLength:1}} viewport={{once:true}} transition={{duration:1.4,ease:'easeInOut'}} />{values.map((value,index) => {const cy=190-Math.min(100,Math.max(0,value))*1.45;return <g key={index}>{index===lowest&&!reduce&&<motion.circle cx={80+index*220} cy={cy} r={7} fill="none" stroke="var(--csb-accent)" strokeWidth="2" style={{transformBox:'fill-box',transformOrigin:'center'}} initial={{scale:1,opacity:0}} whileInView={{scale:[1,3.2],opacity:[.6,0]}} viewport={{once:true}} transition={{delay:1.5,duration:1.4,repeat:2,ease:'easeOut'}}/>}<motion.circle cx={80+index*220} cy={cy} r={index===lowest?7:5} fill={index===lowest?'var(--csb-accent)':'white'} stroke="var(--csb-accent)" strokeWidth="3" style={{transformBox:'fill-box',transformOrigin:'center'}} initial={reduce?false:{scale:0}} whileInView={{scale:1}} viewport={{once:true}} transition={{delay:index*.3+.1,type:'spring',stiffness:420,damping:15}}/></g>;})}</svg><div className="csb-apple-journey-stages">{items.map((item,index) => <motion.div key={index} initial={reduce?false:{opacity:0,y:16}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:index*.12}}><small>0{index+1}</small><h3><EditableText field={`items.${index}.title`} value={item.title}/></h3><p className={index===lowest?'is-lowest':''}><EditableText field={`items.${index}.detail`} value={item.detail}/></p><span>Emotion {item.value || '50'}/100</span></motion.div>)}</div></div>;
}

/* Expressive: the curve draws as you scroll, a dot rides along it and each
   stage lights up when the dot reaches it. */
function JourneyScrub({ section }: { section: CaseStudySection }) {
  const items = section.items.slice(0, 5);
  const values = items.map(item => Number(item.value) || 50);
  const path = journeyPath(values);
  const lowest = values.indexOf(Math.min(...values));
  const n = items.length;
  const wrap = useRef<HTMLDivElement>(null);
  const line = useRef<SVGPathElement>(null);
  const progress = useSpring(useScrollProgress(wrap, .92, .55), { stiffness: 120, damping: 24, restDelta: .001 });
  const area = useTransform(progress, [.55, 1], [0, .1]);
  const cy = (v: number) => 190 - Math.min(100, Math.max(0, v)) * 1.45;
  const dotX = useMotionValue(80); const dotY = useMotionValue(cy(values[0] ?? 50));
  const dotOpacity = useTransform(progress, [0, .03], [0, 1]);
  const [reached, setReached] = useState(-1);
  useMotionValueEvent(progress, 'change', v => {
    const el = line.current; if (!el) return;
    const point = el.getPointAtLength(el.getTotalLength() * v);
    dotX.set(point.x); dotY.set(point.y);
    const idx = v <= 0.001 ? -1 : Math.min(n - 1, Math.floor((point.x - 80) / 220 + 0.08));
    setReached(r => r === idx ? r : idx);
  });
  return <div ref={wrap} className="csb-apple-journey is-scrub">
    <svg viewBox="0 0 1040 260" preserveAspectRatio="none" role="img" aria-label={`Emotion journey across ${items.map(item => item.title).join(', ')}`}>
      <motion.path d={`${path} L ${80 + (n - 1) * 220} 255 L 80 255 Z`} fill="var(--csb-accent)" style={{ opacity: area }} />
      <path d={path} fill="none" stroke="var(--csb-accent)" strokeOpacity=".14" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" />
      <motion.path ref={line} d={path} fill="none" stroke="var(--csb-accent)" strokeWidth="3.5" strokeLinecap="round" style={{ pathLength: progress }} />
      {values.map((value, index) => <motion.circle key={index} cx={80 + index * 220} cy={cy(value)} r={index === lowest ? 8 : 6} fill={index === lowest ? 'var(--csb-accent)' : 'white'} stroke="var(--csb-accent)" strokeWidth="3" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} initial={false} animate={{ scale: reached >= index ? 1 : 0.0001 }} transition={{ type: 'spring', stiffness: 460, damping: 14 }} />)}
      {reached >= lowest && <motion.circle cx={80 + lowest * 220} cy={cy(values[lowest])} r={8} fill="none" stroke="var(--csb-accent)" strokeWidth="2" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} initial={{ scale: 1, opacity: .6 }} animate={{ scale: 3.4, opacity: 0 }} transition={{ duration: 1.3, repeat: 2, ease: 'easeOut' }} />}
      <motion.circle cx={dotX} cy={dotY} r={11} fill="var(--csb-accent)" style={{ opacity: dotOpacity, filter: 'drop-shadow(0 0 10px var(--csb-accent))' }} />
      <motion.circle cx={dotX} cy={dotY} r={4.5} fill="white" style={{ opacity: dotOpacity }} />
    </svg>
    <div className="csb-apple-journey-stages">{items.map((item, index) => <div key={index} className={reached >= index ? 'is-reached' : ''}><small>0{index + 1}</small><h3><EditableText field={`items.${index}.title`} value={item.title} /></h3><p className={index === lowest ? 'is-lowest' : ''}><EditableText field={`items.${index}.detail`} value={item.detail} /></p><span>Emotion {item.value || '50'}/100</span></div>)}</div>
  </div>;
}

export function Journey({ section }: { section: CaseStudySection }) {
  return useExpressive() ? <JourneyScrub section={section} /> : <JourneyCalm section={section} />;
}

const issueColors: Record<string,string> = {A:'#30d158',C:'#bf5af2',R:'#ff453a',COM:'#ff9f0a',S:'#64d2ff'};
export function IssueFlow({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  return <div className="csb-apple-issue"><div className="csb-apple-issue-legend">{Object.entries({A:'Action',C:'Checking',R:'Retrieval',COM:'Communication',S:'Selection'}).map(([code,label])=><span key={code}><i style={{background:issueColors[code]}}/>{code} · {label}</span>)}</div><div className="csb-apple-issue-track">{section.items.map((item,index) => {const code=(item.value||'S').toUpperCase();return <motion.div key={index} initial={reduce?false:{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:index*.16}}><div className="csb-apple-issue-node"><h3><EditableText field={`items.${index}.title`} value={item.title}/></h3><p><i style={{background:issueColors[code]||issueColors.S}}/><span style={{color:issueColors[code]||issueColors.S}}>{code} · <EditableText field={`items.${index}.detail`} value={item.detail}/></span></p></div>{index<section.items.length-1&&<motion.span className="csb-apple-issue-arrow" aria-hidden="true" initial={reduce?false:{opacity:0,x:-10}} whileInView={{opacity:1,x:0}} viewport={{once:true}} transition={{delay:index*.16+.2,duration:.4}}>→</motion.span>}</motion.div>;})}</div><div className="csb-apple-issue-opportunities">{section.items.slice(0,3).map((item,index)=><div key={index}><small style={{color:issueColors[(item.value||'S').toUpperCase()]||issueColors.S}}>{item.value||'S'}{index+1}</small><h4><EditableText field={`items.${index}.title`} value={item.title}/></h4><p><EditableText field={`items.${index}.detail`} value={item.detail}/></p></div>)}</div></div>;
}

/* Where each callout points on the screen, as x,y percentages. */
export const defaultAnnotationPoint = (k: number) => `${k < 3 ? 26 : 74},${[24, 50, 76][k % 3]}`;
export const parsePoint = (value: string | undefined, k: number): [number, number] => {
  const [x, y] = (value || defaultAnnotationPoint(k)).split(',').map(Number);
  return [Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50, Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50];
};

export function AnnotatedScreen({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const { edit } = useContext(EditingContext);
  const screen = section.items[0];
  const notes = section.items.slice(1, 7);
  const wrap = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const anchors = useRef<Array<HTMLDivElement | null>>([]);
  const [drag, setDrag] = useState<{ k: number; point: [number, number] } | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const points = notes.map((item, k) => drag?.k === k ? drag.point : parsePoint(item.point, k));
  const key = points.map(p => p.join(',')).join('|');

  // Draw a line from each callout's edge to its dot on the screen.
  useLayoutEffect(() => {
    const measure = () => {
      const box = wrap.current?.getBoundingClientRect(); const screenBox = phone.current?.getBoundingClientRect();
      if (!box || !screenBox) return;
      setPaths(points.map(([x, y], k) => {
        const el = anchors.current[k]; if (!el) return '';
        const r = el.getBoundingClientRect(); const left = k < 3;
        const ax = (left ? r.right : r.left) - box.left; const ay = r.bottom - box.top;
        const px = screenBox.left - box.left + screenBox.width * x / 100; const py = screenBox.top - box.top + screenBox.height * y / 100;
        const edge = (left ? screenBox.left - 14 : screenBox.right + 14) - box.left;
        return `M${ax.toFixed(1)},${ay.toFixed(1)} H${edge.toFixed(1)} L${px.toFixed(1)},${py.toFixed(1)}`;
      }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (wrap.current) observer.observe(wrap.current);
    if (phone.current) observer.observe(phone.current);
    return () => observer.disconnect();
  }, [key, notes.length]);

  const startDrag = (k: number) => (event: React.PointerEvent) => {
    if (!edit) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget as HTMLElement; target.setPointerCapture(event.pointerId);
    const at = (e: { clientX: number; clientY: number }): [number, number] => { const r = phone.current!.getBoundingClientRect(); return [Math.round(Math.min(98, Math.max(2, (e.clientX - r.left) / r.width * 100))), Math.round(Math.min(98, Math.max(2, (e.clientY - r.top) / r.height * 100)))]; };
    let last = at(event); setDrag({ k, point: last });
    const move = (e: PointerEvent) => { last = at(e); setDrag({ k, point: last }); };
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); edit(`items.${k + 1}.point`, last.join(',')); setDrag(null); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };
  const nudge = (k: number) => (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 2; const [x, y] = points[k];
    const next = ({ ArrowLeft: [x - step, y], ArrowRight: [x + step, y], ArrowUp: [x, y - step], ArrowDown: [x, y + step] } as Record<string, number[]>)[event.key];
    if (!next || !edit) return; event.preventDefault(); edit(`items.${k + 1}.point`, `${Math.min(98, Math.max(2, next[0]))},${Math.min(98, Math.max(2, next[1]))}`);
  };
  const note = (item: CaseStudySection['items'][number], k: number) => <div key={k} ref={el => { anchors.current[k] = el; }} className={drag?.k === k ? 'is-active' : ''}><small>0{k + 1}</small><h3><EditableText field={`items.${k + 1}.title`} value={item.title} /></h3><p><EditableText field={`items.${k + 1}.detail`} value={item.detail} /></p></div>;

  return <div className={`csb-apple-annotated ${edit ? 'is-editing' : ''}`} ref={wrap}>
    <div className="csb-apple-annotation-side">{notes.slice(0, 3).map((item, i) => note(item, i))}</div>
    <div className="csb-apple-annotated-phone" ref={phone} data-image-slot={`${section.id}:0`}>
      <span className="csb-apple-annotated-island" />
      {screen?.image ? <img src={screen.image} alt={screen.title || 'Designed screen'} /> : <div className="csb-apple-annotated-empty"><strong>Designed screen</strong><span>700 × 1440 · designed media</span></div>}
      {points.map(([x, y], k) => <span key={k} className={`csb-annot-pin ${drag?.k === k ? 'is-dragging' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}
        role={edit ? 'slider' : undefined} tabIndex={edit ? 0 : undefined} aria-label={edit ? `Move pointer ${k + 1} (${notes[k]?.title}). Drag, or use arrow keys` : undefined}
        onPointerDown={startDrag(k)} onKeyDown={nudge(k)} onClick={event => edit && event.stopPropagation()}>{k + 1}</span>)}
    </div>
    <div className="csb-apple-annotation-side">{notes.slice(3, 6).map((item, i) => note(item, i + 3))}</div>
    <svg className="csb-annot-lines" aria-hidden="true">{paths.map((d, k) => d && <motion.path key={k} d={d} initial={reduce ? false : { pathLength: 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={{ once: true, amount: .3 }} transition={{ duration: .9, delay: .3 + k * .1, ease: [0.22, 1, 0.36, 1] }} />)}</svg>
    {edit && <p className="csb-annot-hint">Drag the numbered dots to point at the right spot on the screen</p>}
  </div>;
}
