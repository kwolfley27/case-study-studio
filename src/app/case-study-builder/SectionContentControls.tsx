import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, X } from "lucide-react";
import { introHidden, type CaseStudySection, type SectionKind } from "./model";
import { newPersona, personaBlockPresets, splitPersonas } from "./AppleExtras";
import { detailPresets, isTeam } from "./ProjectDetails";

/*
  Right-panel controls that make every section adaptable:
  - which intro parts show (label, title, intro text)
  - the section's content items: add, duplicate, reorder, remove
  - persona: portrait on/off and a flexible list of blocks
*/

type Item = CaseStudySection["items"][number];
type Change = (patch: Partial<CaseStudySection>) => void;

const rules: Partial<Record<SectionKind, { min: number; max: number; noun: string }>> = {
  findings: { min: 1, max: 12, noun: "finding" }, columns: { min: 1, max: 8, noun: "column" }, methods: { min: 1, max: 8, noun: "method" },
  metrics: { min: 1, max: 6, noun: "metric" }, quotes: { min: 1, max: 8, noun: "quote" }, flow: { min: 2, max: 8, noun: "step" },
  journey: { min: 2, max: 6, noun: "stage" }, issueFlow: { min: 2, max: 6, noun: "step" }, gap: { min: 1, max: 4, noun: "approach" },
  competitors: { min: 1, max: 4, noun: "competitor" }, rows: { min: 1, max: 8, noun: "row" }, gallery: { min: 1, max: 8, noun: "image" },
  carousel: { min: 1, max: 8, noun: "screen" }, wireframes: { min: 1, max: 4, noun: "screen" }, interviews: { min: 1, max: 6, noun: "participant" },
  fullMedia: { min: 1, max: 6, noun: "image" },
};

const short = (text: string, fallback: string) => (text || "").replace(/\s+/g, " ").trim().slice(0, 40) || fallback;
const move = <T,>(list: T[], from: number, to: number) => { const next = [...list]; const [it] = next.splice(from, 1); next.splice(to, 0, it); return next; };
const withCount = (section: CaseStudySection, items: Item[]): Partial<CaseStudySection> =>
  section.layout?.count !== undefined ? { items, layout: { ...section.layout, count: Math.max(1, Math.min(items.length, section.layout.count >= section.items.length ? items.length : section.layout.count)) } } : { items };

export function IntroToggles({ section, onChange }: { section: CaseStudySection; onChange: Change }) {
  if (section.kind === "coverHero") return null;
  const o = section.options ?? {};
  const hidden = introHidden(section);
  const set = (key: string, value: boolean) => onChange({ options: { ...o, [key]: value } });
  return <div className="csb-show-toggles">
    <p className="csb-panel-kicker">Show</p>
    <label className="csb-check-field"><input type="checkbox" checked={!hidden.eyebrow} onChange={e => set("hideEyebrow", !e.target.checked)} /> Label above the title</label>
    <label className="csb-check-field"><input type="checkbox" checked={!hidden.title} onChange={e => set("hideTitle", !e.target.checked)} /> Title</label>
    {section.kind !== "narrative" && <label className="csb-check-field"><input type="checkbox" checked={!hidden.body} onChange={e => set("hideBody", !e.target.checked)} /> Intro text</label>}
  </div>;
}

