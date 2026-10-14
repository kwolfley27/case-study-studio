import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDownRight, ArrowUpRight, FileUp, MoveRight } from "lucide-react";
import { EditingContext, EditableText } from "./EditableText";
import { WireframeShowcase } from "./WireframeShowcase";
import { ResearchVisual } from "./ResearchVisuals";
import { SurveyResults } from "./SurveyResults";
import { AnnotatedScreen, IssueFlow, Journey, Persona } from "./AppleExtras";
import type { BuilderStudy, CaseStudySection } from "./model";

function Enter({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  return <motion.div ref={ref} className={className} initial={reduce ? false : { opacity: 0, y: 32 }} animate={visible ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 0.72, ease: [0.2, 0.8, 0.2, 1] }}>{children}</motion.div>;
}

function AnimatedValue({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const match = value.match(/^([^\d]*)(\d+(?:\.\d+)?)(.*)$/);
  const [number, setNumber] = useState(reduce || !match ? match?.[2] ?? value : "0");
  useEffect(() => {
    if (!visible || !match || reduce) return;
    const target = Number(match[2]);
    const decimals = (match[2].split(".")[1] ?? "").length;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1000);
      setNumber((target * (1 - Math.pow(1 - progress, 3))).toFixed(decimals));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, value, reduce]);
  return <span ref={ref}>{match ? <>{match[1]}{number}{match[3]}</> : value}</span>;
}

function SectionIntro({ section, index }: { section: CaseStudySection; index: number }) {
  return <div className="csb-section-intro"><span className="csb-section-index">{String(index + 1).padStart(2, "0")}</span><div><p className="csb-eyebrow"><EditableText field="eyebrow" value={section.eyebrow} /></p><h2><EditableText field="title" value={section.title} /></h2>{section.kind !== "narrative" && <p className="csb-section-body"><EditableText field="body" value={section.body} /></p>}</div></div>;
}

function Metrics({ section }: { section: CaseStudySection }) {
  return <div className="csb-metric-grid">{section.items.map((item, index) => <Enter key={index} className="csb-metric"><span className="csb-metric-number"><EditableText field={`items.${index}.value`} value={item.value || ""}><AnimatedValue value={item.value || "—"} /></EditableText></span><h3><EditableText field={`items.${index}.title`} value={item.title} /></h3><p><EditableText field={`items.${index}.detail`} value={item.detail} /></p></Enter>)}</div>;
}

function Flow({ section }: { section: CaseStudySection }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 45%"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return <div ref={ref} className="csb-flow"><motion.div className="csb-flow-line" style={{ scaleX }} />{section.items.map((item, index) => <Enter key={index} className="csb-flow-step"><span className="csb-flow-dot">{String(index + 1).padStart(2, "0")}</span><h3>{<EditableText field={`items.${index}.title`} value={item.title} />}</h3><p>{<EditableText field={`items.${index}.detail`} value={item.detail} />}</p></Enter>)}</div>;
}

function Quotes({ section }: { section: CaseStudySection }) {
  return <div className="csb-quote-grid">{section.items.map((item, index) => <Enter key={index} className={`csb-quote csb-quote-${index % 3}`}><blockquote>“<EditableText field={`items.${index}.detail`} value={item.detail} />”</blockquote><div className="csb-quote-attribution"><span><EditableText field={`items.${index}.title`} value={item.title} /></span></div></Enter>)}</div>;
}

function Comparison({ section }: { section: CaseStudySection }) {
  return <div className="csb-comparison">{section.items.slice(0, 2).map((item, index) => <Enter key={index} className={`csb-comparison-panel ${index === 1 ? "is-after" : ""}`}><div className="csb-comparison-top"><span>{index === 0 ? "Before" : "After"}</span></div><h3><EditableText field={`items.${index}.title`} value={item.title} /></h3><p><EditableText field={`items.${index}.detail`} value={item.detail} /></p></Enter>)}</div>;
}

function Gallery({ section }: { section: CaseStudySection }) {
  return <div className="csb-gallery">{section.items.map((item, index) => <Enter key={index} className="csb-gallery-card"><div className="csb-gallery-image">{item.image ? <img src={item.image} alt={<EditableText field={`items.${index}.title`} value={item.title} />} loading="lazy" /> : <div className="csb-gallery-placeholder"><span>Visual {String(index + 1).padStart(2, "0")}</span><div className="csb-gallery-placeholder-shape" /></div>}</div><div className="csb-gallery-caption"><strong>{<EditableText field={`items.${index}.title`} value={item.title} />}</strong><span>{<EditableText field={`items.${index}.detail`} value={item.detail} />}</span></div></Enter>)}</div>;
}

