import { motion, useReducedMotion } from 'motion/react';
import { EditableText } from './EditableText';
import type { CaseStudySection } from './model';

const lines = (value: string) => value.split(/\n+/).map(line => line.trim()).filter(Boolean);

export function Persona({ section }: { section: CaseStudySection }) {
  const reduce = useReducedMotion();
  const [person, goals, pains, day] = section.items;
  return <div className="csb-apple-persona">
    <div className="csb-apple-persona-profile">
      <div className="csb-apple-persona-portrait">{person?.image ? <img src={person.image} alt={`${person.title} portrait`} /> : <div><strong>Portrait</strong><span>880 × 1120 · designed media</span></div>}</div>
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

export function AnnotatedScreen({ section }: { section: CaseStudySection }) {
  const screen=section.items[0];
  const notes=section.items.slice(1,7);
  return <div className="csb-apple-annotated"><div className="csb-apple-annotation-side">{notes.slice(0,3).map((item,index)=><div key={index}><small>0{index+1}</small><h3><EditableText field={`items.${index+1}.title`} value={item.title}/></h3><p><EditableText field={`items.${index+1}.detail`} value={item.detail}/></p></div>)}</div><div className="csb-apple-annotated-phone"><span className="csb-apple-annotated-island"/>{screen?.image?<img src={screen.image} alt={screen.title||'Designed screen'}/>:<div className="csb-apple-annotated-empty"><strong>Designed screen</strong><span>700 × 1440 · designed media</span></div>}</div><div className="csb-apple-annotation-side">{notes.slice(3,6).map((item,index)=><div key={index}><small>0{index+4}</small><h3><EditableText field={`items.${index+4}.title`} value={item.title}/></h3><p><EditableText field={`items.${index+4}.detail`} value={item.detail}/></p></div>)}</div></div>;
}
