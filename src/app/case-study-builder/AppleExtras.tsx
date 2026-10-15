import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EditableText, EditingContext } from './EditableText';
import type { CaseStudySection } from './model';

const lines = (value: string) => value.split(/\n+/).map(line => line.trim()).filter(Boolean);

export function Persona({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const [person, goals, pains, day] = section.items;
  return <div className="csb-apple-persona">
    <div className="csb-apple-persona-profile">
      <div className="csb-apple-persona-portrait" data-image-slot={`${section.id}:0`}>{person?.image ? <img src={person.image} alt={`${person.title} portrait`} /> : <div><strong>Portrait</strong><span>880 × 1120 · designed media</span></div>}</div>
      <div className="csb-apple-persona-copy"><h3><EditableText field="items.0.title" value={person?.title || 'The person'} /></h3><p><EditableText field="items.0.detail" value={person?.detail || ''} /></p><span className="csb-apple-persona-traits"><EditableText field="items.0.value" value={person?.value || ''} /></span><div className="csb-apple-persona-lists">{[[goals,1],[pains,2]].map(([item,index]) => <div key={index}><h4><EditableText field={`items.${index}.title`} value={(item as typeof goals)?.title || ''} /></h4>{lines((item as typeof goals)?.detail || '').map((line,i) => <p key={i}>{line}</p>)}</div>)}</div></div>
    </div>
    <div className="csb-apple-persona-day"><h4><EditableText field="items.3.title" value={day?.title || 'A day in their life'} /></h4><div>{lines(day?.detail || '').map((line,index) => <motion.div key={index} initial={reduce?false:{opacity:0,x:-14}} whileInView={{opacity:1,x:0}} viewport={{once:true,amount:.6}} transition={{delay:index*.22,duration:.55,ease:[0.22,1,0.36,1]}}><i /><span>{String(index+1).padStart(2,'0')}</span><p>{line}</p></motion.div>)}</div></div>
  </div>;
}

function journeyPath(values: number[]) {
  const points = values.map((value,index) => ({x:80+index*220,y:190-Math.min(100,Math.max(0,value))*1.45}));
  return points.reduce((path, point, index) => index === 0 ? `M ${point.x} ${point.y}` : `${path} C ${(points[index-1].x+point.x)/2} ${points[index-1].y}, ${(points[index-1].x+point.x)/2} ${point.y}, ${point.x} ${point.y}`, '');
}

export function Journey({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const items = section.items.slice(0, 5);
  const values = items.map(item => Number(item.value) || 50);
  const path = journeyPath(values);
  const lowest = values.indexOf(Math.min(...values));
  return <div className="csb-apple-journey"><svg viewBox="0 0 1040 260" preserveAspectRatio="none" role="img" aria-label={`Emotion journey across ${items.map(item => item.title).join(', ')}`}><motion.path d={`${path} L 960 255 L 80 255 Z`} fill="var(--csb-accent)" initial={reduce?{opacity:.09}:{opacity:0}} whileInView={{opacity:.09}} viewport={{once:true}} transition={{delay:1.1,duration:.8}}/><motion.path d={path} fill="none" stroke="var(--csb-accent)" strokeWidth="3" initial={reduce ? false : {pathLength:0}} whileInView={{pathLength:1}} viewport={{once:true}} transition={{duration:1.4,ease:'easeInOut'}} />{values.map((value,index) => {const cy=190-Math.min(100,Math.max(0,value))*1.45;return <g key={index}>{index===lowest&&!reduce&&<motion.circle cx={80+index*220} cy={cy} r={7} fill="none" stroke="var(--csb-accent)" strokeWidth="2" style={{transformBox:'fill-box',transformOrigin:'center'}} initial={{scale:1,opacity:0}} whileInView={{scale:[1,3.2],opacity:[.6,0]}} viewport={{once:true}} transition={{delay:1.5,duration:1.4,repeat:2,ease:'easeOut'}}/>}<motion.circle cx={80+index*220} cy={cy} r={index===lowest?7:5} fill={index===lowest?'var(--csb-accent)':'white'} stroke="var(--csb-accent)" strokeWidth="3" style={{transformBox:'fill-box',transformOrigin:'center'}} initial={reduce?false:{scale:0}} whileInView={{scale:1}} viewport={{once:true}} transition={{delay:index*.3+.1,type:'spring',stiffness:420,damping:15}}/></g>;})}</svg><div className="csb-apple-journey-stages">{items.map((item,index) => <motion.div key={index} initial={reduce?false:{opacity:0,y:16}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:index*.12}}><small>0{index+1}</small><h3><EditableText field={`items.${index}.title`} value={item.title}/></h3><p className={index===lowest?'is-lowest':''}><EditableText field={`items.${index}.detail`} value={item.detail}/></p><span>Emotion {item.value || '50'}/100</span></motion.div>)}</div></div>;
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