function FullWidthMedia({ section, editorMode, onUploadMedia }: { section: CaseStudySection; editorMode: boolean; onUploadMedia?: (sectionId: string, index: number, file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return <div className="csb-full-media-list">{section.items.map((item, index) => <figure className="csb-full-media-figure" key={index}>
    <div className={`csb-full-media-stage ${dragging ? "is-dragging" : ""}`} onDragOver={editorMode ? event => { event.preventDefault(); setDragging(true); } : undefined} onDragLeave={editorMode ? () => setDragging(false) : undefined} onDrop={editorMode ? event => { event.preventDefault(); event.stopPropagation(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onUploadMedia?.(section.id, index, file); } : undefined}>
      {item.image ? <img src={item.image} alt={item.title || "Case study visual"} loading="lazy" /> : editorMode ? <label className="csb-full-media-empty"><FileUp size={24} strokeWidth={1.4} /><strong>Drop an image or GIF here</strong><span>or click to choose a file · original proportions preserved</span><input type="file" accept="image/*,.gif" onChange={event => { const file = event.target.files?.[0]; if (file) onUploadMedia?.(section.id, index, file); event.target.value = ""; }} /></label> : null}
      {editorMode && item.image && <span className="csb-full-media-drop-hint">Drop an image or GIF to replace</span>}
    </div>
    {(editorMode || item.title || item.detail) && <figcaption className="csb-full-media-caption"><strong><EditableText field={`items.${index}.title`} value={item.title} /></strong><span><EditableText field={`items.${index}.detail`} value={item.detail} /></span></figcaption>}
  </figure>)}</div>;
}

function SectionVisual({ section, editorMode, onUploadMedia }: { section: CaseStudySection; editorMode: boolean; onUploadMedia?: (sectionId: string, index: number, file: File) => void }) {
  switch (section.kind) {
    case "persona": return <Persona section={section} />;
    case "journey": return <Journey section={section} />;
    case "issueFlow": return <IssueFlow section={section} />;
    case "annotated": return <AnnotatedScreen section={section} />;
    case "methods": case "columns": case "problem": case "competitors": case "gap": return <ResearchVisual section={section} />;
    case "wireframes": return <WireframeShowcase section={section} />;
    case "fullMedia": return <FullWidthMedia section={section} editorMode={editorMode} onUploadMedia={onUploadMedia} />;
    case "survey": return <SurveyResults section={section} />;
    case "metrics": return <Metrics section={section} />;
    case "flow": return <Flow section={section} />;
    case "quotes": return <Quotes section={section} />;
    case "comparison": return <Comparison section={section} />;
    case "gallery": return <Gallery section={section} />;
    default: return <Enter className="csb-editorial-statement"><span className="csb-editorial-glyph">✳</span><p>{<EditableText field="body" value={section.body} />}</p></Enter>;
  }
}

export function CaseStudyCanvas({ study, selectedSectionId, onSelectSection, editorMode = false, onEditSection, onEditStudy, onUploadMedia }: { study: BuilderStudy; selectedSectionId?: string | null; onSelectSection?: (id: string | null) => void; onEditSection?: (id:string,field:string,value:string)=>void; onEditStudy?: (field:string,value:string)=>void; onUploadMedia?: (sectionId:string,index:number,file:File)=>void; editorMode?: boolean }) {
  return <article className={`csb-canvas ${editorMode ? "csb-canvas-editable" : ""}`} style={{ "--csb-accent": study.accent } as React.CSSProperties}>
    <EditingContext.Provider value={{edit:editorMode?onEditStudy:undefined}}><header className="csb-hero" onClick={editorMode?()=>onSelectSection?.(null):undefined}>
      <div className="csb-hero-copy"><p className="csb-eyebrow"><EditableText field="client" value={study.client} /></p><h1><EditableText field="title" value={study.title} /></h1><p><EditableText field="summary" value={study.summary} /></p></div>
      <div className={`csb-hero-art ${study.heroImage ? "has-image" : ""}`}>{study.heroImage ? <img src={study.heroImage} alt={`${study.title} hero visual`} /> : <div className="csb-designed-media"><strong>Hero visual</strong><span>1920 × 1080 · designed per case study</span></div>}</div>
      <div className="csb-hero-facts"><div><small>Role</small><strong><EditableText field="role" value={study.role} /></strong></div><div><small>Timeline</small><strong><EditableText field="timeframe" value={study.timeframe} /></strong></div><div><small>Project</small><strong><EditableText field="client" value={study.client} /></strong></div></div>
    </header></EditingContext.Provider>
    {study.sections.map((section, index) => <EditingContext.Provider key={section.id} value={{edit:editorMode?(field,value)=>onEditSection?.(section.id,field,value):undefined}}><section id={`builder-section-${section.id}`} className={`csb-story-section csb-kind-${section.kind} csb-variant-${section.variant} ${section.kind === "fullMedia" ? "csb-full-media-section" : ""} ${selectedSectionId === section.id ? "is-selected" : ""}`} onClick={editorMode ? () => onSelectSection?.(section.id) : undefined}>
      <div className="csb-section-inner"><Enter><SectionIntro section={section} index={index} /></Enter><SectionVisual section={section} editorMode={editorMode} onUploadMedia={onUploadMedia} /></div>
    </section></EditingContext.Provider>)}
    <footer className="csb-canvas-end"><span>Thank you for reading.</span><div className="csb-end-line" /><span>{study.client} / {study.timeframe}</span></footer>
  </article>;
}
