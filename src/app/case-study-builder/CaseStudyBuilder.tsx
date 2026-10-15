import { PanelResizer, usePanelWidths } from "./PanelResizer";
import { ColorDots, bubbleOptions, inkOn } from "./ColorDots";
import { SectionBasics } from "./SectionBasics";
import { GradientPicker } from "./GradientElements";
import { ScreenGroupsControls } from "./ScreenGroups";
import { IsoShowcaseControls } from "./IsoShowcase";
import { GifBoardControls } from "./GifBoard";
import { ScreenTrioControls } from "./ScreenTrio";
import { FloatingDevicesControls } from "./FloatingDevices";
import { InterviewQuestionsControls } from "./InterviewQuestions";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal, ArrowDown, ArrowUp, ChevronDown, Copy, EyeOff, FlaskConical, ExternalLink, Palette, Presentation, Eye, FileDown, FileUp, Maximize2, Minimize2, Monitor, PanelLeft, PanelRight, Plus, RefreshCw, RotateCcw, Smartphone, Trash2, X } from "lucide-react";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { CaseStudyCanvas } from "./CaseStudyCanvas";
import { componentDescriptions, componentNames, createSection, isBuilderStudy, lucidExample, labelFromEyebrow, migrateStudy, navLabelFor, type BuilderStudy, type CaseStudySection, type SectionKind } from "./model";
import { FigmaSourcePicker, MACROAI_URL } from "./FigmaSourcePicker";
import { ComponentLibrary } from "./ComponentLibrary";
import { LayoutControls } from "./LayoutControls";
import { JOURNEY_ROWS, rowOn } from "./JourneyMap";
import { EMPATHY_PRESETS } from "./EmpathyMap";
import { DetailsControls, IntroToggles, ItemsManager, PersonaControls, RecordingControls } from "./SectionContentControls";
import { TextStyleBar } from "./TextStyleBar";
import { BrandPanel } from "./BrandPanel";
import { PresentMode } from "./PresentMode";
import { parseWhen, timelinePhases } from "./WorkTimeline";
import { SurveyDataSource } from "./research/StudyPicker";
import { templates, sectionFromTemplate, type ComponentTemplate } from "./library";
import { ImageSlotLayer, compressIntoDraft } from "./ImageSlots";
import { AiDraftCard } from "./AiDraft";
import { PrototypeControls } from "./PrototypeEmbed";
import { ABTestControls } from "./ABTest";
import { TaskSuccessControls } from "./TaskSuccess";
import { RoadmapControls } from "./Roadmap";
import { FlowCompareControls } from "./FlowCompare";
import { FlowDiffControls, UserFlowControls } from "./UserFlow";
import { JTBDControls } from "./JobsToBeDone";
import { ScrollSiteControls } from "./ScrollSite";
import { BarChartControls } from "./BarChart";
import { TypeSpecimenControls } from "./TypeSpecimen";
import { AnnotationControls } from "./AppleExtras";
import { QuotesControls } from "./Quotes";
import { InsightsControls } from "./Insights";
import { IterationsControls } from "./Iterations";
import { EndControls } from "./EndMore";
import { FigJamPull } from "./FigJamPull";
import { FigmaPullBar } from "./FigmaPull";
import { PublishDialog } from "./Publish";
import { Globe } from "lucide-react";
import { getStudy } from "./studyLibrary";
import { FeatureCompareControls, PositioningControls } from "./CompetitorViews";
import { AEIOUControls } from "./AEIOU";
import { AffinityControls } from "./AffinityDiagram";
import { ScreensControls } from "./Screens";
import { ShowcaseControls } from "./Showcase";
import { HomeGallery } from "./HomeGallery";
import { SectionNavigator } from "./SectionNavigator";
import { ProjectSettings } from "./ProjectSettings";
const ResearchWorkspace = lazy(() => import("./research/ResearchWorkspace").then(m => ({ default: m.ResearchWorkspace })));
import { freshCopy, newId, saveStudy } from "./studyLibrary";
import "./case-study-builder.css";
import "./apple-style.css";

const STORAGE_KEY = "katelyn-case-study-builder-v1";
const NOTION_DATABASE_URL = "https://www.notion.so/";
const NOTION_PROJECT_URL = "https://www.notion.so/";

// When the open study was too big for the quick local copy, only its id is kept; read that pointer
// once, before anything writes to storage, so the full study is reopened from IndexedDB.
let pendingRestoreId: string | null = null;
try { if (!localStorage.getItem("katelyn-case-study-builder-v1")) pendingRestoreId = localStorage.getItem("katelyn-case-study-builder-v1:id"); } catch { /* ignore */ }

function readLocalStudy(): BuilderStudy {
  // Each study needs its own id so Home can keep several side by side.
  const own = (s: BuilderStudy) => s.id === lucidExample.id ? { ...s, id: newId() } : s;
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); if (isBuilderStudy(saved)) return own(migrateStudy(saved)); } catch { /* ignore invalid local draft */ }
  return own(lucidExample);
}

