import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, FileDown, FileUp, Monitor, Plus, RefreshCw, RotateCcw, Smartphone, Trash2, X } from "lucide-react";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { CaseStudyCanvas } from "./CaseStudyCanvas";
import { componentDescriptions, componentNames, createSection, isBuilderStudy, lucidExample, type BuilderStudy, type CaseStudySection, type SectionKind } from "./model";
import { FigmaSourcePicker, MACROAI_URL } from "./FigmaSourcePicker";
import { ComponentLibrary } from "./ComponentLibrary";
import { SurveySourcePicker } from "./SurveySourcePicker";
import { templates, sectionFromTemplate, type ComponentTemplate } from "./library";
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
  const [mobilePreview, setMobilePreview] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(study)); } catch { setMessage({ text: "Browser storage is full. Export your case study JSON to keep these edits.", error: true }); } }, [study]);
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
    setStudy(previous => ({ ...previous, sections: [...previous.sections, section] }));
    setSelectedId(section.id);
    setShowAdd(false);
    setTimeout(() => document.getElementById(`builder-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
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

  const syncFromNotion = async () => {
    if (!projectId || !publicAnonKey) { setMessage({ text: "Automatic Notion sync requires a private server connection. Add your research page URL in Project sources and use the AI brief meanwhile.", error: true }); return; }
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-863fdde7/notion/case-studies`, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load Notion content.");
      const match = data.caseStudies?.find((item: BuilderStudy) => item.slug === study.slug) ;
      if (!match || !isBuilderStudy(match)) throw new Error("No Published case study is available in Notion yet. Keep working in this local preview until you are ready to publish.");
      setStudy(previous => ({ ...match, sources: previous.sources, sections: [...match.sections.filter((section: CaseStudySection) => !previous.sections.some(local => local.kind === "wireframes" && local.id === section.id)), ...previous.sections.filter(section => section.kind === "wireframes")], lastSyncedAt: new Date().toISOString() }));
      setSelectedId(null);
      setMessage({ text: `Synced ${match.sections.length} sections from Notion.` });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Sync failed.", error: true }); }
    finally { setSyncing(false); }
  };

  const renderField = (label: string, value: string, onChange: (value: string) => void, multiline = false, note?: string, itemKey?: number) => {
    const id = `csb-${selectedId || "hero"}-${itemKey ?? "section"}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return <div className="csb-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea id={id} value={value} onChange={event => onChange(event.target.value)} rows={3} /> : <input id={id} value={value} onChange={event => onChange(event.target.value)} />}{note && <span className="csb-field-note">{note}</span>}</div>;
  };

  return <div className="csb-app">
    <header className="csb-studio-header"><div className="csb-wordmark"><span className="csb-wordmark-icon">✳</span>Case Study Studio</div><span className="csb-header-separator" /><span className="csb-header-project">Editing <strong>{study.title}</strong></span><div className="csb-header-actions"><button className="csb-quiet-button" onClick={() => downloadStudy(study)}><FileDown size={14} /> Export</button><button className="csb-primary-button" onClick={() => document.querySelector(".csb-preview-viewport")?.scrollTo({ top: 0, behavior: "smooth" })}>Preview from top <ArrowUp size={13} /></button></div></header>
    <div className="csb-studio-shell">
      <aside className="csb-panel csb-panel-left"><div className="csb-panel-scroll"><p className="csb-panel-kicker">Story structure</p><h2 className="csb-panel-title">Sections</h2><p className="csb-panel-subtitle">Choose a section to edit it. Move sections to reshape the story.</p><div className="csb-section-list"><div className={`csb-section-row ${selectedId === null ? "is-active" : ""}`}><button className="csb-section-select" onClick={() => setSelectedId(null)}><span className="csb-section-numeral">00</span><span className="csb-section-label"><strong>Project introduction</strong><small>Hero</small></span></button></div>{study.sections.map((section, index) => <div key={section.id} className={`csb-section-row ${selectedId === section.id ? "is-active" : ""}`}><button className="csb-section-select" onClick={() => { setSelectedId(section.id); document.getElementById(`builder-section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><span className="csb-section-numeral">{String(index + 1).padStart(2, "0")}</span><span className="csb-section-label"><strong>{section.title}</strong><small>{componentNames[section.kind]}</small></span></button><div className="csb-row-controls"><button className="csb-reorder" aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => moveSection(section.id, -1)}><ArrowUp size={13} /></button><button className="csb-reorder" aria-label={`Move ${section.title} down`} disabled={index === study.sections.length - 1} onClick={() => moveSection(section.id, 1)}><ArrowDown size={13} /></button></div></div>)}</div><button className="csb-add-button" onClick={() => setShowAdd(!showAdd)}><Plus size={15} /> Add component <ChevronDown size={13} /></button>
        <div className="csb-source-card"><p className="csb-panel-kicker">Content source</p><div className="csb-source-status"><strong><span className={`csb-source-dot ${study.sourcePageId ? "is-linked" : ""}`} />{study.sourcePageId ? "Synced from Notion" : "Local draft"}</strong><span>Changes here save in this browser. Add a Notion URL in Project sources to keep research close to your draft.</span><a href={study.sources?.notionUrl&&/^https:\/\/(?:www\.)?(?:notion\.so|notion\.site|app\.notion\.com)\//.test(study.sources.notionUrl)?study.sources.notionUrl:NOTION_PROJECT_URL} target="_blank" rel="noreferrer" style={{ color: "#476e58", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>Open research source <ExternalLink size={11} /></a></div><button className="csb-add-button" onClick={syncFromNotion} disabled={syncing}><RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync published from Notion"}</button>{message && <div className={`csb-inline-status ${message.error ? "csb-inline-error" : ""}`}>{message.text}</div>}<a href={NOTION_DATABASE_URL} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 12, fontSize: 11, color: "#607565" }}>Open Notion ↗</a></div>
      </div></aside>
      <main className="csb-main"><div className="csb-main-toolbar"><div><h2>Live preview</h2><p>Click any text to edit · Enter to finish · Changes save automatically</p></div><div style={{ display: "flex", gap: 5 }}><button className="csb-icon-button" aria-label="Desktop preview" aria-pressed={!mobilePreview} onClick={() => setMobilePreview(false)} style={!mobilePreview ? { background: "#eaf0e9" } : undefined}><Monitor size={15} /></button><button className="csb-icon-button" aria-label="Mobile preview" aria-pressed={mobilePreview} onClick={() => setMobilePreview(true)} style={mobilePreview ? { background: "#eaf0e9" } : undefined}><Smartphone size={15} /></button></div></div><div className={`csb-preview-wrap ${mobilePreview ? "is-mobile" : ""}`}><div className="csb-browser-frame"><div className="csb-browser-chrome"><span className="csb-browser-dot" /><span className="csb-browser-dot" /><span className="csb-browser-dot" /><span className="csb-browser-url">case study / {study.slug}</span></div><div className="csb-preview-viewport"><CaseStudyCanvas study={study} selectedSectionId={selectedId} onSelectSection={setSelectedId} onEditStudy={(field,value)=>updateStudy({[field]:value})} onEditSection={(id,field,value)=>setStudy(previous=>({...previous,sections:previous.sections.map(section=>{if(section.id!==id)return section; const parts=field.split("."); return parts[0]==="items"?{...section,items:section.items.map((item,i)=>i===Number(parts[1])?{...item,[parts[2]]:value}:item)}:{...section,[field]:value};})}))} onUploadMedia={(sectionId,index,file)=>{void uploadAsset(file,`full-media-${sectionId}-${index}`,url=>setStudy(previous=>({...previous,sections:previous.sections.map(section=>section.id===sectionId?{...section,items:section.items.map((item,i)=>i===index?{...item,image:url}:item)}:section)})));}} editorMode /></div></div></div></main>
      <aside className="csb-panel csb-panel-right"><div className="csb-panel-scroll"><p className="csb-panel-kicker">Inspector</p><h2 className="csb-panel-title">{selected ? componentNames[selected.kind] : "Project introduction"}</h2><p className="csb-panel-subtitle">{selected ? componentDescriptions[selected.kind] : "Shape the first impression. Your edits appear in the preview immediately."}</p>{selected ? <>
        {renderField("Section label", selected.eyebrow, value => updateSection({ eyebrow: value }))}
        {renderField("Headline", selected.title, value => updateSection({ title: value }), true)}
        {renderField("Story / context", selected.body, value => updateSection({ body: value }), true)}
        <div className="csb-field"><label>Surface</label><select value={selected.variant} onChange={event => updateSection({ variant: event.target.value as CaseStudySection["variant"] })}><option value="light">White</option><option value="tinted">Soft tint</option><option value="dark">Dark</option></select></div>
        {selected.kind === "wireframes" && <FigmaSourcePicker key={selected.id} section={selected} sourceUrl={study.sources?.figmaUrl||MACROAI_URL} onApply={updateSection} onSourceChange={figmaUrl=>updateStudy({sources:{...study.sources,figmaUrl}})}/>}
        {selected.kind === "survey" && <><SurveySourcePicker key={selected.id} section={selected} onApply={updateSection} />{selected.surveySource?.questions.map((question, index) => <div className="csb-inspector-item" key={index}><div className="csb-inspector-item-number">CHART {String(index + 1).padStart(2, "0")} · {question.answered} ANSWERS</div>{renderField("Question headline",selected.items[index]?.title||question.sourceName,value=>updateItem(index,{title:value}),true,undefined,index)}{renderField("Finding / takeaway",selected.items[index]?.detail||"",value=>updateItem(index,{detail:value}),true,undefined,index)}</div>)}</>}
        {selected.kind === "competitors" && renderField("Six criteria (in chart order)",selected.criteria||"",value=>updateSection({criteria:value}),true)}
        {selected.kind === "columns" && <div className="csb-field"><label htmlFor="column-count">Columns</label><select id="column-count" value={selected.columns||3} onChange={e=>updateSection({columns:Number(e.target.value) as 2|3|4})}><option value="2">2 columns</option><option value="3">3 columns</option><option value="4">4 columns</option></select></div>}
        {selected.kind !== "narrative" && selected.kind !== "survey" && <><div className="csb-inspector-divider" /><p className="csb-panel-kicker">Visual content</p>{selected.items.map((item, index) => <div className="csb-inspector-item" key={index}><div className="csb-inspector-item-number">ITEM {String(index + 1).padStart(2, "0")}</div>{["metrics", "columns", "gap", "competitors", "journey", "issueFlow", "persona"].includes(selected.kind) && renderField(selected.kind === "competitors" ? "Six scores (0–5, comma separated)" : "Value / evidence", item.value || "", value => updateItem(index, { value }), false, undefined, index)}{renderField(selected.kind === "quotes" ? "Attribution" : selected.kind === "fullMedia" ? "Caption title / alt text" : "Label", item.title, value => updateItem(index, { title: value }), false, undefined, index)}{renderField(selected.kind === "quotes" ? "Quote" : selected.kind === "fullMedia" ? "Caption" : "Detail", item.detail, value => updateItem(index, { detail: value }), true, undefined, index)}{(["gallery","wireframes","fullMedia"].includes(selected.kind)||(["persona","annotated"].includes(selected.kind)&&index===0)) && <>{renderField("Image URL", item.image || "", value => updateItem(index, { image: value }), false, "Paste a URL or upload an image or GIF to portfolio storage.", index)}<label className="csb-quiet-button csb-file-button" htmlFor={`csb-gallery-file-${index}`}><FileUp size={13} /> {uploadingKey === `gallery-${index}` ? "Uploading…" : "Upload image / GIF"}</label><input id={`csb-gallery-file-${index}`} type="file" accept="image/*,.gif" hidden disabled={!!uploadingKey} onChange={event => { void uploadAsset(event.target.files?.[0], `gallery-${index}`, url => updateItem(index, { image: url })); event.target.value = ""; }} /></>}<button className="csb-quiet-button" onClick={() => updateSection({ items: selected.items.filter((_, itemIndex) => itemIndex !== index) })}><X size={12} /> Remove item</button></div>)}<button className="csb-add-button" disabled={selected.kind==="wireframes"&&selected.items.length>=4} onClick={() => updateSection({ items: [...selected.items, { title: selected.kind === "fullMedia" ? "Visual detail" : "New item", detail: selected.kind === "fullMedia" ? "Add a caption about what this shows." : "Add supporting detail.", image: selected.kind === "fullMedia" ? "" : undefined, value: selected.kind === "metrics" ? "0" : undefined }] })}><Plus size={14} /> Add item</button></>}
        <div className="csb-ai-brief"><p className="csb-panel-kicker">AI assistance brief</p><p>{templates.find(t=>t.id===selected.templateId||(!selected.templateId&&t.kind===selected.kind))?.ai}</p><button className="csb-quiet-button" onClick={async()=>{const t=templates.find(t=>t.id===selected.templateId||(!selected.templateId&&t.kind===selected.kind));try{await navigator.clipboard.writeText(`${t?.ai}\n\nProject: ${study.title}\nProject sources: ${JSON.stringify(study.sources||{})}\nFigma frame mapping: ${JSON.stringify(selected.figmaSource||{})}\nCurrent content: ${JSON.stringify(selected,null,2)}\n\nSource material: [paste your research notes here]`);setMessage({text:"AI brief copied. Paste it with your source notes into your AI tool."});}catch{setMessage({text:"Clipboard unavailable. Select and copy the brief above.",error:true});}}}>Copy AI brief</button><small>Uses your notes as a starting point. Generation is not connected yet.</small></div><div className="csb-inspector-divider" /><div className="csb-inspector-actions"><button className="csb-quiet-button" onClick={() => { setStudy(previous => ({ ...previous, sections: previous.sections.filter(section => section.id !== selected.id) })); setSelectedId(null); }}><Trash2 size={13} /> Delete section</button></div>
      </> : <>
        <p className="csb-panel-kicker">Project sources</p>
        {renderField("Notion research URL",study.sources?.notionUrl||"",notionUrl=>updateStudy({sources:{...study.sources,notionUrl}}),false,"Research and notes for AI context. Published sync still uses the configured Notion database.")}
        {renderField("Figma design page URL",study.sources?.figmaUrl||"",figmaUrl=>updateStudy({sources:{...study.sources,figmaUrl}}),false,"Saved with this case study and included in every AI brief. Link frames in a wireframe showcase to import.")}
        <div className="csb-inspector-divider"/>
        {renderField("Title", study.title, value => updateStudy({ title: value }), true)}
        {renderField("Summary", study.summary, value => updateStudy({ summary: value }), true)}
        {renderField("Client", study.client, value => updateStudy({ client: value }))}
        {renderField("Role", study.role, value => updateStudy({ role: value }))}
        {renderField("Timeframe", study.timeframe, value => updateStudy({ timeframe: value }))}
        {renderField("Slug", study.slug, value => updateStudy({ slug: value }))}
        {renderField("Hero image URL", study.heroImage || "", value => updateStudy({ heroImage: value }), false, "Leave blank to use the built-in art direction.")}
        <label className="csb-quiet-button csb-file-button" htmlFor="csb-hero-file"><FileUp size={13} /> {uploadingKey === "hero" ? "Uploading…" : "Upload hero image"}</label><input id="csb-hero-file" type="file" accept="image/*" hidden disabled={!!uploadingKey} onChange={event => { void uploadAsset(event.target.files?.[0], "hero", url => updateStudy({ heroImage: url })); event.target.value = ""; }} />
        <div className="csb-field"><label>Accent color</label><input type="color" value={/^#[\da-f]{6}$/i.test(study.accent) ? study.accent : "#0071e3"} onChange={event => updateStudy({ accent: event.target.value })} style={{ padding: 3, height: 39 }} /></div>
        <div className="csb-inspector-divider" /><p className="csb-panel-kicker">Your draft</p><p className="csb-panel-subtitle">Export a backup or import a builder file. Local edits are saved automatically in this browser.</p><div className="csb-inspector-actions"><button className="csb-quiet-button" onClick={() => importRef.current?.click()}><FileUp size={13} /> Import JSON</button><button className="csb-quiet-button" onClick={() => downloadStudy(study)}><FileDown size={13} /> Export JSON</button><button className="csb-quiet-button" onClick={() => { setStudy(lucidExample); setSelectedId(null); setMessage({ text: "Example restored. Your previous local edits were replaced." }); }}><RotateCcw size={13} /> Reset example</button></div><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => { void importJson(event.target.files?.[0]); event.target.value = ""; }} />
      </>}</div></aside>
    </div>
    <ComponentLibrary open={showAdd} onOpenChange={setShowAdd} onAdd={addSection}/>
  </div>;
}
