import { ArrowDown, ArrowUp, Copy, X } from "lucide-react";
import type { CaseStudySection, SectionKind } from "./model";
import { personaBlockPresets, personaBlockType } from "./AppleExtras";

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
  journey: { min: 2, max: 5, noun: "stage" }, issueFlow: { min: 2, max: 6, noun: "step" }, gap: { min: 1, max: 4, noun: "approach" },
  competitors: { min: 1, max: 4, noun: "competitor" }, problem: { min: 1, max: 6, noun: "row" }, gallery: { min: 1, max: 8, noun: "image" },
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
  const set = (key: string, hidden: boolean) => onChange({ options: { ...o, [key]: hidden } });
  return <div className="csb-show-toggles">
    <p className="csb-panel-kicker">Show</p>
    <label className="csb-check-field"><input type="checkbox" checked={!o.hideEyebrow} onChange={e => set("hideEyebrow", !e.target.checked)} /> Label above the title</label>
    <label className="csb-check-field"><input type="checkbox" checked={!o.hideTitle} onChange={e => set("hideTitle", !e.target.checked)} /> Title</label>
    {section.kind !== "narrative" && <label className="csb-check-field"><input type="checkbox" checked={!o.hideBody} onChange={e => set("hideBody", !e.target.checked)} /> Intro text</label>}
  </div>;
}

export function ItemsManager({ section, onChange }: { section: CaseStudySection; onChange: Change }) {
  const rule = rules[section.kind];
  if (!rule) return null;
  const items = section.items;
  const add = (from: number) => {
    const source = items[from] ?? items[items.length - 1] ?? { title: "", detail: "" };
    const copy: Item = { ...source, title: from === items.length - 1 && source === items[items.length - 1] ? `New ${rule.noun}` : `${source.title} (copy)`, image: source.image !== undefined ? "" : undefined, frameId: undefined, point: undefined };
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
  if (section.kind !== "persona") return null;
  const [person, ...rest] = section.items;
  const blocks = rest.map((item, i) => ({ ...item, blockType: personaBlockType(item, i + 1) }));
  const save = (next: Item[]) => onChange({ items: [person, ...next] });
  const types: Array<[NonNullable<Item["blockType"]>, string]> = [["list", "List"], ["text", "Paragraph"], ["quote", "Quote"], ["meter", "Scale"], ["day", "Timeline"]];
  return <div className="csb-items">
    <p className="csb-panel-kicker">Persona</p>
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.portrait !== false} onChange={e => onChange({ options: { ...section.options, portrait: e.target.checked } })} /> Show portrait</label>
    <p className="csb-field-note">Blocks appear in this order. Rename them and edit each point on the page.</p>
    <ol>{blocks.map((block, i) => <li key={i} className="has-type">
      <span title={block.title}>{short(block.title, "Block")}</span>
      <select aria-label={`${block.title} style`} value={block.blockType} onChange={e => save(blocks.map((b, k) => k === i ? { ...b, blockType: e.target.value as Item["blockType"], value: e.target.value === "meter" ? b.value || "60" : b.value } : b))}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button type="button" aria-label={`Move ${block.title} up`} disabled={i === 0} onClick={() => save(move(blocks, i, i - 1))}><ArrowUp size={13} /></button>
      <button type="button" aria-label={`Move ${block.title} down`} disabled={i === blocks.length - 1} onClick={() => save(move(blocks, i, i + 1))}><ArrowDown size={13} /></button>
      <button type="button" aria-label={`Remove ${block.title}`} onClick={() => save(blocks.filter((_, k) => k !== i))}><X size={13} /></button>
      {block.blockType === "meter" && <input className="csb-items-range" type="range" min={0} max={100} value={Number(block.value) || 0} aria-label={`${block.title} level`} onChange={e => save(blocks.map((b, k) => k === i ? { ...b, value: e.target.value } : b))} />}
    </li>)}</ol>
    <select className="csb-items-add" value="" aria-label="Add a persona block" onChange={e => { const preset = personaBlockPresets[Number(e.target.value)]; if (preset) save([...blocks, { ...preset.item }]); }}>
      <option value="" disabled>+ Add a block…</option>
      {personaBlockPresets.map((preset, i) => <option key={preset.label} value={i}>{preset.label}</option>)}
    </select>
    <p className="csb-field-note">Need a second persona? Use Duplicate section below.</p>
  </div>;
}
