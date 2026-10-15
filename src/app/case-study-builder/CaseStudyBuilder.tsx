import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Eye, FileDown, FileUp, Maximize2, Minimize2, Monitor, PanelLeft, PanelRight, Plus, RefreshCw, RotateCcw, Smartphone, Trash2, X } from "lucide-react";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { CaseStudyCanvas } from "./CaseStudyCanvas";
import { componentDescriptions, componentNames, createSection, isBuilderStudy, lucidExample, type BuilderStudy, type CaseStudySection, type SectionKind } from "./model";
import { FigmaSourcePicker, MACROAI_URL } from "./FigmaSourcePicker";
import { ComponentLibrary } from "./ComponentLibrary";
import { LayoutControls } from "./LayoutControls";
import { SurveySourcePicker } from "./SurveySourcePicker";
import { templates, sectionFromTemplate, type ComponentTemplate } from "./library";
import { ImageSlotLayer } from "./ImageSlots";
import "./case-study-builder.css";
import "./apple-style.css";

const STORAGE_KEY = "katelyn-case-study-builder-v1";
const NOTION_DATABASE_URL = "https://www.notion.so/";
const NOTION_PROJECT_URL = "https://www.notion.so/";

function readLocalStudy(): BuilderStudy {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); if (isBuilderStudy(saved)) return saved; } catch { /* ignore invalid local draft */ }
  return lucidExample;
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
  const [showAdd, setShowAdd] = useState(false);
  const [addedComponentName, setAddedComponentName] = useState<string | null>(null);
  const pendingAddedSection = useRef<string | null>(null);
  const [mobilePreview, setMobilePreview] = useState(false);
  // Workspace: "canvas" = full-screen page with floating panels (website-builder style),
  // "framed" = the original three-column layout, "preview" = no editing UI at all.
  const [view, setView] = useState<"canvas" | "framed" | "preview">(() => { try { return localStorage.getItem("csb-view") === "framed" ? "framed" : "canvas"; } catch { return "canvas"; } });
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  useEffect(() => { if (view === "preview") return; try { localStorage.setItem("csb-view", view); } catch { /* storage unavailable */ } }, [view]);
  const lastEditView = useRef<"canvas" | "framed">("canvas");
  const enterPreview = () => { if (view !== "preview") lastEditView.current = view; setView("preview"); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key === "Escape" && view === "preview") setView(lastEditView.current);
      if (view === "canvas" && event.key === "[") setLeftOpen(open => !open);
      if (view === "canvas" && event.key === "]") setRightOpen(open => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(study)); } catch { setMessage({ text: "Browser storage is full. Export your case study JSON to keep these edits.", error: true }); } }, [study]);
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
    const section = sectionFromTemplate(template);
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
      setStudy(parsed);
      setSelectedId(null);
      setMessage({ text: "Case study imported into your local draft." });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Import failed.", error: true }); }
  };

  const uploadAsset = async (file: File | undefined, key: string, onSuccess: (url: string) => void) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage({ text: "Choose an image file.", error: true }); return; }
    setUploadingKey(key);
    setMessage(null);
    try {
      if (file.size > 1_500_000) throw new Error("Use an image URL for files over 1.5 MB. Browser drafts have limited storage.");
      const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read image.")); reader.readAsDataURL(file); });
      onSuccess(image);
      setMessage({ text: `${file.name} added to the case study.` });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Image upload failed.", error: true }); }
    finally { setUploadingKey(null); }
  };

  // Images edited directly on the canvas (see ImageSlots.tsx). slot = "hero" or "<sectionId>:<itemIndex>"
  const setSlotImage = useCallback((slot: string, url: string) => {
    if (slot === "hero") { setStudy(previous => ({ ...previous, heroImage: url || undefined })); return; }
    const [sectionId, rawIndex] = slot.split(":"); const index = Number(rawIndex);
    setStudy(previous => ({ ...previous, sections: previous.sections.map(section => section.id !== sectionId ? section : { ...section, items: section.items.map((item, i) => i === index ? { ...item, image: url, ...(url ? {} : { frameId: undefined }) } : item) }) }));
  }, []);
  const handleSlotFile = useCallback((slot: string, file: File) => { void uploadAsset(file, `slot-${slot}`, url => setSlotImage(slot, url)); }, [setSlotImage]);
  const handleSlotUrl = useCallback((slot: string, url: string, note?: string) => { setSlotImage(slot, url); setMessage({ text: note || "Image added." }); }, [setSlotImage]);
  const renderField = (label: string, value: string, onChange: (value: string) => void, multiline = false, note?: string, itemKey?: number) => {
    const id = `csb-${selectedId || "hero"}-${itemKey ?? "section"}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return <div className="csb-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea id={id} value={value} onChange={event => onChange(event.target.value)} rows={3} /> : <input id={id} value={value} onChange={event => onChange(event.target.value)} />}{note && <span className="csb-field-note">{note}</span>}</div>;
  };

  return <div className={`csb-app csb-view-${view} ${leftOpen ? "" : "hide-left"} ${rightOpen ? "" : "hide-right"}`}>
    <header className="csb-studio-header"><div className="csb-wordmark"><span className="csb-wordmark-icon">✳</span>Case Study Studio</div><span className="csb-header-separator" /><span className="csb-header-project">Editing <strong>{study.title}</strong></span><div className="csb-header-actions"><button className="csb-quiet-button" onClick={() => downloadStudy(study)}><FileDown size={14} /> Export</button><button className="csb-quiet-button csb-view-toggle" onClick={() => setView(view === "canvas" ? "framed" : "canvas")} aria-label={view === "canvas" ? "Switch to framed layout" : "Switch to full-screen canvas"}>{view === "canvas" ? <><Minimize2 size={14} /> Framed</> : <><Maximize2 size={14} /> Full screen</>}</button><button className="csb-primary-button" onClick={enterPreview}><Eye size={14} /> Preview</button></div></header>
    <div className="csb-studio-shell">
      <aside className="csb-panel csb-panel-left" aria-label="Sections and connections"><button className="csb-panel-hide" onClick={() => setLeftOpen(false)} aria-label="Hide left panel" title="Hide ( [ )"><PanelLeft size={15} /></button><div className="csb-panel-scroll">
        <p className="csb-panel-kicker">Story</p><h2 className="csb-panel-title">Sections</h2><p className="csb-panel-subtitle">Edit text and images right on the page. Select a section to see its settings.</p>
        <div className="csb-section-list"><div className={`csb-section-row ${selectedId === null ? "is-active" : ""}`}><button className="csb-section-select" onClick={() => setSelectedId(null)}><span className="csb-section-numeral">00</span><span className="csb-section-label"><strong>Project introduction</strong><small>Hero</small></span></button></div>{study.sections.map((section, index) => <div key={section.id} className={`csb-section-row ${selectedId === section.id ? "is-active" : ""}`}><button className="csb-section-select" onClick={() => { setSelectedId(section.id); document.getElementById(`builder-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><span className="csb-section-numeral">{String(index + 1).padStart(2, "0")}</span><span className="csb-section-label"><strong>{section.title}</strong><small>{componentNames[section.kind]}</small></span></button><div className="csb-row-controls"><button className="csb-reorder" aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => moveSection(section.id, -1)}><ArrowUp size={13} /></button><button className="csb-reorder" aria-label={`Move ${section.title} down`} disabled={index === study.sections.length - 1} onClick={() => moveSection(section.id, 1)}><ArrowDown size={13} /></button></div></div>)}</div><button type="button" className="csb-add-button" aria-haspopup="dialog" aria-expanded={showAdd} onClick={() => { setAddedComponentName(null); setShowAdd(true); }}><Plus size={15} /> Add component <ChevronDown size={13} /></button>{addedComponentName && <div className="csb-add-confirmation" role="status"><strong>{addedComponentName} added</strong><button type="button" onClick={() => selectedId && document.getElementById(`builder-section-${selectedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>View section</button></div>}
        
        <div className="csb-inspector-divider" />
        <p className="csb-panel-kicker">Connections</p><h2 className="csb-panel-title">Linked sources</h2><p className="csb-panel-subtitle">Data that lives somewhere else and flows into this case study.</p>
        {renderField("Notion research", study.sources?.notionUrl || "", notionUrl => updateStudy({ sources: { ...study.sources, notionUrl } }), false, "Research notes the AI briefs draw from.")}
        {study.sources?.notionUrl && /^https:\/\/(?:www\.)?(?:notion\.so|notion\.site|app\.notion\.com)\//.test(study.sources.notionUrl) && <a className="csb-connection-link" href={study.sources.notionUrl} target="_blank" rel="noreferrer">Open in Notion <ExternalLink size={11} /></a>}
        {renderField("Figma design file", study.sources?.figmaUrl || "", figmaUrl => updateStudy({ sources: { ...study.sources, figmaUrl } }), false, "The file your wireframe sections pull frames from.")}
        {selected?.kind === "survey" && <div className="csb-connection-section"><p className="csb-panel-kicker">This section · Google Forms</p><SurveySourcePicker key={selected.id} section={selected} onApply={updateSection} /></div>}
        {selected?.kind === "wireframes" && <div className="csb-connection-section"><FigmaSourcePicker key={selected.id} section={selected} sourceUrl={study.sources?.figmaUrl || MACROAI_URL} onApply={updateSection} onSourceChange={figmaUrl => updateStudy({ sources: { ...study.sources, figmaUrl } })} /></div>}
        {selected && !["survey", "wireframes"].includes(selected.kind) && <p className="csb-field-note">Survey and wireframe sections show their data connection here when selected.</p>}
        {message && <div className={`csb-inline-status ${message.error ? "csb-inline-error" : ""}`} role="status">{message.text}</div>}
        <div className="csb-inspector-divider" />
        <p className="csb-panel-kicker">Your draft</p><p className="csb-panel-subtitle">Saved automatically in this browser.</p>
        <div className="csb-inspector-actions"><button className="csb-quiet-button" onClick={() => importRef.current?.click()}><FileUp size={13} /> Import</button><button className="csb-quiet-button" onClick={() => downloadStudy(study)}><FileDown size={13} /> Export</button><button className="csb-quiet-button" onClick={() => { if (window.confirm("Replace your draft with the example case study?")) { setStudy(lucidExample); setSelectedId(null); setMessage({ text: "Example restored." }); } }}><RotateCcw size={13} /> Reset</button></div><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => { void importJson(event.target.files?.[0]); event.target.value = ""; }} />
      </div></aside>
      <main className="csb-main"><div className="csb-main-toolbar"><div><h2>Live preview</h2><p>Click any text to edit · Enter to finish · Changes save automatically</p></div><div style={{ display: "flex", gap: 5 }}><button className="csb-icon-button" aria-label="Desktop preview" aria-pressed={!mobilePreview} onClick={() => setMobilePreview(false)} style={!mobilePreview ? { background: "#eaf0e9" } : undefined}><Monitor size={15} /></button><button className="csb-icon-button" aria-label="Mobile preview" aria-pressed={mobilePreview} onClick={() => setMobilePreview(true)} style={mobilePreview ? { background: "#eaf0e9" } : undefined}><Smartphone size={15} /></button></div></div><div className={`csb-preview-wrap ${mobilePreview ? "is-mobile" : ""}`}><div className="csb-browser-frame"><div className="csb-browser-chrome"><span className="csb-browser-dot" /><span className="csb-browser-dot" /><span className="csb-browser-dot" /><span className="csb-browser-url">case study / {study.slug}</span></div><div className="csb-preview-viewport"><CaseStudyCanvas study={study} selectedSectionId={selectedId} onSelectSection={setSelectedId} onEditStudy={(field,value)=>updateStudy({[field]:value})} onEditSection={(id,field,value)=>setStudy(previous=>({...previous,sections:previous.sections.map(section=>{if(section.id!==id)return section; const parts=field.split("."); return parts[0]==="items"?{...section,items:section.items.map((item,i)=>i===Number(parts[1])?{...item,[parts[2]]:value}:item)}:{...section,[field]:value};})}))} onUploadMedia={(sectionId,index,file)=>{void uploadAsset(file,`full-media-${sectionId}-${index}`,url=>setStudy(previous=>({...previous,sections:previous.sections.map(section=>section.id===sectionId?{...section,items:section.items.map((item,i)=>i===index?{...item,image:url}:item)}:section)})));}} editorMode={view !== "preview"} /></div></div></div></main>
      {view === "canvas" && !leftOpen && <button className="csb-panel-tab csb-panel-tab-left" onClick={() => setLeftOpen(true)}><PanelLeft size={15} /> Sections</button>}
      {view === "canvas" && !rightOpen && <button className="csb-panel-tab csb-panel-tab-right" onClick={() => setRightOpen(true)}>Inspector <PanelRight size={15} /></button>}
      {view === "preview" && <div className="csb-preview-exit"><span>Previewing as a visitor</span><button onClick={() => setView(lastEditView.current)}><X size={14} /> Exit preview</button></div>}
      <aside className="csb-panel csb-panel-right" aria-label="Design settings"><button className="csb-panel-hide" onClick={() => setRightOpen(false)} aria-label="Hide design panel" title="Hide ( ] )"><PanelRight size={15} /></button><div className="csb-panel-scroll"><p className="csb-panel-kicker">{selected ? "Design" : "Page settings"}</p><h2 className="csb-panel-title">{selected ? componentNames[selected.kind] : "Project introduction"}</h2><p className="csb-panel-subtitle">{selected ? "Click any text or image on the page to change it. These settings shape how the section looks." : "Click the title, summary, details or hero image on the page to edit them."}</p>{selected ? <>
        <div className="csb-field"><label htmlFor="csb-surface">Surface</label><select id="csb-surface" value={selected.variant} onChange={event => updateSection({ variant: event.target.value as CaseStudySection["variant"] })}><option value="light">White</option><option value="tinted">Soft tint</option><option value="dark">Dark</option></select></div>
        <LayoutControls section={selected} onChange={updateSection} />
        {selected.kind === "columns" && <div className="csb-field"><label htmlFor="column-count">Columns</label><select id="column-count" value={selected.columns || 3} onChange={e => updateSection({ columns: Number(e.target.value) as 2 | 3 | 4 })}><option value="2">2 columns</option><option value="3">3 columns</option><option value="4">4 columns</option></select></div>}
        {selected.kind === "wireframes" && <div className="csb-field"><label htmlFor="screen-fit-r">Screen fit</label><select id="screen-fit-r" value={selected.fit || "contain"} onChange={e => updateSection({ fit: e.target.value as "contain" | "cover" })}><option value="contain">Show full screen</option><option value="cover">Fill phone (crop)</option></select></div>}
        {selected.kind === "competitors" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Chart data</p><p className="csb-field-note">Scores 0–5 for each criterion, in chart order. Rename the criteria on the page.</p>{selected.items.map((item, index) => <div className="csb-field" key={index}><label htmlFor={`csb-score-${index}`}>{item.title}</label><div className="csb-score-row">{Array.from({ length: 6 }, (_, k) => { const values = (item.value || "0,0,0,0,0,0").split(",").map(v => Number(v) || 0); return <input key={k} id={k === 0 ? `csb-score-${index}` : undefined} aria-label={`${item.title} criterion ${k + 1}`} type="number" min={0} max={5} step={0.5} value={values[k] ?? 0} onChange={event => { const next = Array.from({ length: 6 }, (_, n) => n === k ? Math.min(5, Math.max(0, Number(event.target.value) || 0)) : values[n] ?? 0); updateItem(index, { value: next.join(",") }); }} />; })}</div></div>)}</>}
        {selected.kind === "journey" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Chart data</p><p className="csb-field-note">How each stage felt, from low to high. The curve updates live.</p>{selected.items.slice(0, 5).map((item, index) => <div className="csb-field" key={index}><label htmlFor={`csb-emotion-${index}`}>{item.title} <output>{item.value || 50}</output></label><input id={`csb-emotion-${index}`} type="range" min={0} max={100} value={Number(item.value) || 50} onChange={event => updateItem(index, { value: event.target.value })} /></div>)}</>}
        {selected.kind === "issueFlow" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Issue codes</p>{selected.items.map((item, index) => <div className="csb-field" key={index}><label htmlFor={`csb-code-${index}`}>{item.title}</label><select id={`csb-code-${index}`} value={(item.value || "S").toUpperCase()} onChange={event => updateItem(index, { value: event.target.value })}><option value="A">A · Action</option><option value="C">C · Checking</option><option value="R">R · Retrieval</option><option value="COM">COM · Communication</option><option value="S">S · Selection</option></select></div>)}</>}
        <div className="csb-inspector-divider" />
        <div className="csb-ai-brief"><p className="csb-panel-kicker">AI assistance brief</p><p>{templates.find(t=>t.id===selected.templateId||(!selected.templateId&&t.kind===selected.kind))?.ai}</p><button className="csb-quiet-button" onClick={async()=>{const t=templates.find(t=>t.id===selected.templateId||(!selected.templateId&&t.kind===selected.kind));try{await navigator.clipboard.writeText(`${t?.ai}\n\nProject: ${study.title}\nProject sources: ${JSON.stringify(study.sources||{})}\nFigma frame mapping: ${JSON.stringify(selected.figmaSource||{})}\nCurrent content: ${JSON.stringify(selected,null,2)}\n\nSource material: [paste your research notes here]`);setMessage({text:"AI brief copied. Paste it with your source notes into your AI tool."});}catch{setMessage({text:"Clipboard unavailable. Select and copy the brief above.",error:true});}}}>Copy AI brief</button><small>Uses your notes as a starting point. Generation is not connected yet.</small></div>
        <div className="csb-inspector-divider" /><div className="csb-inspector-actions"><button className="csb-quiet-button" onClick={() => { setStudy(previous => ({ ...previous, sections: previous.sections.filter(section => section.id !== selected.id) })); setSelectedId(null); }}><Trash2 size={13} /> Delete section</button></div>
      </> : <>
        <div className="csb-field"><label htmlFor="csb-accent">Accent color</label><input id="csb-accent" type="color" value={/^#[\da-f]{6}$/i.test(study.accent) ? study.accent : "#0071e3"} onChange={event => updateStudy({ accent: event.target.value })} style={{ padding: 3, height: 39 }} /></div>
        {renderField("Page address", study.slug, value => updateStudy({ slug: value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") }), false, "Used for the published URL and exported file name.")}
      </>}</div></aside>
    </div>
    <ImageSlotLayer enabled={view !== "preview"} onFile={handleSlotFile} onUrl={handleSlotUrl} onRemove={slot => setSlotImage(slot, "")} notify={(text, error) => setMessage({ text, error })} />
    <ComponentLibrary open={showAdd} onOpenChange={setShowAdd} onAdd={addSection}/>
  </div>;
}