export function ItemsManager({ section, onChange }: { section: CaseStudySection; onChange: Change }) {
  const rule = rules[section.kind];
  if (!rule) return null;
  const items = section.items;
  const add = (from: number) => {
    const source = items[from] ?? items[items.length - 1] ?? { title: "", detail: "" };
    const copy: Item = { ...source, title: from === items.length - 1 && source === items[items.length - 1] ? `New ${rule.noun}` : `${source.title} (copy)`, image: source.image !== undefined ? "" : undefined, frameId: undefined, point: undefined };
    if (section.kind === "journey" && from === items.length - 1) Object.assign(copy, { title: "New stage", value: "50", detail: "Feeling · what they say", actions: "", touchpoints: "", thoughts: "", pains: "", opportunities: "", owner: "" });
    const next = [...items]; next.splice(from + 1, 0, copy);
    onChange({ ...withCount(section, next), layout: section.layout?.count !== undefined ? { ...section.layout, count: Math.min(next.length, (section.layout.count ?? 0) + 1) } : section.layout });
  };
  return <div className="csb-items">
    <p className="csb-panel-kicker">Content · {items.length} {rule.noun}{items.length === 1 ? "" : "s"}</p>
    <p className="csb-field-note">Edit the words on the page. Here you can add, copy, reorder or remove {rule.noun}s.</p>
    <ol>{items.map((item, i) => <li key={i}>
      <span title={item.title}>{short(item.title, `${rule.noun} ${i + 1}`)}</span>
      <button type="button" aria-label={`Move ${item.title} up`} disabled={i === 0} onClick={() => onChange(withCount(section, move(items, i, i - 1)))}><ArrowUp size={13} /></button>
      <button type="button" aria-label={`Move ${item.title} down`} disabled={i === items.length - 1} onClick={() => onChange(withCount(section, move(items, i, i + 1)))}><ArrowDown size={13} /></button>
      <button type="button" aria-label={`Duplicate ${item.title}`} disabled={items.length >= rule.max} onClick={() => add(i)}><Copy size={12} /></button>
      <button type="button" aria-label={`Remove ${item.title}`} disabled={items.length <= rule.min} onClick={() => onChange(withCount(section, items.filter((_, k) => k !== i)))}><X size={13} /></button>
    </li>)}</ol>
    <button type="button" className="csb-quiet-button" disabled={items.length >= rule.max} onClick={() => add(items.length - 1)}>+ Add {rule.noun}</button>
    {items.length >= rule.max && <p className="csb-field-note">This layout fits up to {rule.max}.</p>}
  </div>;
}