function downloadStudy(study: BuilderStudy) {
  const blob = new Blob([JSON.stringify(study, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${study.slug || "case-study"}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CaseStudyBuilder() {
  const [study, setStudy] = useState<BuilderStudy>(readLocalStudy);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHome, setShowHome] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showResearch, setShowResearch] = useState<boolean | string>(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addedComponentName, setAddedComponentName] = useState<string | null>(null);
  const pendingAddedSection = useRef<string | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  // Workspace: "canvas" = full-screen page with floating panels (website-builder style),
  // "framed" = the original three-column layout, "preview" = no editing UI at all.
  const [view, setView] = useState<"canvas" | "framed" | "preview">(() => { try { return localStorage.getItem("csb-view") === "framed" ? "framed" : "canvas"; } catch { return "canvas"; } });
  const readPanel = (key: string) => { try { return localStorage.getItem(key) !== "closed"; } catch { return true; } };
  const [leftOpen, setLeftOpen] = useState(() => readPanel("csb-left"));
  const [leftRail, setLeftRail] = useState(() => { try { return localStorage.getItem("csb-left-rail") === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("csb-left-rail", leftRail ? "1" : "0"); } catch { /* storage off */ } }, [leftRail]);
  const panelW = usePanelWidths();
  const [gradPick, setGradPick] = useState(false);
  // The page sits between the panels instead of under them. When that leaves less room than a
  // desktop page needs, the page is scaled down (like zooming out in Figma) so it keeps its real layout.
  useEffect(() => {
    if (view !== "canvas") return;
    const vp = document.querySelector<HTMLElement>(".csb-view-canvas .csb-preview-viewport"); if (!vp) return;
    const fit = () => { const w = vp.clientWidth; vp.style.setProperty("--fit-zoom", String(Math.min(1, Math.max(.45, w / 1100)).toFixed(3))); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(vp);
    return () => { ro.disconnect(); vp.style.removeProperty("--fit-zoom"); };
  }, [view, showHome, showResearch]);
  const [rightOpen, setRightOpen] = useState(() => readPanel("csb-right"));
  const [showBrand, setShowBrand] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [forceMotion, setForceMotion] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const startPresenting = () => { enterPreview(); setReplayKey(k => k + 1); setPresenting(true); };
  const [replayKey, setReplayKey] = useState(0);
  const systemReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => { try { localStorage.setItem("csb-left", leftOpen ? "open" : "closed"); localStorage.setItem("csb-right", rightOpen ? "open" : "closed"); } catch { /* storage unavailable */ } }, [leftOpen, rightOpen]);
  const panelsHidden = !leftOpen && !rightOpen;
  const togglePanels = () => { const open = panelsHidden; setLeftOpen(open); setRightOpen(open); if (view === "framed") setView("canvas"); };
  useEffect(() => { if (view === "preview") return; try { localStorage.setItem("csb-view", view); } catch { /* storage unavailable */ } }, [view]);
  const lastEditView = useRef<"canvas" | "framed">("canvas");
  const enterPreview = () => { if (view !== "preview") lastEditView.current = view; setView("preview"); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key === "Escape" && view === "preview" && !document.documentElement.classList.contains("csb-presenting")) setView(lastEditView.current);
      if (view === "canvas" && event.key === "[") setLeftOpen(open => !open);
      if (view === "canvas" && event.key === "]") setRightOpen(open => !open);
      if (view !== "preview" && event.key === "\\") togglePanels();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // One-time starter projects added to the Home library (kept out of the way if deleted later).
  useEffect(() => {
    try { if (localStorage.getItem("csb-starter-steinway-v5")) return; } catch { return; }
    void import("./starters/steinway").then(async ({ buildSteinway, STEINWAY_ID }) => {
      const fresh = migrateStudy(buildSteinway());
      const existing = await getStudy(STEINWAY_ID).catch(() => undefined);
      // The very first version (section ids like "stw-system") was built from portfolio screenshots: rebuild it from the Figma frames, keeping any sections she added herself.
      if (existing && isBuilderStudy(existing) && existing.sections.some(s => /^stw-[a-z]/.test(s.id))) {
        const next = { ...fresh, slug: existing.slug || fresh.slug, publishedAt: existing.publishedAt, sections: [...fresh.sections, ...existing.sections.filter(s => !s.id.startsWith("stw-"))] };
        await saveStudy(next); setStudy(current => current.id === STEINWAY_ID ? next : current); return false;
      }
      if (existing && isBuilderStudy(existing)) {
        // Update in place, keeping her edits and any frames already pulled: grid pictures and the type picture go; live type and a grid overlay come in.
        const typeSpec = fresh.sections.find(s => s.kind === "typeSpec");
        const chart = fresh.sections.find(s => s.kind === "barChart");
        const drop = (s: CaseStudySection) => (s.kind === "gallery" && /grid/i.test(s.navLabel ?? "")) || (s.kind === "fullMedia" && s.navLabel === "Type specimen");
        const sections = existing.sections.filter(s => !drop(s)).map(s => {
          if (s.kind === "rows" && s.navLabel === "Type" && typeSpec) return typeSpec;
          if (s.id === "stw-3-fullMedia" && chart) return chart;
          if (s.kind === "scrollSite" && s.navLabel === "Wireframes") return { ...s, options: { ...(s.options ?? {}), gridDesk: 12, gridMob: 4 } };
          return s;
        });
        const next = { ...existing, sections };
        await saveStudy(next); setStudy(current => current.id === STEINWAY_ID ? next : current); return false;
      }
      await saveStudy(fresh); setStudy(current => current.id === STEINWAY_ID ? fresh : current); return true;
    }).then(added => { try { ["v2", "v3", "v4", "v5"].forEach(v => localStorage.setItem(`csb-starter-steinway-${v}`, "1")); } catch { /* ignore */ } setMessage({ text: added ? "New project added: Steinway PDP redesign. Find it on Home." : "Steinway updated: grid and type are now live, with no screenshots." }); }).catch(() => undefined);
  }, []);
  // Whatever copy of the Steinway project is open: if it is still the first, screenshot-based version, swap in the Figma-frame version.
  useEffect(() => {
    if (!study.id.startsWith("starter-steinway") || !study.sections.some(s => /^stw-[a-z]/.test(s.id))) return;
    void import("./starters/steinway").then(({ buildSteinway, STEINWAY_ID }) => {
      const fresh = migrateStudy(buildSteinway());
      setStudy(current => current.id !== STEINWAY_ID || !current.sections.some(s => /^stw-[a-z]/.test(s.id)) ? current : { ...fresh, slug: current.slug || fresh.slug, publishedAt: current.publishedAt, sections: [...fresh.sections, ...current.sections.filter(s => !s.id.startsWith("stw-"))] });
      setSelectedId(null);
    }).catch(() => undefined);
  }, [study.id, study.sections]);
  // Steinway: Wireframes and Final PDP become one two-stage section (wireframe → high fidelity, one click).
  useEffect(() => {
    if (!study.id.startsWith("starter-steinway") || study.sections.some(s => /^stw-[a-z]/.test(s.id))) return;
    if (!study.sections.some(s => s.kind === "scrollSite" && s.navLabel === "Wireframes" && !s.options?.compare)) return;
    try { if (localStorage.getItem("csb-steinway-stages")) return; } catch { return; }
    void import("./starters/steinway").then(({ combineStages }) => {
      setStudy(current => current.id.startsWith("starter-steinway") ? { ...current, sections: combineStages(current.sections) } : current);
      try { localStorage.setItem("csb-steinway-stages", "1"); } catch { /* ignore */ }
    }).catch(() => undefined);
  }, [study.id, study.sections]);
  // Steinway: the old mobile screenshots become one scrollable phone with her notes pinned on it.
  useEffect(() => {
    if (!study.id.startsWith("starter-steinway") || study.sections.some(s => /^stw-[a-z]/.test(s.id))) return;
    if (!study.sections.some(s => s.kind === "fullMedia" && s.navLabel === "Old mobile")) return;
    try { if (localStorage.getItem("csb-steinway-oldmobile")) return; } catch { return; }
    void import("./starters/steinway").then(({ oldMobileAsPhone }) => {
      setStudy(current => current.id.startsWith("starter-steinway") ? { ...current, sections: oldMobileAsPhone(current.sections) } : current);
      try { localStorage.setItem("csb-steinway-oldmobile", "1"); } catch { /* ignore */ }
    }).catch(() => undefined);
  }, [study.id, study.sections]);
  // Steinway: the old mobile phone gets a one-click switch to the new mobile design.
  useEffect(() => {
    if (!study.id.startsWith("starter-steinway")) return;
    if (!study.sections.some(s => s.kind === "scrollSite" && s.navLabel === "Old mobile" && !s.options?.compare)) return;
    if (!study.sections.some(s => s.kind === "scrollSite" && s.navLabel === "Wireframe to final")) return;
    try { if (localStorage.getItem("csb-steinway-oldnew")) return; } catch { return; }
    void import("./starters/steinway").then(({ oldNewMobile }) => {
      setStudy(current => current.id.startsWith("starter-steinway") ? { ...current, sections: oldNewMobile(current.sections) } : current);
      try { localStorage.setItem("csb-steinway-oldnew", "1"); } catch { /* ignore */ }
    }).catch(() => undefined);
  }, [study.id, study.sections]);
  // Keep every study in the Home library too (debounced; IndexedDB has room for images).
  // While the real study is still being reopened from IndexedDB, don't save the placeholder over anything.
  const restoring = useRef(!!pendingRestoreId);
  useEffect(() => { if (restoring.current) return; const t = window.setTimeout(() => { void saveStudy(study).catch(() => undefined); }, 600); return () => window.clearTimeout(t); }, [study]);
  // The quick local copy can be too big once Figma frames are pulled in; then only its id is kept and the full study lives in IndexedDB.
  useEffect(() => { if (restoring.current) return; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(study)); localStorage.removeItem(STORAGE_KEY + ":id"); } catch { try { localStorage.removeItem(STORAGE_KEY); localStorage.setItem(STORAGE_KEY + ":id", study.id); } catch { /* ignore */ } } }, [study]);
  useEffect(() => { const id = pendingRestoreId; pendingRestoreId = null; if (!id) return;
    void getStudy(id).then(saved => { restoring.current = false; if (saved && isBuilderStudy(saved)) setStudy(migrateStudy(saved)); else if (saved) { setStudy(migrateStudy(saved as BuilderStudy)); } }).catch(() => { restoring.current = false; }); }, []);
  // Ask the browser to keep this site's storage (so it isn't cleared when the disk is low).
  useEffect(() => { void navigator.storage?.persist?.().catch(() => undefined); }, []);
  useEffect(() => {
    if (showAdd || !pendingAddedSection.current) return;
    const id = pendingAddedSection.current;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`builder-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      pendingAddedSection.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [showAdd, study.sections]);
  const selected = study.sections.find(section => section.id === selectedId) ?? null;
  const updateStudy = (patch: Partial<BuilderStudy>) => setStudy(previous => ({ ...previous, ...patch }));
  const updateSection = (patch: Partial<CaseStudySection>) => setStudy(previous => ({ ...previous, sections: previous.sections.map(section => section.id === selectedId ? { ...section, ...patch } : section) }));
  const updateItem = (index: number, patch: Partial<CaseStudySection["items"][number]>) => selected && updateSection({ items: selected.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  const moveSection = (id: string, direction: -1 | 1) => setStudy(previous => {
    const sections = [...previous.sections];
    const index = sections.findIndex(section => section.id === id);
    const next = index + direction;
    if (next < 0 || next >= sections.length) return previous;
    [sections[index], sections[next]] = [sections[next], sections[index]];
    return { ...previous, sections };
  });
  const addSection = (template: ComponentTemplate) => {
    const base = sectionFromTemplate(template);
    // Project details start from what the case study already knows.
    const section = template.kind === "details" ? { ...base, items: base.items.map(item => item.title === "My role" && study.role ? { ...item, detail: study.role } : item.title === "Timeline" && study.timeframe ? { ...item, detail: study.timeframe } : item) } : base;
    setStudy(previous => ({ ...previous, sections: template.kind === "coverHero" ? [section, ...previous.sections] : [...previous.sections, section] }));
    pendingAddedSection.current = section.id;
    setSelectedId(section.id);
    setAddedComponentName(template.name);
    setShowAdd(false);
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!isBuilderStudy(parsed)) throw new Error("This file is not a case study builder export.");
      setStudy(migrateStudy(parsed));
      setSelectedId(null);
      setMessage({ text: "Case study imported into your local draft." });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Import failed.", error: true }); }
  };

  const uploadAsset = async (file: File | undefined, key: string, onSuccess: (url: string) => void) => {
    if (!file) return;
    if (file.type.startsWith("video/")) {
      // Videos (a sketch timelapse, a screen recording) are kept as they are, so they play smoothly.
      if (file.size > 40_000_000) { setMessage({ text: "That video is over 40 MB. Trim it or export it smaller (720p MP4 works well), then try again.", error: true }); return; }
      setUploadingKey(key); setMessage(null);
      try { const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Couldn't read that video.")); r.readAsDataURL(file); }); onSuccess(url); setMessage({ text: `${file.name} added. It plays on a silent loop.` }); }
      catch (error) { setMessage({ text: error instanceof Error ? error.message : "Video upload failed.", error: true }); }
      finally { setUploadingKey(null); }
      return;
    }
    if (!file.type.startsWith("image/")) { setMessage({ text: "Choose an image or a video file.", error: true }); return; }
    setUploadingKey(key);
    setMessage(null);
    try {
      // Big images (a long Figma frame copied as PNG) are resized and compressed to fit the draft.
      const image = await compressIntoDraft(file, 1_600_000, 1600);
      onSuccess(image);
      setMessage({ text: file.name === "figma-frame.png" || file.name === "image.png" ? "Frame added to the case study." : `${file.name} added to the case study.` });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Image upload failed.", error: true }); }
    finally { setUploadingKey(null); }
  };

  // Images edited directly on the canvas (see ImageSlots.tsx). slot = "hero" or "<sectionId>:<itemIndex>"
  const setSlotImage = useCallback((slot: string, url: string) => {
    if (slot === "hero") { setStudy(previous => ({ ...previous, heroImage: url || undefined })); return; }
    if (slot.startsWith("more:")) { const k = Number(slot.slice(5)); setStudy(previous => { const list = [...(previous.moreStudies?.length ? previous.moreStudies : [{ title: "" }, { title: "" }, { title: "" }])]; list[k] = { ...list[k], image: url || undefined }; return { ...previous, moreStudies: list }; }); return; }
    if (slot.startsWith("art:")) { const id = slot.slice(4); setStudy(previous => ({ ...previous, sections: previous.sections.map(section => section.id !== id ? section : { ...section, options: { ...section.options, art: url || undefined } }) })); return; }
    const [sectionId, rawIndex] = slot.split(":"); const index = Number(rawIndex);
    setStudy(previous => ({ ...previous, sections: previous.sections.map(section => section.id !== sectionId ? section : { ...section, items: section.items.map((item, i) => i === index ? { ...item, image: url, ...(url ? {} : { frameId: undefined }) } : item) }) }));
  }, []);
  const handleSlotFile = useCallback((slot: string, file: File) => { void uploadAsset(file, `slot-${slot}`, url => setSlotImage(slot, url)); }, [setSlotImage]);
  const handleSlotUrl = useCallback((slot: string, url: string, note?: string) => { setSlotImage(slot, url); setMessage({ text: note || "Image added." }); }, [setSlotImage]);
  const renderField = (label: string, value: string, onChange: (value: string) => void, multiline = false, note?: string, itemKey?: number) => {
    const id = `csb-${selectedId || "hero"}-${itemKey ?? "section"}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return <div className="csb-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea id={id} value={value} onChange={event => onChange(event.target.value)} rows={3} /> : <input id={id} value={value} onChange={event => onChange(event.target.value)} />}{note && <span className="csb-field-note">{note}</span>}</div>;
  };

  const openStudy = (next: BuilderStudy) => { void saveStudy(study).catch(() => undefined); setStudy(migrateStudy(next)); setSelectedId(null); setShowHome(false); setMessage(null); window.scrollTo(0, 0); };
  if (showResearch) return <Suspense fallback={null}><ResearchWorkspace project={{ id: study.id, title: study.title }} initialId={typeof showResearch === "string" ? showResearch : undefined} onExit={() => setShowResearch(false)} onAddSections={(sections, note) => { setStudy(previous => ({ ...previous, sections: [...previous.sections, ...sections] })); setSelectedId(sections[sections.length - 1]?.id ?? null); setShowResearch(false); setMessage({ text: `${note} It’s at the end of your case study.` }); }} /></Suspense>;
  if (showHome) return <HomeGallery onOpenResearch={id => { setShowHome(false); setShowResearch(id ?? true); }} current={study} onOpen={openStudy} onNew={async () => { const fresh = freshCopy(lucidExample, "Untitled case study"); await saveStudy(fresh).catch(() => undefined); openStudy(fresh); }} />;

  return <div className={`csb-app csb-view-${view} ${leftOpen ? "" : "hide-left"} ${rightOpen ? "" : "hide-right"} ${leftOpen && leftRail ? "left-rail" : ""}`} style={{ ["--csb-left-w" as string]: `${leftRail ? 60 : panelW.left}px`, ["--csb-right-w" as string]: `${panelW.right}px`, ["--inset-l" as string]: leftOpen ? `${(leftRail ? 60 : panelW.left) + 32}px` : "0px", ["--inset-r" as string]: rightOpen ? `${panelW.right + 32}px` : "0px" }}>
    <header className="csb-studio-header"><button type="button" className="csb-wordmark csb-wordmark-home" onClick={() => { void saveStudy(study).finally(() => setShowHome(true)); }} title="Home: all your case studies"><span className="csb-wordmark-icon">✳</span>Case Study Studio</button><span className="csb-header-separator" /><span className="csb-header-project" title={study.title}>{study.title}</span><div className="csb-hdr-modes" role="group" aria-label="Mode">
        <button type="button" aria-pressed={view !== "preview"} className="is-on">Edit</button>
        <button type="button" onClick={enterPreview} title="See the page as a visitor will">Preview</button>
        <button type="button" onClick={startPresenting} title="Full screen, one section at a time">Present</button>
      </div>
      <div className="csb-header-actions">
        <button type="button" className="csb-hdr-btn" onClick={() => setShowResearch(true)} title="Run surveys and studies, then add the results"><FlaskConical size={15} strokeWidth={1.7} /><span>Research</span></button>
        <button type="button" className="csb-hdr-btn" aria-pressed={showBrand} onClick={() => setShowBrand(open => !open)} title="Fonts, colours and logo"><Palette size={15} strokeWidth={1.7} /><span>Brand</span></button>
        <span className="csb-hdr-sep" aria-hidden="true" />
        <button type="button" className="csb-hdr-icon" onClick={togglePanels} aria-pressed={panelsHidden} aria-label={panelsHidden ? "Show the side panels" : "Hide the side panels"} title={panelsHidden ? "Show panels ( \\ )" : "Hide panels ( \\ )"}><PanelLeft size={16} strokeWidth={1.7} /></button>
        <HeaderMore items={[
          { label: view === "canvas" ? "Framed layout" : "Full-screen canvas", hint: view === "canvas" ? "Show the page inside a browser window" : "Edit the page edge to edge", onClick: () => setView(view === "canvas" ? "framed" : "canvas") },
          { label: "Download a copy", hint: "Save this case study as a file", onClick: () => downloadStudy(study) },
        ]} />
        <button className="csb-primary-button csb-hdr-publish" onClick={() => setShowPublish(true)}><Globe size={14} /> Publish</button>
      </div></header>
    <div className="csb-studio-shell">
      <aside className="csb-panel csb-panel-left" aria-label="Sections and connections">{!leftRail && <PanelResizer side="left" width={panelW.left} onWidth={panelW.setLeft} />}<button className="csb-panel-hide" onClick={() => setLeftRail(r => !r)} aria-label={leftRail ? "Expand the sections panel" : "Shrink the sections panel to icons"} title={leftRail ? "Expand" : "Shrink to icons"}><PanelLeft size={15} /></button><div className="csb-panel-scroll">
        <SectionNavigator study={study} selectedId={selectedId} onAdd={() => { setAddedComponentName(null); setShowAdd(true); }}
          onSelect={id => { setSelectedId(id); if (id) document.getElementById(`builder-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
          onMove={(from, to) => setStudy(previous => { if (to < 0 || to >= previous.sections.length) return previous; const sections = [...previous.sections]; const [moved] = sections.splice(from, 1); sections.splice(to, 0, moved); return { ...previous, sections }; })}
          onHide={id => setStudy(previous => ({ ...previous, sections: previous.sections.map(item => item.id === id ? { ...item, hidden: !item.hidden } : item) }))}
          onDuplicate={id => { const section = study.sections.find(item => item.id === id); if (!section) return; const copy = { ...structuredClone(section), id: crypto.randomUUID() }; setStudy(previous => { const at = previous.sections.findIndex(item => item.id === id); const sections = [...previous.sections]; sections.splice(at + 1, 0, copy); return { ...previous, sections }; }); setSelectedId(copy.id); }}
          onDelete={id => { const section = study.sections.find(item => item.id === id); setStudy(previous => ({ ...previous, sections: previous.sections.filter(item => item.id !== id) })); if (selectedId === id) setSelectedId(null); setMessage({ text: `Deleted “${section?.title ?? "section"}”.` }); }} />{addedComponentName && <div className="csb-add-confirmation" role="status"><strong>{addedComponentName} added</strong><button type="button" onClick={() => selectedId && document.getElementById(`builder-section-${selectedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>View section</button></div>}
        
        {message && <div className={`csb-inline-status ${message.error ? "csb-inline-error" : ""}`} role="status">{message.text}</div>}
        <div className="csb-nav-groups">
          <details className="csb-disclosure"><summary>Draft with AI</summary><div className="csb-disclosure-body"><AiDraftCard study={study} onApply={next => { setStudy(migrateStudy(next)); setSelectedId(null); }} notify={(text, error) => setMessage({ text, error })} /></div></details>
          <details className="csb-disclosure"><summary>Linked sources</summary><div className="csb-disclosure-body">
            {renderField("Notion research", study.sources?.notionUrl || "", notionUrl => updateStudy({ sources: { ...study.sources, notionUrl } }), false, "Research notes the AI briefs draw from.")}
        {study.sources?.notionUrl && /^https:\/\/(?:www\.)?(?:notion\.so|notion\.site|app\.notion\.com)\//.test(study.sources.notionUrl) && <a className="csb-connection-link" href={study.sources.notionUrl} target="_blank" rel="noreferrer">Open in Notion <ExternalLink size={11} /></a>}
            {renderField("Figma design file", study.sources?.figmaUrl || "", figmaUrl => updateStudy({ sources: { ...study.sources, figmaUrl } }), false, "The file your wireframe sections pull frames from.")}
          </div></details>
          <details className="csb-disclosure"><summary>File</summary><div className="csb-disclosure-body"><p className="csb-field-note">Your draft saves automatically in this browser.</p>
            <div className="csb-inspector-actions"><button className="csb-quiet-button" onClick={() => importRef.current?.click()}><FileUp size={13} /> Import</button><button className="csb-quiet-button" onClick={() => downloadStudy(study)}><FileDown size={13} /> Export</button><button className="csb-quiet-button" onClick={() => { if (window.confirm("Replace your draft with the example case study?")) { setStudy({ ...lucidExample, id: study.id }); setSelectedId(null); setMessage({ text: "Example restored." }); } }}><RotateCcw size={13} /> Reset</button></div></div></details>
        </div>
<input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => { void importJson(event.target.files?.[0]); event.target.value = ""; }} />
      </div></aside>
      <main className="csb-main">{view !== "preview" && <FigmaPullBar study={study} onImage={(slot, url) => setSlotImage(slot, url)} />}<div className="csb-main-toolbar"><div><h2>Live preview</h2><p>Click any text to edit · Enter to finish · Changes save automatically</p></div><div style={{ display: "flex", gap: 5 }}><button className="csb-icon-button" aria-label="Desktop preview" aria-pressed={!mobilePreview} onClick={() => setMobilePreview(false)} style={!mobilePreview ? { background: "#eaf0e9" } : undefined}><Monitor size={15} /></button><button className="csb-icon-button" aria-label="Mobile preview" aria-pressed={mobilePreview} onClick={() => setMobilePreview(true)} style={mobilePreview ? { background: "#eaf0e9" } : undefined}><Smartphone size={15} /></button></div></div><div className={`csb-preview-wrap ${mobilePreview ? "is-mobile" : ""}`}><div className="csb-browser-frame"><div className="csb-browser-chrome"><span className="csb-browser-dot" /><span className="csb-browser-dot" /><span className="csb-browser-dot" /><span className="csb-browser-url">case study / {study.slug}</span></div><div className="csb-preview-viewport"><CaseStudyCanvas key={view === "preview" ? `preview-${replayKey}` : "edit"} forceMotion={(forceMotion || presenting) && view === "preview"} study={study} selectedSectionId={selectedId} onSelectSection={setSelectedId} onEditStudy={(field,value)=>field==="moreStudies"?updateStudy({moreStudies:JSON.parse(value)}):field.startsWith("more.")?updateStudy({moreStudies:(()=>{const [,i,key]=field.split(".");const list=[...(study.moreStudies?.length?study.moreStudies:[{title:""},{title:""},{title:""}])];list[Number(i)]={...list[Number(i)],[key]:value};return list;})()}):field==="heroFrame"?updateStudy({hero:{style:"standard",bg:"accent",...study.hero,frame:value as NonNullable<BuilderStudy["hero"]>["frame"]}}):updateStudy({[field]:value})} onEditSection={(id,field,value)=>setStudy(previous=>({...previous,sections:previous.sections.map(section=>{if(section.id!==id)return section; if(field==="eyebrow"&&!section.options?.navCustom){return {...section,eyebrow:value,navLabel:labelFromEyebrow(value)||undefined};} if(field==="navLabel"){return {...section,navLabel:value,options:{...(section.options??{}),navCustom:true}};} if(field.startsWith("options.")){return {...section,options:{...(section.options??{}),[field.slice(8)]:value}};} if(field.startsWith("abtest.")||field.startsWith("deep:")){const path=field.replace(/^deep:/,"").split(".");const root=path[0];const next:any=structuredClone((section as any)[root]??{});let node=next;for(const key of path.slice(1,-1)){node=node?.[key];} if(node)node[path[path.length-1]]=value; return {...section,[root]:next};} if(field.startsWith("json:")){try{return {...section,[field.slice(5)]:JSON.parse(value)};}catch{return section;}} const parts=field.split("."); if(parts[0]==="phases"){const phases=timelinePhases(section).map((phase,i)=>i===Number(parts[1])?{...phase,[parts[2]]:value}:phase); const old=timelinePhases(section)[Number(parts[1])]?.title; return {...section,phases,items:parts[2]==="title"&&old!==undefined?section.items.map(item=>(item.value||"").trim()===old.trim()?{...item,value}:item):section.items};} if(parts[0]==="items"&&parts.length===4){const lineAt=Number(parts[3]);return {...section,items:section.items.map((item,i)=>{if(i!==Number(parts[1]))return item; const list=String((item as Record<string,unknown>)[parts[2]]??"").split("\n").map(line=>line.trim()).filter((line,k,all)=>line||k<all.length); list[lineAt]=value.replace(/\n/g," "); return {...item,[parts[2]]:list.join("\n")};})};} return parts[0]==="items"?{...section,items:section.items.map((item,i)=>i===Number(parts[1])?{...item,[parts[2]]:value}:item)}:{...section,[field]:value};})}))} onUploadMedia={(sectionId,index,file)=>{void uploadAsset(file,`full-media-${sectionId}-${index}`,url=>setStudy(previous=>({...previous,sections:previous.sections.map(section=>section.id===sectionId?{...section,items:section.items.map((item,i)=>i===index?{...item,image:url}:item)}:section)})));}} onSetPrototype={(sectionId, link, extra) => setStudy(previous => ({ ...previous, sections: previous.sections.map(section => section.id === sectionId ? { ...section, prototype: { ...section.prototype, device: section.prototype?.device ?? "phone", hideUi: section.prototype?.hideUi ?? true, ...(link !== section.prototype?.url && !extra ? { size: undefined } : {}), ...extra, url: link } } : section) }))} editorMode={view !== "preview"} /></div></div></div></main>
      {view === "canvas" && !leftOpen && <button className="csb-panel-tab csb-panel-tab-left" onClick={() => setLeftOpen(true)}><PanelLeft size={15} /> Sections</button>}
      {view === "canvas" && !rightOpen && <button className="csb-panel-tab csb-panel-tab-right" onClick={() => setRightOpen(true)}>Inspector <PanelRight size={15} /></button>}
      {presenting && view === "preview" && <PresentMode scroller={() => document.querySelector(".csb-preview-viewport")} onExit={() => { setPresenting(false); setView(lastEditView.current); }} />}
      {view === "preview" && !presenting && <div className="csb-preview-exit"><span>Previewing as a visitor</span>
        <div className="csb-motion-switch" role="group" aria-label="Motion">{(["calm", "expressive"] as const).map(level => <button key={level} aria-pressed={(study.motion ?? "expressive") === level} onClick={() => { updateStudy({ motion: level }); setReplayKey(k => k + 1); }}>{level === "calm" ? "Calm" : "Expressive"}</button>)}</div>
        <button onClick={() => { setReplayKey(k => k + 1); document.querySelector(".csb-preview-viewport")?.scrollTo({ top: 0 }); }}><RotateCcw size={13} /> Replay motion</button>
        {systemReduced && <button aria-pressed={forceMotion} onClick={() => { setForceMotion(f => !f); setReplayKey(k => k + 1); }} title="Your computer has Reduce Motion turned on, so animations are off. Visitors with it on will also see a calm page.">{forceMotion ? "Motion on" : "Play motion (Reduce Motion is on)"}</button>}
        <button onClick={() => setView(lastEditView.current)}><X size={14} /> Exit preview</button></div>}
      <aside className="csb-panel csb-panel-right" aria-label="Design settings"><PanelResizer side="right" width={panelW.right} onWidth={panelW.setRight} /><button className="csb-panel-hide" onClick={() => setRightOpen(false)} aria-label="Hide design panel" title="Hide ( ] )"><PanelRight size={15} /></button><div className="csb-panel-scroll"><p className="csb-panel-kicker">{selected ? "Design" : "Page settings"}</p><h2 className="csb-panel-title">{selectedId === "__end" ? "Ending" : selected ? componentNames[selected.kind] : "Project introduction"}</h2><p className="csb-panel-subtitle">{selectedId === "__end" ? "The close of the page: your thank-you line and links to your other case studies." : selected ? "Click any text or image on the page to change it. These settings shape how the section looks." : "Click the title, summary, details or hero image on the page to edit them."}</p>{selectedId === "__end" ? <EndControls study={study} update={updateStudy} /> : selected ? <div className="csb-insp">
        <div className="csb-insp-basics"><SectionBasics study={study} section={selected} onChange={updateSection} onChangeOther={(id, patch) => setStudy(previous => ({ ...previous, sections: previous.sections.map(x => x.id === id ? { ...x, ...patch } : x) }))} /></div>
        <LayoutControls section={selected} onChange={updateSection} />
        <PersonaControls section={selected} onChange={updateSection} />
        <RecordingControls section={selected} onChange={updateSection} />
        <DetailsControls section={selected} onChange={updateSection} />
        {selected.kind !== "quotes" && <div className="csb-insp-content"><ItemsManager section={selected} onChange={updateSection} /></div>}
        {selected.kind === "columns" && <div className="csb-field"><label htmlFor="column-count">Columns</label><select id="column-count" value={selected.columns || 3} onChange={e => updateSection({ columns: Number(e.target.value) as 2 | 3 | 4 })}><option value="2">2 columns</option><option value="3">3 columns</option><option value="4">4 columns</option></select></div>}
        {selected.kind === "wireframes" && <div className="csb-field"><label htmlFor="screen-fit-r">Screen fit</label><select id="screen-fit-r" value={selected.fit || "contain"} onChange={e => updateSection({ fit: e.target.value as "contain" | "cover" })}><option value="contain">Show full screen</option><option value="cover">Fill phone (crop)</option></select></div>}
        {selected.kind === "wireframes" && <><div className="csb-inspector-divider" /><div className="csb-connection-section"><FigmaSourcePicker key={selected.id} section={selected} sourceUrl={study.sources?.figmaUrl || MACROAI_URL} onApply={updateSection} onSourceChange={figmaUrl => updateStudy({ sources: { ...study.sources, figmaUrl } })} /></div></>}
        {selected.kind === "survey" && <><div className="csb-inspector-divider" /><SurveyDataSource section={selected} onApply={updateSection} onOpenResearch={() => setShowResearch(true)} /></>}
        {selected.kind === "showcase" && <><div className="csb-inspector-divider" /><ShowcaseControls section={selected} onChange={updateSection} /></>}
        {["screenFocus", "screenStory", "screenStrip"].includes(selected.kind) && <><div className="csb-inspector-divider" /><ScreensControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "affinity" && <><div className="csb-inspector-divider" /><FigJamPull onImport={affinity => updateSection({ affinity })} /></>}
        {selected.kind === "affinity" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Affinity diagram</p><AffinityControls section={selected} onChange={affinity => updateSection({ affinity })} /></>}
        {selected.kind === "aeiou" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Observations</p><AEIOUControls section={selected} onItems={items => updateSection({ items })} /></>}
        {selected.kind === "annotated" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Device</p><div className="csb-segment" role="group" aria-label="Device"><button type="button" aria-pressed={selected.options?.device !== "desktop"} onClick={() => updateSection({ options: { ...(selected.options ?? {}), device: "phone" } })}>Phone</button><button type="button" aria-pressed={selected.options?.device === "desktop"} onClick={() => updateSection({ options: { ...(selected.options ?? {}), device: "desktop" } })}>Desktop page</button></div><p className="csb-field-note">Click the screen on the page to paste a Figma frame link (Copy link to selection).</p></>}
        {selected.kind === "barChart" && <><div className="csb-inspector-divider" /><BarChartControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "interviewQs" && <><div className="csb-inspector-divider" /><InterviewQuestionsControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "floatDevices" && <><div className="csb-inspector-divider" /><FloatingDevicesControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "screenTrio" && <><div className="csb-inspector-divider" /><ScreenTrioControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "gifBoard" && <><div className="csb-inspector-divider" /><GifBoardControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "isoShowcase" && <><div className="csb-inspector-divider" /><IsoShowcaseControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "screenGroups" && <><div className="csb-inspector-divider" /><ScreenGroupsControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "iterations" && <><div className="csb-inspector-divider" /><IterationsControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "insights" && <><div className="csb-inspector-divider" /><InsightsControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "quotes" && <><div className="csb-inspector-divider" /><QuotesControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "typeSpec" && <><div className="csb-inspector-divider" /><TypeSpecimenControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "scrollSite" && <><div className="csb-inspector-divider" /><ScrollSiteControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "jtbd" && <><div className="csb-inspector-divider" /><JTBDControls section={selected} onChange={jtbd => updateSection({ jtbd })} /></>}
        {selected.kind === "userFlow" && <><div className="csb-inspector-divider" /><UserFlowControls section={selected} onChange={userFlow => updateSection({ userFlow })} /></>}
        {selected.kind === "flowDiff" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Show while editing</p><div className="csb-segment" role="group" aria-label="Flow to show while editing">{([["before", "Before"], ["cut", "What changes"], ["after", "After"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={(selected.options?.ufdStage ?? "after") === v} onClick={() => updateSection({ options: { ...(selected.options ?? {}), ufdStage: v } })}>{l}</button>)}</div><p className="csb-field-note">On the page the chart pins while you scroll and changes from the old flow to the new one by itself.</p><FlowDiffControls section={selected} onChange={flowDiff => updateSection({ flowDiff })} /></>}
        {selected.kind === "flowCompare" && <><div className="csb-inspector-divider" /><FlowCompareControls section={selected} onChange={flowCompare => updateSection({ flowCompare })} /></>}
        {selected.kind === "featureCompare" && <><div className="csb-inspector-divider" /><FeatureCompareControls section={selected} onChange={featureCompare => updateSection({ featureCompare })} /></>}
        {selected.kind === "positioning" && <><div className="csb-inspector-divider" /><PositioningControls section={selected} onChange={positioning => updateSection({ positioning })} /></>}
        {selected.kind === "roadmap" && <><div className="csb-inspector-divider" /><RoadmapControls section={selected} onChange={roadmap => updateSection({ roadmap })} /></>}
        {selected.kind === "taskSuccess" && <><div className="csb-inspector-divider" /><TaskSuccessControls section={selected} onChange={updateSection} onOpenResearch={() => setShowResearch(true)} /></>}
        {selected.kind === "abtest" && <ABTestControls section={selected} onChange={abtest => updateSection({ abtest })} />}
        {selected.kind === "prototype" && <PrototypeControls section={selected} onChange={prototype => updateSection({ prototype })} />}
        {selected.kind === "competitors" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Chart data</p><p className="csb-field-note">Scores 0–5 for each criterion, in chart order. Rename the criteria on the page.</p>{selected.items.map((item, index) => <div className="csb-field" key={index}><label htmlFor={`csb-score-${index}`}>{item.title}</label><div className="csb-score-row">{Array.from({ length: 6 }, (_, k) => { const values = (item.value || "0,0,0,0,0,0").split(",").map(v => Number(v) || 0); return <input key={k} id={k === 0 ? `csb-score-${index}` : undefined} aria-label={`${item.title} criterion ${k + 1}`} type="number" min={0} max={5} step={0.5} value={values[k] ?? 0} onChange={event => { const next = Array.from({ length: 6 }, (_, n) => n === k ? Math.min(5, Math.max(0, Number(event.target.value) || 0)) : values[n] ?? 0); updateItem(index, { value: next.join(",") }); }} />; })}</div></div>)}</>}
        {selected.kind === "timeline" && (() => { const phases = timelinePhases(selected); const units = ["Week", "Day", "Sprint", "Month"]; return <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Timeline</p>
          <div className="csb-field"><label htmlFor="csb-wt-unit">Columns are</label><select id="csb-wt-unit" value={selected.timeUnit || "Week"} onChange={event => updateSection({ timeUnit: event.target.value })}>{units.map(unit => <option key={unit} value={unit}>{unit}s</option>)}</select></div>
          <p className="csb-field-note">Rename activities and phases on the page. Here, set each activity's phase and when it ran.</p>
          {selected.items.map((item, index) => { const [start, end] = parseWhen(item.when); const setWhen = (a: number, b: number) => updateItem(index, { when: a === b ? String(a) : `${a}-${Math.max(a, b)}` }); return <div className="csb-wt-row" key={index}>
            <span title={item.title}>{item.title || `Activity ${index + 1}`}</span>
            <select aria-label={`${item.title} phase`} value={item.value || ""} onChange={event => updateItem(index, { value: event.target.value })}>{phases.map(phase => <option key={phase.title} value={phase.title}>{phase.title}</option>)}</select>
            <input aria-label={`${item.title} starts`} type="number" min={1} max={24} value={start} onChange={event => { const a = Math.max(1, Math.min(24, Number(event.target.value) || 1)); setWhen(a, Math.max(a, end)); }} />
            <input aria-label={`${item.title} ends`} type="number" min={1} max={24} value={end} onChange={event => setWhen(start, Math.max(start, Math.min(24, Number(event.target.value) || start)))} />
            <button type="button" className="csb-wt-remove" aria-label={`Remove ${item.title}`} onClick={() => updateSection({ items: selected.items.filter((_, i) => i !== index) })}>×</button>
          </div>; })}
          <div className="csb-wt-actions"><button type="button" className="csb-quiet-button" onClick={() => { const last = selected.items[selected.items.length - 1]; updateSection({ items: [...selected.items, { title: "New activity", detail: "", value: last?.value || phases[0]?.title || "Phase", when: String(parseWhen(last?.when)[1]) }] }); }}>+ Activity</button><button type="button" className="csb-quiet-button" onClick={() => updateSection({ phases: [...phases, { title: `Phase ${phases.length + 1}`, detail: "Add a note" }] })}>+ Phase</button>{phases.length > 1 && <button type="button" className="csb-quiet-button" onClick={() => { const gone = phases[phases.length - 1].title; updateSection({ phases: phases.slice(0, -1), items: selected.items.map(item => item.value === gone ? { ...item, value: phases[0].title } : item) }); }}>− Last phase</button>}</div>
        </>; })()}
        {selected.kind === "annotated" && <><div className="csb-inspector-divider" /><AnnotationControls section={selected} onChange={updateSection} /></>}
        {selected.kind === "coverHero" && <><div className="csb-inspector-divider" /><div className="csb-field"><label htmlFor="csb-cover-frame">Image frame</label><select id="csb-cover-frame" value={String(selected.options?.frame ?? "none")} onChange={event => updateSection({ options: { ...selected.options, frame: event.target.value } })}><option value="none">No frame (card)</option><option value="laptop">Laptop</option><option value="desktop">Desktop monitor</option><option value="browser">Browser window</option><option value="phone">Phone</option></select></div><p className="csb-field-note">Your screen sits inside the device and still scrolls up over the title.</p></>}
        {selected.kind === "empathy" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Empathy map</p>
          <div className="csb-field"><span className="csb-field-label">Quadrants</span><div className="csb-segment" role="group" aria-label="Empathy map quadrants">{([["classic", "Says · Thinks · Does · Feels"], ["senses", "Sees · Hears · …"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={(selected.options?.empathyPreset ?? "classic") === key} onClick={() => { const preset = EMPATHY_PRESETS[key]; updateSection({ options: { ...selected.options, empathyPreset: key }, items: selected.items.map((item, i) => i >= 1 && i <= 4 ? { ...item, title: preset[i - 1][0], value: preset[i - 1][1] } : item) }); }}>{label}</button>)}</div></div>
          {[5, 6].map(index => <label key={index} className="csb-check-field"><input type="checkbox" checked={!!selected.items[index] && !selected.items[index].hidden} onChange={event => { const items = [...selected.items]; while (items.length <= index) items.push({ title: items.length === 5 ? "Pains" : "Gains", detail: "", hidden: true }); items[index] = { ...items[index], hidden: !event.target.checked }; updateSection({ items }); }} /> {index === 5 ? "Pains" : "Gains"}</label>)}
          <p className="csb-field-note">Click the circle to add a photo. Edit every note on the page.</p></>}
        {selected.kind === "problem" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Problem statement</p><div className="csb-field"><span className="csb-field-label">Layout</span><div className="csb-segment" role="group" aria-label="Problem statement layout">{([["statement", "Statement"], ["rows", "Rows"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={(selected.options?.layout ?? "statement") === value} onClick={() => updateSection({ options: { ...selected.options, layout: value } })}>{label}</button>)}</div></div><p className="csb-field-note">{selected.options?.layout === "rows" ? "Who, Needs and Because as rows under the section title." : "One sentence as the headline. Edit each part on the page."}</p>
        {selected.kind === "problem" && selected.options?.layout !== "rows" && (() => { const value = String(selected.options?.markColor || "accent"); const set = (v: string) => updateSection({ options: { ...(selected.options ?? {}), markColor: v } }); const presets: Array<[string, string, string]> = [["accent", "Accent", "var(--csb-accent)"], ["accent2", "Accent 2", "var(--csb-accent-2, var(--csb-accent))"], ["ink", "Black", "#000"]]; const custom = value.startsWith("#"); const markStyle = selected.options?.markStyle === "underline" ? "underline" : "marker"; return <><div className="csb-field"><span className="csb-field-label">Emphasis</span><div className="csb-segment" role="group" aria-label="Emphasis style">{([["marker", "Highlighter"], ["underline", "Underline"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={markStyle === v} onClick={() => updateSection({ options: { ...(selected.options ?? {}), markStyle: v } })}>{l}</button>)}</div></div><div className="csb-field"><span className="csb-field-label">{markStyle === "marker" ? "Highlight colour" : "Underline colour"}</span><ColorDots label="Emphasis colour" custom value={value} onChange={set} options={[{ value: "accent", label: "Accent", color: study.accent }, ...(study.accent2 ? [{ value: "accent2", label: "Accent 2", color: study.accent2 }] : []), { value: "ink", label: "Black", color: "#000000" }]} /></div></>; })()}
          {[3, 4].map(index => { const defaults = [{ title: "How might we", detail: "show what's open before people commit?" }, { title: "We'll know it worked when", detail: "first-week bookings go up" }][index - 3]; const item = selected.items[index]; return <label key={index} className="csb-check-field"><input type="checkbox" checked={!!item && !item.hidden} onChange={event => { const items = [...selected.items]; while (items.length < index) items.push({ title: "", detail: "", hidden: true }); items[index] = { ...(item ?? defaults), hidden: !event.target.checked }; updateSection({ items }); }} /> {index === 3 ? "How might we… question" : "Success measure"}</label>; })}</>}
        {((selected.kind === "problem" && selected.options?.layout !== "rows" && selected.items[3] && !selected.items[3].hidden) || (selected.kind === "quotes" && selected.options?.quoteStyle === "chat")) && (() => { const key = selected.kind === "problem" ? "bubble" : "meBubble"; const v = String(selected.options?.[key] || "#000000"); return <div className="csb-field"><span className="csb-field-label">{selected.kind === "problem" ? "“How might we” bubble" : "Your questions’ bubble"}</span><ColorDots label="Bubble colour" custom value={v} options={bubbleOptions(study.accent, study.accent2)} onChange={c => updateSection({ options: { ...(selected.options ?? {}), [key]: c, [key + "Ink"]: inkOn(c) } })} /></div>; })()}
        {selected.kind === "journey" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Rows to show</p>
          <label className="csb-check-field"><input type="checkbox" checked={rowOn(selected, "scope")} onChange={event => updateSection({ options: { ...selected.options, row_scope: event.target.checked } })} /> User · goal · scenario</label>
          {JOURNEY_ROWS.map(row => <label key={row.key} className="csb-check-field"><input type="checkbox" checked={rowOn(selected, row.key)} onChange={event => updateSection({ options: { ...selected.options, [`row_${row.key}`]: event.target.checked } })} /> {row.label}</label>)}
          <div className="csb-inspector-divider" /><p className="csb-panel-kicker">Emotion</p><p className="csb-field-note">50 is neutral. Above is positive, below is negative.</p>
          {selected.items.slice(0, 6).map((item, index) => <div className="csb-field" key={index}><label htmlFor={`csb-emotion-${index}`}>{item.title} <output>{item.value || 50}</output></label><input id={`csb-emotion-${index}`} type="range" min={0} max={100} value={Number(item.value) || 50} onChange={event => updateItem(index, { value: event.target.value })} /></div>)}</>}
        {selected.kind === "issueFlow" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Issue codes</p>{selected.items.map((item, index) => <div className="csb-field" key={index}><label htmlFor={`csb-code-${index}`}>{item.title}</label><select id={`csb-code-${index}`} value={(item.value || "S").toUpperCase()} onChange={event => updateItem(index, { value: event.target.value })}><option value="A">A · Action</option><option value="C">C · Checking</option><option value="R">R · Retrieval</option><option value="COM">COM · Communication</option><option value="S">S · Selection</option></select></div>)}</>}
        <div className="csb-inspector-divider" />
        <div className="csb-ai-brief"><p className="csb-panel-kicker">AI assistance brief</p><p>{templates.find(t=>t.id===selected.templateId||(!selected.templateId&&t.kind===selected.kind))?.ai}</p><button className="csb-quiet-button" onClick={async()=>{const t=templates.find(t=>t.id===selected.templateId||(!selected.templateId&&t.kind===selected.kind));try{await navigator.clipboard.writeText(`${t?.ai}\n\nProject: ${study.title}\nProject sources: ${JSON.stringify(study.sources||{})}\nFigma frame mapping: ${JSON.stringify(selected.figmaSource||{})}\nCurrent content: ${JSON.stringify(selected,null,2)}\n\nSource material: [paste your research notes here]`);setMessage({text:"AI brief copied. Paste it with your source notes into your AI tool."});}catch{setMessage({text:"Clipboard unavailable. Select and copy the brief above.",error:true});}}}>Copy AI brief</button><small>Uses your notes as a starting point. Generation is not connected yet.</small></div>
        <div className="csb-inspector-divider" /><div className="csb-inspector-actions"><button className="csb-quiet-button" onClick={() => { setStudy(previous => ({ ...previous, sections: previous.sections.filter(section => section.id !== selected.id) })); setSelectedId(null); }}><Trash2 size={13} /> Delete section</button><button className="csb-quiet-button" onClick={() => { const copy = { ...structuredClone(selected), id: crypto.randomUUID() }; setStudy(previous => { const at = previous.sections.findIndex(section => section.id === selected.id); const sections = [...previous.sections]; sections.splice(at + 1, 0, copy); return { ...previous, sections }; }); setSelectedId(copy.id); }}><Copy size={13} /> Duplicate section</button></div>
      </div> : <>
        <ProjectSettings onPickGradient={() => { setRightOpen(false); setGradPick(true); }} study={study} update={updateStudy} pickBgImage={() => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.onchange = async () => { const file = input.files?.[0]; if (!file) return; const url = URL.createObjectURL(file); try { const { downloadIntoDraft } = await import("./ImageSlots"); updateStudy({ hero: { style: "immersive", frame: "laptop", ...study.hero!, bg: "image", bgImage: await downloadIntoDraft(url, 700_000, 2200) } }); } finally { URL.revokeObjectURL(url); } }; input.click(); }} />
      </>}</div></aside>
    </div>
    {showPublish && <PublishDialog study={study} onClose={() => setShowPublish(false)} onPublished={at => updateStudy({ publishedAt: at })} />}
    {showBrand && view !== "preview" && <BrandPanel study={study} onChange={updateStudy} onClose={() => setShowBrand(false)} notify={(text, error) => setMessage({ text, error })} />}
    <GradientPicker on={gradPick && view !== "preview"} off={study.gradOffEls ?? []} onChange={gradOffEls => updateStudy({ gradOffEls })} onDone={() => { setGradPick(false); setRightOpen(true); }} />
    <TextStyleBar accent={study.accent} accent2={study.accent2} enabled={view !== "preview"} styleOf={(sectionId, field) => study.sections.find(section => section.id === sectionId)?.textStyles?.[field]} onStyle={(sectionId, field, patch) => setStudy(previous => ({ ...previous, sections: previous.sections.map(section => { if (section.id !== sectionId) return section; const merged = { ...(section.textStyles?.[field] ?? {}), ...patch }; const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)); const textStyles = { ...(section.textStyles ?? {}) }; if (Object.keys(clean).length) textStyles[field] = clean; else delete textStyles[field]; return { ...section, textStyles }; }) }))} />
    <ImageSlotLayer enabled={view !== "preview"} onFile={handleSlotFile} onUrl={handleSlotUrl} onRemove={slot => setSlotImage(slot, "")} notify={(text, error) => setMessage({ text, error })} />
    <ComponentLibrary open={showAdd} onOpenChange={setShowAdd} onAdd={addSection} study={study}/>
  </div>;
}

/* "More" menu in the header for the things you rarely need. */
function HeaderMore({ items }: { items: Array<{ label: string; hint: string; onClick: () => void }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("mousedown", close); document.addEventListener("keydown", esc); return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); }; }, [open]);
  return <div className="csb-hdr-more" ref={ref}>
    <button type="button" className="csb-hdr-icon" aria-label="More" aria-expanded={open} title="More" onClick={() => setOpen(o => !o)}><MoreHorizontal size={16} strokeWidth={1.7} /></button>
    {open && <div className="csb-hdr-menu" role="menu">{items.map(it => <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}><b>{it.label}</b><small>{it.hint}</small></button>)}</div>}
  </div>;
}
