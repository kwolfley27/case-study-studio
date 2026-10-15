import { useEffect, useRef, useState } from "react";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { MotionPrefs, useExpressive, useReducedMotion, useScrollProgress } from "./MotionKit";
import { ArrowDownRight, ArrowUpRight, FileUp, MoveRight } from "lucide-react";
import { EditingContext, EditableText } from "./EditableText";
import { WireframeShowcase } from "./WireframeShowcase";
import { ResearchVisual } from "./ResearchVisuals";
import { SurveyResults } from "./SurveyResults";
import { AnnotatedScreen, IssueFlow, Journey, Persona } from "./AppleExtras";
import { CoverHero, RevealHeader } from "./CoverHero";
import { PrototypeEmbed } from "./PrototypeEmbed";
import { Findings, Interviews, ScreenCarousel } from "./StoryBlocks";
import { WorkTimeline } from "./WorkTimeline";
import { ScreenRecording } from "./ScreenRecording";
import { ProjectDetails } from "./ProjectDetails";
import { ImmersiveHero } from "./ImmersiveHero";
import { DeviceFrame, HeroFramePicker } from "./DeviceFrame";
import { ProblemStatement } from "./ProblemStatement";
import { EmpathyMap } from "./EmpathyMap";
import { introHidden, navLabelFor, type BuilderStudy, type CaseStudySection } from "./model";
import { brandStyleVars, loadFont } from "./brand";

function Enter({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  return <motion.div ref={ref} className={className} initial={reduce ? false : { opacity: 0, y: 32 }} animate={visible ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 0.72, ease: [0.2, 0.8, 0.2, 1] }}>{children}</motion.div>;
}

function AnimatedValue({ value, duration = 1000, delay = 0 }: { value: string; duration?: number; delay?: number }) {
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
    const started = performance.now() + delay;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      setNumber((target * (1 - Math.pow(1 - progress, 3))).toFixed(decimals));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, value, reduce]);
  return <span ref={ref}>{match ? <>{match[1]}{number}{match[3]}</> : value}</span>;
}

function SectionIntro({ section, index }: { section: CaseStudySection; index: number }) {
  const hidden = introHidden(section);
  const o = { hideEyebrow: hidden.eyebrow, hideTitle: hidden.title, hideBody: hidden.body };
  const showBody = section.kind !== "narrative" && !o.hideBody;
  if (o.hideEyebrow && o.hideTitle && !showBody) return null;
  return <div className="csb-section-intro"><span className="csb-section-index">{String(index + 1).padStart(2, "0")}</span><div>{!o.hideEyebrow && <p className="csb-eyebrow"><EditableText field="eyebrow" value={section.eyebrow} /></p>}{!o.hideTitle && <h2><EditableText field="title" value={section.title} /></h2>}{showBody && <p className="csb-section-body"><EditableText field="body" value={section.body} /></p>}</div></div>;
}

function Metrics({ section }: { section: CaseStudySection }) {
  const items = section.items.slice(0, section.layout?.count ?? section.items.length);
  const expressive = useExpressive();
  return <div className={`csb-metric-grid ${expressive ? "is-expressive" : ""}`} style={{ "--csb-metric-columns": Math.min(3, items.length) } as React.CSSProperties}>{items.map((item, index) => <Enter key={index} className="csb-metric"><motion.span className="csb-metric-number" initial={expressive ? { opacity: 0, scale: .82, filter: "blur(12px)" } : false} whileInView={{ opacity: 1, scale: 1, filter: "blur(0px)" }} viewport={{ once: true, amount: .6 }} transition={{ duration: 1, delay: index * .14, ease: [0.22, 1, 0.36, 1] }} style={{ display: "inline-block", transformOrigin: "left bottom" }}><EditableText field={`items.${index}.value`} value={item.value || ""}><AnimatedValue value={item.value || "—"} duration={expressive ? 1800 : 1000} delay={expressive ? index * 140 : 0} /></EditableText></motion.span>{expressive && <motion.i className="csb-metric-bar" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: .6 }} transition={{ duration: 1.2, delay: .35 + index * .14, ease: [0.22, 1, 0.36, 1] }} />}<h3><EditableText field={`items.${index}.title`} value={item.title} /></h3><p><EditableText field={`items.${index}.detail`} value={item.detail} /></p></Enter>)}</div>;
}