export function PersonaControls({ section, onChange }: { section: CaseStudySection; onChange: Change }) {
  const [current, setCurrent] = useState(0);
  if (section.kind !== "persona") return null;
  const groups = splitPersonas(section);
  const at = Math.min(current, groups.length - 1);
  const group = groups[at];
  const blocks = group.blocks.map(b => ({ ...b.item, blockType: b.type === "person" ? "list" as const : b.type }));
  // rebuild the items with this persona's blocks replaced
  const saveBlocks = (next: Item[]) => {
    const items: Item[] = [];
    groups.forEach((g, i) => { items.push({ ...section.items[g.personIndex], ...(g.personIndex > 0 ? { blockType: "person" as const } : {}) }); (i === at ? next : g.blocks.map(b => ({ ...b.item, blockType: b.type === "person" ? "list" as const : b.type }))).forEach(it => items.push(it)); });
    onChange({ items });
  };
  const allGroups = () => groups.map(g => [{ ...section.items[g.personIndex], blockType: "person" as const }, ...g.blocks.map(b => ({ ...b.item, blockType: b.type === "person" ? "list" as const : b.type }))]);
  const types: Array<[NonNullable<Item["blockType"]>, string]> = [["list", "List"], ["text", "Paragraph"], ["quote", "Quote"], ["meter", "Scale"], ["day", "Timeline"]];
  return <div className="csb-items">
    <p className="csb-panel-kicker">Personas · {groups.length}</p>
    <div className="csb-pp-switch" role="tablist" aria-label="Edit persona">{groups.map((g, i) => <button key={g.personIndex} type="button" role="tab" aria-selected={i === at} onClick={() => setCurrent(i)}>{short(section.items[g.personIndex]?.title, `Persona ${i + 1}`)}</button>)}</div>
    <div className="csb-wt-actions">
      {groups.length < 4 && <button type="button" className="csb-quiet-button" onClick={() => { onChange({ items: [...allGroups().flat(), ...newPersona(groups.length + 1)] }); setCurrent(groups.length); }}>+ Add persona</button>}
      <button type="button" className="csb-quiet-button" disabled={groups.length >= 4} onClick={() => { const g = allGroups(); const copy = g[at].map(it => ({ ...it, title: it.blockType === "person" ? `${it.title} (copy)` : it.title, image: it.blockType === "person" ? "" : it.image })); onChange({ items: [...g.slice(0, at + 1), copy, ...g.slice(at + 1)].flat() }); setCurrent(at + 1); }}>Duplicate</button>
      {groups.length > 1 && <button type="button" className="csb-quiet-button" onClick={() => { onChange({ items: allGroups().filter((_, i) => i !== at).flat() }); setCurrent(Math.max(0, at - 1)); }}>Remove</button>}
    </div>
    {groups.length > 1 && <div className="csb-field"><span className="csb-field-label">Show personas as</span><div className="csb-segment" role="group" aria-label="Persona layout">{([["tabs", "Tabs"], ["side", "Side by side"]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={(section.options?.personaLayout ?? "tabs") === v} onClick={() => onChange({ options: { ...section.options, personaLayout: v } })}>{l}</button>)}</div></div>}
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.portrait !== false} onChange={e => onChange({ options: { ...section.options, portrait: e.target.checked } })} /> Show photos</label>
    <p className="csb-field-note">Blocks for {short(section.items[group.personIndex]?.title, "this persona")}. Rename them and edit each point on the page.</p>
    <ol>{blocks.map((block, i) => <li key={i} className="has-type">
      <span title={block.title}>{short(block.title, "Block")}</span>
      <select aria-label={`${block.title} style`} value={block.blockType} onChange={e => saveBlocks(blocks.map((b, k) => k === i ? { ...b, blockType: e.target.value as Item["blockType"], value: e.target.value === "meter" ? b.value || "60" : b.value } : b))}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button type="button" aria-label={`Move ${block.title} up`} disabled={i === 0} onClick={() => saveBlocks(move(blocks, i, i - 1))}><ArrowUp size={13} /></button>
      <button type="button" aria-label={`Move ${block.title} down`} disabled={i === blocks.length - 1} onClick={() => saveBlocks(move(blocks, i, i + 1))}><ArrowDown size={13} /></button>
      <button type="button" aria-label={`Remove ${block.title}`} onClick={() => saveBlocks(blocks.filter((_, k) => k !== i))}><X size={13} /></button>
      {block.blockType === "meter" && <input className="csb-items-range" type="range" min={0} max={100} value={Number(block.value) || 0} aria-label={`${block.title} level`} onChange={e => saveBlocks(blocks.map((b, k) => k === i ? { ...b, value: e.target.value } : b))} />}
    </li>)}</ol>
    <select className="csb-items-add" value="" aria-label="Add a persona block" onChange={e => { const preset = personaBlockPresets[Number(e.target.value)]; if (preset) saveBlocks([...blocks, { ...preset.item }]); }}>
      <option value="" disabled>+ Add a block…</option>
      {personaBlockPresets.map((preset, i) => <option key={preset.label} value={i}>{preset.label}</option>)}
    </select>
  </div>;
}

