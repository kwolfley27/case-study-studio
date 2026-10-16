import { useEffect, useState } from "react";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { CaseStudyCanvas } from "./CaseStudyCanvas";
import { PresentMode } from "./PresentMode";
import type { BuilderStudy } from "./model";
import { publishedJsonUrl } from "./Publish";
import "./case-study-builder.css";
import "./apple-style.css";

// embed: shown inside katelynwolfley.design, which has its own navigation, so the page drops its "← Portfolio" link.
export default function PublishedCaseStudy({ slug, embed = false }: { slug: string; embed?: boolean }) {
  const [study, setStudy] = useState<BuilderStudy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    // Published from the Studio (latest wins), else the older Notion feed.
    fetch(`${publishedJsonUrl(slug)}?v=${Date.now()}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null).then(own => {
      if (own && own.sections) { setStudy(own); document.title = own.title; return; }
      return fetch(`https://${projectId}.supabase.co/functions/v1/make-server-863fdde7/notion/case-studies`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` }, signal: controller.signal,
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The case study could not be loaded.");
      const match = data.caseStudies?.find((item: BuilderStudy) => item.slug === slug);
      if (!match) throw new Error("This case study has not been published yet.");
      setStudy(match);
    }); }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The case study could not be loaded."); });
    return () => controller.abort();
  }, [slug]);
  if (!study) return <main className="csb-app" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}><div style={{ maxWidth: 480, textAlign: "center" }}><a href="https://katelynwolfley.design" style={{ color: "#497e72", fontSize: 13 }}>← Back to portfolio</a><h1 style={{ fontSize: 28, letterSpacing: "-.04em", margin: "26px 0 10px" }}>{error ? "Case study unavailable" : "Loading case study…"}</h1>{error && <p style={{ color: "#6d7672", lineHeight: 1.55 }}>{error}</p>}</div></main>;
  return <main className="csb-app csb-published"><a href="#story" className="csb-skip" onClick={e => { e.preventDefault(); const sec = document.querySelector<HTMLElement>('[id^="builder-section-"]'); const h = sec?.querySelector<HTMLElement>("h2") ?? sec; if (!h) return; h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); sec?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Skip to the story</a>{!embed && <div style={{ position: "fixed", zIndex: 20, top: 20, left: 20 }}><a href="https://katelynwolfley.design" className="csb-quiet-button" style={{ textDecoration: "none" }}>← Portfolio</a></div>}{!presenting && <button type="button" className="csb-quiet-button csb-present-open" onClick={() => setPresenting(true)}>Present</button>}<CaseStudyCanvas study={study} />{presenting && <PresentMode scroller={() => document.scrollingElement as HTMLElement} onExit={() => setPresenting(false)} />}</main>;
}