function Flow({ section }: { section: CaseStudySection }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const scrolled = useScrollProgress(ref, .8, .5);
  const scaleX = useTransform(scrolled, v => reduce ? 1 : v);
  return <div ref={ref} className="csb-flow"><motion.div className="csb-flow-line" style={{ scaleX }} />{section.items.map((item, index) => <Enter key={index} className="csb-flow-step"><span className="csb-flow-dot">{String(index + 1).padStart(2, "0")}</span><h3>{<EditableText field={`items.${index}.title`} value={item.title} />}</h3><p>{<EditableText field={`items.${index}.detail`} value={item.detail} />}</p></Enter>)}</div>;
}

function Quotes({ section }: { section: CaseStudySection }) {
  return <div className="csb-quote-grid">{section.items.map((item, index) => <Enter key={index} className={`csb-quote csb-quote-${index % 3}`}><blockquote>“<EditableText field={`items.${index}.detail`} value={item.detail} />”</blockquote><div className="csb-quote-attribution"><span><EditableText field={`items.${index}.title`} value={item.title} /></span></div></Enter>)}</div>;
}

function Comparison({ section }: { section: CaseStudySection }) {
  return <div className="csb-comparison">{section.items.slice(0, 2).map((item, index) => <Enter key={index} className={`csb-comparison-panel ${index === 1 ? "is-after" : ""}`}><div className="csb-comparison-top"><span>{index === 0 ? "Before" : "After"}</span></div><h3><EditableText field={`items.${index}.title`} value={item.title} /></h3><p><EditableText field={`items.${index}.detail`} value={item.detail} /></p></Enter>)}</div>;
}

function Gallery({ section }: { section: CaseStudySection }) {
  const layout = section.layout;
  const columns = layout?.columns ?? 1;
  const items = section.items.slice(0, layout?.count ?? section.items.length);
  const phones = layout?.presentation === "phones";
  return <div className={`csb-gallery csb-gallery-adjustable ${phones ? "is-phones" : ""}`} style={{ "--csb-gallery-columns": columns, "--csb-gallery-gap": `${layout?.gap ?? 20}px`, "--csb-gallery-scale": (layout?.scale ?? 100) / 100 } as React.CSSProperties}>{items.map((item, index) => {
    const size = layout?.pattern === "bento" ? item.tileSize ?? (index === 0 ? "wide" : "standard") : "standard";
    return <Enter key={index} className={`csb-gallery-card csb-tile-${size}`}><div className="csb-gallery-image" data-image-slot={`${section.id}:${index}`}>{phones ? <div className="csb-gallery-phone"><div className="csb-gallery-phone-screen">{item.image ? <img src={item.image} alt={item.title} loading="lazy" /> : <span>Drop screen {String(index + 1).padStart(2, "0")}</span>}</div><span className="csb-gallery-phone-island" /></div> : item.image ? <img src={item.image} alt={item.title} loading="lazy" /> : <div className="csb-gallery-placeholder"><span>Visual {String(index + 1).padStart(2, "0")}</span><div className="csb-gallery-placeholder-shape" /></div>}</div><div className="csb-gallery-caption"><strong><EditableText field={`items.${index}.title`} value={item.title} /></strong><span><EditableText field={`items.${index}.detail`} value={item.detail} /></span></div></Enter>;
  })}</div>;
}