const recBackgrounds: Array<[NonNullable<CaseStudySection["recording"]>["background"], string]> = [["accent", "Brand"], ["sunset", "Sunset"], ["ocean", "Ocean"], ["aurora", "Aurora"], ["paper", "Paper"], ["night", "Night"], ["image", "Image"], ["none", "None"]];
const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export function RecordingControls({ section, onChange }: { section: CaseStudySection; onChange: Change }) {
  if (section.kind !== "screenRecording") return null;
  const rec = { src: "", background: "accent" as const, frame: "browser" as const, padding: 64, radius: 14, cursor: "arrow" as const, zoom: 1.8, clicks: [], loop: true, controls: false, speed: 1, ...(section.recording ?? {}) };
  const set = (patch: Partial<typeof rec>) => onChange({ recording: { ...rec, ...patch } });
  const clicks = [...rec.clicks].sort((a, b) => a.t - b.t);
  const segment = <T extends string | number>(label: string, value: T, options: Array<[T, string]>, onPick: (v: T) => void) => <div className="csb-field"><span className="csb-field-label">{label}</span><div className="csb-segment" role="group" aria-label={label}>{options.map(([v, l]) => <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onPick(v)}>{l}</button>)}</div></div>;
  return <div className="csb-items csb-rec-controls">
    <p className="csb-panel-kicker">Look</p>
    <div className="csb-rec-bgs" role="group" aria-label="Background" style={{ "--csb-accent": (() => { const page = document.querySelector(".csb-preview-viewport .csb-canvas"); return page ? getComputedStyle(page).getPropertyValue("--csb-accent").trim() : undefined; })(), "--t-surface": (() => { const page = document.querySelector(".csb-preview-viewport .csb-canvas"); return page ? getComputedStyle(page).getPropertyValue("--t-surface").trim() || undefined : undefined; })() } as React.CSSProperties}>{recBackgrounds.map(([bg, label]) => <button key={bg} type="button" aria-pressed={rec.background === bg} title={label} onClick={() => { if (bg === "image" && !rec.bgImage) { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.onchange = async () => { const file = input.files?.[0]; if (!file) return; const { downloadIntoDraft } = await import("./ImageSlots"); const url = URL.createObjectURL(file); try { set({ background: "image", bgImage: await downloadIntoDraft(url, 600_000, 1800) }); } finally { URL.revokeObjectURL(url); } }; input.click(); } else set({ background: bg }); }}><i className={`csb-rec-bg-${bg}`} style={bg === "image" && rec.bgImage ? { backgroundImage: `url(${rec.bgImage})` } : undefined} /><small>{label}</small></button>)}</div>
    {rec.background === "image" && rec.bgImage && <button type="button" className="csb-quiet-button" onClick={() => set({ bgImage: undefined, background: "accent" })}>Remove background image</button>}
    <div className="csb-field"><label htmlFor="csb-rec-frame">Frame</label><select id="csb-rec-frame" value={rec.frame} onChange={e => set({ frame: e.target.value as typeof rec.frame })}><option value="browser">Browser window</option><option value="mac">App window</option><option value="laptop">Laptop</option><option value="phone">Phone</option><option value="none">No frame</option></select></div>
    <div className="csb-layout-control"><div className="csb-layout-label"><span>Padding</span><output>{rec.padding}px</output></div><input type="range" min={0} max={120} step={4} value={rec.padding} onChange={e => set({ padding: Number(e.target.value) })} aria-label="Padding" /></div>
    <div className="csb-layout-control"><div className="csb-layout-label"><span>Corner radius</span><output>{rec.radius}px</output></div><input type="range" min={0} max={32} value={rec.radius} onChange={e => set({ radius: Number(e.target.value) })} aria-label="Corner radius" /></div>

    <div className="csb-inspector-divider" /><p className="csb-panel-kicker">Motion</p>
    {segment("Cursor", rec.cursor, [["halo", "Highlight"], ["arrow", "Arrow"], ["dot", "Dot"], ["none", "None"]], v => set({ cursor: v }))}
    <p className="csb-field-note">{rec.cursor === "halo" ? "Highlight puts a soft halo on your real cursor." : rec.cursor === "none" ? "No cursor effects." : "Draws a cursor that glides between clicks. Use this for videos that don’t show a cursor."}</p>
    <div className="csb-layout-control"><div className="csb-layout-label"><span>Zoom on clicks</span><output>{rec.zoom.toFixed(1)}×</output></div><input type="range" min={1} max={3} step={.1} value={rec.zoom} onChange={e => set({ zoom: Number(e.target.value) })} aria-label="Zoom on clicks" /></div>
    {segment("Speed", rec.speed ?? 1, [[0.5, "0.5×"], [0.75, "0.75×"], [1, "1×"], [1.5, "1.5×"], [2, "2×"]], v => set({ speed: v }))}
    {rec.crop && <p className="csb-field-note">Cropped to a detail ({Math.round(rec.crop.w)}% × {Math.round(rec.crop.h)}% of the screen). <button type="button" className="csb-link-button" onClick={() => set({ crop: undefined })}>Show full screen</button></p>}

    <div className="csb-inspector-divider" /><p className="csb-panel-kicker">Click moments · {clicks.length}</p>
    {!clicks.length ? <p className="csb-field-note">{rec.src ? "Studio finds your clicks automatically after you add a video. Use Find my clicks on the page, or Add a moment to place one yourself." : "Add a video first. Then click the video to mark moments."}</p>
      : <ol>{clicks.map((c, i) => <li key={i} className="csb-rec-click">
        <span>{i + 1}</span>
        <input type="number" min={0} step={.1} value={c.t} aria-label={`Click ${i + 1} time in seconds`} onChange={e => set({ clicks: clicks.map((k, j) => j === i ? { ...k, t: Math.max(0, Number(e.target.value) || 0) } : k) })} />
        <select aria-label={`Click ${i + 1} zoom`} value={c.zoom ?? ""} onChange={e => set({ clicks: clicks.map((k, j) => j === i ? { ...k, zoom: e.target.value ? Number(e.target.value) : undefined } : k) })}><option value="">Zoom: default</option><option value="1">No zoom</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="2.5">2.5×</option><option value="3">3×</option></select>
        <button type="button" aria-label={`Remove click ${i + 1} at ${fmtTime(c.t)}`} onClick={() => set({ clicks: clicks.filter((_, j) => j !== i) })}><X size={13} /></button>
      </li>)}</ol>}
    {clicks.length > 0 && <button type="button" className="csb-quiet-button" onClick={() => set({ clicks: [] })}>Clear all moments</button>}
  </div>;
}

