import type { CaseStudySection } from "./model";

type Layout = NonNullable<CaseStudySection["layout"]>;

export function LayoutControls({ section, onChange }: { section: CaseStudySection; onChange: (patch: Partial<CaseStudySection>) => void }) {
  if (!["gallery", "metrics", "wireframes"].includes(section.kind)) return null;
  const layout = section.layout ?? {};
  const max = section.kind === "gallery" ? 8 : section.kind === "metrics" ? 6 : 4;
  const count = Math.min(max, Math.max(1, layout.count ?? section.items.length));
  const changeLayout = (patch: Partial<Layout>) => onChange({ layout: { ...layout, ...patch } });
  const changeCount = (next: number) => {
    const items = [...section.items];
    while (items.length < next) {
      const index = items.length;
      items.push(section.kind === "metrics"
        ? { title: `Metric ${index + 1}`, detail: "Explain what this number means.", value: "0" }
        : { title: section.kind === "wireframes" ? `Screen ${index + 1}` : `Artifact ${String(index + 1).padStart(2, "0")}`, detail: "Add a caption explaining why this matters.", image: "", tileSize: "standard" });
    }
    onChange({ layout: { ...layout, count: next }, items });
  };
  return <div className="csb-layout-controls">
    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Layout controls</p>
    <p className="csb-layout-intro">Adjust the composition. Hidden items keep their content.</p>
    <div className="csb-layout-control"><div className="csb-layout-label"><label htmlFor="csb-layout-count">{section.kind === "metrics" ? "Data points" : section.kind === "wireframes" ? "Mockups" : "Images / mockups"}</label><output htmlFor="csb-layout-count">{count}</output></div><input id="csb-layout-count" type="range" min="1" max={max} step="1" value={count} onChange={event => changeCount(Number(event.target.value))} /></div>
    {section.kind === "gallery" && <>
      <div className="csb-layout-control"><div className="csb-layout-label"><label htmlFor="csb-layout-columns">Grid columns</label><output htmlFor="csb-layout-columns">{layout.columns ?? 2}</output></div><input id="csb-layout-columns" type="range" min="1" max="3" step="1" value={layout.columns ?? 2} onChange={event => changeLayout({ columns: Number(event.target.value) as 1 | 2 | 3 })} /></div>
      <div className="csb-field"><label htmlFor="csb-layout-pattern">Arrangement</label><select id="csb-layout-pattern" value={layout.pattern ?? "even"} onChange={event => changeLayout({ pattern: event.target.value as Layout["pattern"] })}><option value="even">Even grid</option><option value="bento">Bento grid</option></select></div>
      <div className="csb-field"><label htmlFor="csb-layout-presentation">Presentation</label><select id="csb-layout-presentation" value={layout.presentation ?? "images"} onChange={event => changeLayout({ presentation: event.target.value as Layout["presentation"], ...(event.target.value === "phones" ? { pattern: "even" as const } : {}) })}><option value="images">Images / GIFs</option><option value="phones">iPhone mockups</option></select></div>
      <div className="csb-layout-control"><div className="csb-layout-label"><label htmlFor="csb-layout-gap">Spacing</label><output htmlFor="csb-layout-gap">{layout.gap ?? 20}px</output></div><input id="csb-layout-gap" type="range" min="8" max="40" step="2" value={layout.gap ?? 20} onChange={event => changeLayout({ gap: Number(event.target.value) })} /></div>
      <div className="csb-layout-control"><div className="csb-layout-label"><label htmlFor="csb-layout-gallery-scale">{layout.presentation === "phones" ? "Phone size" : "Image size"}</label><output htmlFor="csb-layout-gallery-scale">{layout.scale ?? 100}%</output></div><input id="csb-layout-gallery-scale" type="range" min="70" max="130" step="5" value={layout.scale ?? 100} onChange={event => changeLayout({ scale: Number(event.target.value) })} /></div>
      {layout.pattern === "bento" && <div className="csb-layout-tiles"><span className="csb-field-note">Tile sizes</span>{section.items.slice(0, count).map((item, index) => <div className="csb-layout-tile" key={index}><label htmlFor={`csb-tile-${section.id}-${index}`}>{String(index + 1).padStart(2, "0")} · {item.title}</label><select id={`csb-tile-${section.id}-${index}`} value={item.tileSize ?? (index === 0 ? "wide" : "standard")} onChange={event => onChange({ items: section.items.map((current, itemIndex) => itemIndex === index ? { ...current, tileSize: event.target.value as NonNullable<typeof item.tileSize> } : current) })}><option value="standard">Standard</option><option value="wide">Wide</option><option value="large">Large</option></select></div>)}</div>}
    </>}
    {section.kind === "wireframes" && <div className="csb-layout-control"><div className="csb-layout-label"><label htmlFor="csb-layout-phone-scale">Phone size</label><output htmlFor="csb-layout-phone-scale">{layout.scale ?? 100}%</output></div><input id="csb-layout-phone-scale" type="range" min="70" max="130" step="5" value={layout.scale ?? 100} onChange={event => changeLayout({ scale: Number(event.target.value) })} /></div>}
  </div>;
}