function FullWidthMedia({ section, editorMode, onUploadMedia }: { section: CaseStudySection; editorMode: boolean; onUploadMedia?: (sectionId: string, index: number, file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return <div className="csb-full-media-list">{section.items.map((item, index) => <figure className="csb-full-media-figure" key={index}>
    <div data-image-slot={`${section.id}:${index}`} className={`csb-full-media-stage ${dragging ? "is-dragging" : ""}`} onDragOver={editorMode ? event => { event.preventDefault(); setDragging(true); } : undefined} onDragLeave={editorMode ? () => setDragging(false) : undefined} onDrop={editorMode ? event => { event.preventDefault(); event.stopPropagation(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) onUploadMedia?.(section.id, index, file); } : undefined}>
      {item.image ? <img src={item.image} alt={item.title || "Case study visual"} loading="lazy" /> : editorMode ? <label className="csb-full-media-empty"><FileUp size={24} strokeWidth={1.4} /><strong>Drop an image or GIF here</strong><span>or click for files or a Figma link · original proportions preserved</span><input type="file" accept="image/*,.gif" onChange={event => { const file = event.target.files?.[0]; if (file) onUploadMedia?.(section.id, index, file); event.target.value = ""; }} /></label> : null}
      {editorMode && item.image && <span className="csb-full-media-drop-hint">Drop an image or GIF to replace</span>}
    </div>
    {(editorMode || item.title || item.detail) && <figcaption className="csb-full-media-caption"><strong><EditableText field={`items.${index}.title`} value={item.title} /></strong><span><EditableText field={`items.${index}.detail`} value={item.detail} /></span></figcaption>}
  </figure>)}</div>;
}

function SectionVisual({ section, editorMode, onUploadMedia, onSetPrototype }: { section: CaseStudySection; editorMode: boolean; onUploadMedia?: (sectionId: string, index: number, file: File) => void; onSetPrototype?: (sectionId: string, link: string) => void }) {
  switch (section.kind) {
    case "findings": return <Findings section={section} />;
    case "timeline": return <WorkTimeline section={section} />;
    case "details": return <ProjectDetails section={section} />;
    case "screenRecording": return <ScreenRecording section={section} editorMode={editorMode} />;
    case "interviews": return <Interviews section={section} />;
    case "carousel": return <ScreenCarousel section={section} />;
    case "prototype": return <PrototypeEmbed section={section} editorMode={editorMode} onSetLink={onSetPrototype} />;
    case "persona": return <Persona section={section} />;
    case "journey": return <Journey section={section} />;
    case "issueFlow": return <IssueFlow section={section} />;
    case "annotated": return <AnnotatedScreen section={section} />;
    case "problem": return <ProblemStatement section={section} />;
    case "empathy": return <EmpathyMap section={section} />;
    case "rows": return <ResearchVisual section={{ ...section, kind: "problem" }} />;
    case "methods": case "columns": case "competitors": case "gap": return <ResearchVisual section={section} />;
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

/* Case study side menu, like katelynwolfley.design: lists sections automatically,
   highlights the one being read, jumps on click. Labels are editable in place. */
function SideNav({ study, editorMode, onEditSection }: { study: BuilderStudy; editorMode: boolean; onEditSection?: (id: string, field: string, value: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const items = study.sections.filter(section => !section.hideFromNav);
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const nav = ref.current; if (!nav) return;
    const root = (nav.closest(".csb-preview-viewport") as HTMLElement | null);
    const target: HTMLElement | Window = root ?? window;
    const update = () => {
      const top = root ? root.getBoundingClientRect().top : 0;
      const line = top + (root ? root.clientHeight : window.innerHeight) * 0.35;
      let current: string | null = null;
      for (const section of items) { const el = document.getElementById(`builder-section-${section.id}`); if (el && el.getBoundingClientRect().top <= line) current = section.id; }
      setActive(current ?? items[0]?.id ?? null);
      const first = document.getElementById(`builder-section-${study.sections[0]?.id}`);
      setRevealed(!!first && first.getBoundingClientRect().top <= top + (root ? root.clientHeight : window.innerHeight) * 0.7);
    };
    update();
    target.addEventListener("scroll", update, { passive: true });
    return () => target.removeEventListener("scroll", update);
  }, [items.map(section => section.id).join()]);
  if (!items.length) return null;
  return <nav ref={ref} className={`csb-side-nav ${revealed || editorMode ? "is-revealed" : ""}`} aria-label="Case study sections">
    <p className="csb-side-nav-title">{study.client}</p>
    <ol>{items.map(section => <li key={section.id}>
      <EditingContext.Provider value={{ edit: editorMode ? (field, value) => onEditSection?.(section.id, field, value) : undefined, styles: section.textStyles }}>
        <a href={`#builder-section-${section.id}`} aria-current={active === section.id ? "true" : undefined} className={active === section.id ? "is-active" : ""} onClick={event => { if ((event.target as HTMLElement).isContentEditable) { event.preventDefault(); return; } event.preventDefault(); document.getElementById(`builder-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
          <EditableText field="navLabel" value={navLabelFor(section)} />
        </a>
      </EditingContext.Provider>
    </li>)}</ol>
  </nav>;
}

export function CaseStudyCanvas({ study, selectedSectionId, onSelectSection, editorMode = false, onEditSection, onEditStudy, onUploadMedia, onSetPrototype, bare = false, forceMotion = false }: { bare?: boolean; forceMotion?: boolean; study: BuilderStudy; selectedSectionId?: string | null; onSelectSection?: (id: string | null) => void; onEditSection?: (id:string,field:string,value:string)=>void; onEditStudy?: (field:string,value:string)=>void; onUploadMedia?: (sectionId:string,index:number,file:File)=>void; onSetPrototype?: (sectionId:string,link:string)=>void; editorMode?: boolean }) {
  const showNav = !bare && study.showNav !== false;
  useEffect(() => { if (study.brand?.display) loadFont(study.brand.display); if (study.brand?.text) loadFont(study.brand.text); }, [study.brand?.display, study.brand?.text]);
  const coverFirst = study.sections[0]?.kind === "coverHero";
  return <MotionPrefs.Provider value={{ force: forceMotion, level: study.motion ?? "expressive" }}><article className={`csb-motion-${study.motion ?? "expressive"} csb-canvas csb-theme-${study.theme ?? "editorial"} ${editorMode ? "csb-canvas-editable" : ""} ${showNav ? "has-side-nav" : ""}`} data-brand={study.brand ? "" : undefined} style={{ ...brandStyleVars(study.brand), "--csb-accent": study.accent, "--csb-accent-2": study.accent2 || study.accent } as React.CSSProperties}>
    {showNav && <SideNav study={study} editorMode={editorMode} onEditSection={onEditSection} />}
    {!coverFirst && !bare && study.hero?.style === "immersive" && <EditingContext.Provider value={{edit:editorMode?onEditStudy:undefined}}><ImmersiveHero study={study} editorMode={editorMode} /></EditingContext.Provider>}
    <div className="csb-doc-main">
    {!coverFirst && !bare && study.hero?.style === "reveal" && <EditingContext.Provider value={{edit:editorMode?onEditStudy:undefined}}><RevealHeader study={study} editorMode={editorMode} /></EditingContext.Provider>}
    {!coverFirst && !bare && !(study.hero?.style === "immersive" || study.hero?.style === "reveal") && <EditingContext.Provider value={{edit:editorMode?onEditStudy:undefined}}><header className="csb-hero" onClick={editorMode?()=>onSelectSection?.(null):undefined}>
      <div className="csb-hero-copy"><p className="csb-eyebrow"><EditableText field="client" value={study.client} /></p><h1><EditableText field="title" value={study.title} /></h1><p><EditableText field="summary" value={study.summary} /></p></div>
      <HeroFramePicker value={study.hero?.frame ?? "none"} />
      {study.hero?.frame && study.hero.frame !== "none" ? <div className="csb-hero-device"><DeviceFrame frame={study.hero.frame} image={study.heroImage} alt={`${study.title} hero visual`} slot="hero" hint={editorMode ? "Click to add your screen" : undefined} /></div>
        : <div className={`csb-hero-art ${study.heroImage ? "has-image" : ""}`} data-image-slot="hero">{study.heroImage ? <img src={study.heroImage} alt={`${study.title} hero visual`} /> : <div className="csb-designed-media"><strong>Hero visual</strong><span>1920 × 1080 · designed per case study</span></div>}</div>}
      {!study.sections.some(section => section.kind === "details") && <div className="csb-hero-facts"><div><small>Role</small><strong><EditableText field="role" value={study.role} /></strong></div><div><small>Timeline</small><strong><EditableText field="timeframe" value={study.timeframe} /></strong></div><div><small>Project</small><strong><EditableText field="client" value={study.client} /></strong></div></div>}
    </header></EditingContext.Provider>}
    {study.sections.map((section, index) => <EditingContext.Provider key={section.id} value={{edit:editorMode?(field,value)=>onEditSection?.(section.id,field,value):undefined,styles:section.textStyles}}><section id={`builder-section-${section.id}`} className={`csb-story-section csb-kind-${section.kind} csb-variant-${section.variant} ${section.kind === "fullMedia" ? "csb-full-media-section" : ""} ${selectedSectionId === section.id ? "is-selected" : ""}`} onClick={editorMode ? () => onSelectSection?.(section.id) : undefined}>
      {section.kind === "coverHero" ? <CoverHero section={section} editorMode={editorMode} onUploadMedia={onUploadMedia} /> : <div className="csb-section-inner"><Enter><SectionIntro section={section} index={index} /></Enter><SectionVisual section={section} editorMode={editorMode} onUploadMedia={onUploadMedia} onSetPrototype={onSetPrototype} /></div>}
    </section></EditingContext.Provider>)}
    {!bare && <footer className="csb-canvas-end"><span>Thank you for reading.</span><div className="csb-end-line" /><span>{study.client} / {study.timeframe}</span></footer>}
    </div>
  </article></MotionPrefs.Provider>;
}