export function DetailsControls({ section, onChange }: { section: CaseStudySection; onChange: Change }) {
  if (section.kind !== "details") return null;
  const items = section.items;
  const save = (next: Item[]) => onChange({ items: next });
  return <div className="csb-items">
    <p className="csb-panel-kicker">Details</p>
    <p className="csb-field-note">Uncheck anything this project doesn't need. Edit labels and values on the page.</p>
    <ol>{items.map((item, i) => <li key={i} className="csb-detail-row">
      <label className="csb-detail-toggle"><input type="checkbox" checked={!item.hidden} onChange={e => save(items.map((it, k) => k === i ? { ...it, hidden: !e.target.checked } : it))} /><span title={item.title}>{short(item.title, "Detail")}</span></label>
      <button type="button" aria-label={`Move ${item.title} up`} disabled={i === 0} onClick={() => save(move(items, i, i - 1))}><ArrowUp size={13} /></button>
      <button type="button" aria-label={`Move ${item.title} down`} disabled={i === items.length - 1} onClick={() => save(move(items, i, i + 1))}><ArrowDown size={13} /></button>
      <button type="button" aria-label={`Remove ${item.title}`} onClick={() => save(items.filter((_, k) => k !== i))}><X size={13} /></button>
      {isTeam(item) && !item.hidden && <label className="csb-check-field csb-detail-solo-toggle"><input type="checkbox" checked={item.value === "solo"} onChange={e => save(items.map((it, k) => k === i ? (e.target.checked ? { ...it, value: "solo", quote: it.value === "solo" ? it.quote : it.detail, detail: "I led research, design and testing end to end." } : { ...it, value: undefined, detail: it.quote || "Me — Product designer", quote: undefined }) : it))} /> Solo project (just me)</label>}
    </li>)}</ol>
    <select className="csb-items-add" value="" aria-label="Add a detail" onChange={e => { const preset = detailPresets[Number(e.target.value)]; if (preset) save([...items, { ...preset.item }]); }}>
      <option value="" disabled>+ Add a detail…</option>
      {detailPresets.map((preset, i) => <option key={preset.label} value={i}>{preset.label}</option>)}
    </select>
  </div>;
}
