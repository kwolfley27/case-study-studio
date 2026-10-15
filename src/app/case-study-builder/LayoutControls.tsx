import type { CaseStudySection } from "./model";

type Layout = NonNullable<CaseStudySection["layout"]>;

export function LayoutControls({ section, onChange }: { section: CaseStudySection; onChange: (patch: Partial<CaseStudySection>) => void }) {
  if (!["gallery", "metrics", "wireframes", "findings", "interviews", "carousel"].includes(section.kind)) return null;
  const layout = section.layout ?? {};
  const max = ["gallery", "findings", "carousel"].includes(section.kind) ? 8 : section.kind === "metrics" ? 6 : section.kind === "interviews" ? 6 : 4;
  const count = Math.min(max, Math.max(1, layout.count ?? section.items.length));
  const changeLayout = (patch: Partial<Layout>) => onChange({ layout: { ...layout, ...patch } });
  const changeCount = (next: number) => {
    const items = [...section.items];
    while (items.length < next) {
      const index = items.length;
      items.push(section.kind === "findings" ? { title: `Finding ${index + 1}`, detail: "Add the evidence behind this finding." }
        : section.kind === "interviews" ? { title: `Participant ${index + 1}`, value: "Role or context", detail: "A one-sentence summary of this conversation.", finding: "The key finding.", findingNote: "Why it matters.", quote: "A short verbatim quote.", quoteNote: "What it shows." }
        : section.kind === "carousel" ? { title: `Screen ${index + 1}`, detail: "Why this screen was explored.", image: "" }
        : section.kind === "metrics"
        ? { title: `Metric ${index + 1}`, detail: "Explain what this number means.", value: "0" }
        : { title: section.kind === "wireframes" ? `Screen ${index + 1}` : `Artifact ${String(index + 1).padStart(2, "0")}`, detail: "Add a caption explaining why this matters.", image: "", tileSize: "standard" });
    }
    onChange({ layout: { ...layout, count: next }, items });
  };
  return <div className="csb-layout-controls">
    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Layout controls</p>
    <p className="csb-layout-intro">Adjust the composition. Hidden items keep their content.</p>
    <NumberPick label={section.kind === "metrics" ? "How many numbers" : section.kind === "wireframes" ? "How many mockups" : section.kind === "findings" ? "How many findings" : section.kind === "interviews" ? "How many participants" : section.kind === "carousel" ? "How many screens" : "How many images"} value={count} min={1} max={max} onChange={changeCount} />
    {section.kind === "gallery" && <>
      <NumberPick label="Columns" value={layout.columns ?? 2} min={1} max={3} onChange={n => changeLayout({ columns: n as 1 | 2 | 3 })} />
      <div className="csb-field"><label htmlFor="csb-layout-pattern">Arrangement</label><select id="csb-layout-pattern" value={layout.pattern ?? "even"} onChange={event => changeLayout({ pattern: event.target.value as Layout["pattern"] })}><option value="even">Even grid</option><option value="bento">Bento grid</option></select></div>
      <div className="csb-field"><label htmlFor="csb-layout-presentation">Presentation</label><select id="csb-layout-presentation" value={layout.presentation ?? "images"} onChange={event => changeLayout({ presentation: event.target.value as Layout["presentation"], ...(event.target.value === "phones" ? { pattern: "even" as const } : {}) })}><option value="images">Images / GIFs</option><option value="phones">iPhone mockups</option></select></div>
      <div className="csb-layout-control"><div className="csb-layout-label"><label htmlFor="csb-layout-gap">Spacing</label><output htmlFor="csb-layout-gap">{layout.gap ?? 20}px</output></div><input id="csb-layout-gap" type="range" min="8" max="40" step="2" value={layout.gap ?? 20} onChange={event => changeLayout({ gap: Number(event.target.value) })} /></div>
      <div className="csb-layout-control"><div className="csb-layout-label"><label htmlFor="csb-layout-gallery-scale">{layout.presentation === "phones" ? "Phone size" : "Image size"}</label><output htmlFor="csb-layout-gallery-scale">{layout.scale ?? 100}%</output></div><input id="csb-layout-gallery-scale" type="range" min="70" max="130" step="5" value={layout.scale ?? 100} onChange={event => changeLayout({ scale: Number(event.target.value) })} /></div>
      {layout.pattern === "bento" && <div className="csb-layout-tiles"><span className="csb-field-note">Tile sizes</span>{section.items.slice(0, count).map((item, index) => <div className="csb-layout-tile" key={index}><label htmlFor={`csb-tile-${section.id}-${index}`}>{String(index + 1).padStart(2, "0")} · {item.title}</label><select id={`csb-tile-${section.id}-${index}`} value={item.tileSize ?? (index === 0 ? "wide" : "standard")} onChange={event => onChange({ items: section.items.map((current, itemIndex) => itemIndex === index ? { ...current, tileSize: event.target.value as NonNullable<typeof item.tileSize> } : current) })}><option value="standard">Standard</option><option value="wide">Wide</option><option value="large">Large</option></select></div>)}</div>}
    </>}
    {section.kind === "wireframes" && <div className="csb-layout-control"><div className="csb-layout-label"><label htmlFor="csb-layout-phone-scale">Phone size</label><output htmlFor="csb-layout-phone-scale">{layout.scale ?? 100}%</output></div><input id="csb-layout-phone-scale" type="range" min="70" max="130" step="5" value={layout.scale ?? 100} onChange={event => changeLayout({ scale: Number(event.target.value) })} /></div>}
  </div>;
}

/* A small number choice: tap a number (up to 8 options), or use − and + beyond that. */
function NumberPick({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const n = Math.max(min, Math.min(max, value));
  const opts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return <div className="csb-numpick"><span className="csb-sb-label">{label}</span>
    {opts.length <= 8
      ? <div className="csb-numpick-row" role="radiogroup" aria-label={label}>{opts.map(o => <button key={o} type="button" role="radio" aria-checked={o === n} onClick={() => onChange(o)}>{o}</button>)}</div>
      : <div className="csb-numpick-step"><button type="button" aria-label="Fewer" disabled={n <= min} onClick={() => onChange(n - 1)}>−</button><output aria-live="polite">{n}</output><button type="button" aria-label="More" disabled={n >= max} onClick={() => onChange(n + 1)}>+</button></div>}
  </div>;
}
