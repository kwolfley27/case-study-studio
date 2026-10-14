import { useEffect, useState } from "react";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { CaseStudyCanvas } from "./CaseStudyCanvas";
import type { BuilderStudy } from "./model";
import "./case-study-builder.css";
import "./apple-style.css";

export default function PublishedCaseStudy({ slug }: { slug: string }) {
  const [study, setStudy] = useState<BuilderStudy | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-863fdde7/notion/case-studies`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` }, signal: controller.signal,
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The case study could not be loaded.");
      const match = data.caseStudies?.find((item: BuilderStudy) => item.slug === slug);
      if (!match) throw new Error("This case study has not been published yet.");
      setStudy(match);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The case study could not be loaded."); });
    return () => controller.abort();
  }, [slug]);
  if (!study) return <main className="csb-app" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}><div style={{ maxWidth: 480, textAlign: "center" }}><a href="/" style={{ color: "#497e72", fontSize: 13 }}>← Back to portfolio</a><h1 style={{ fontSize: 28, letterSpacing: "-.04em", margin: "26px 0 10px" }}>{error ? "Case study unavailable" : "Loading case study…"}</h1>{error && <p style={{ color: "#6d7672", lineHeight: 1.55 }}>{error}</p>}</div></main>;
  return <main className="csb-app"><div style={{ position: "fixed", zIndex: 20, top: 20, left: 20 }}><a href="/" className="csb-quiet-button" style={{ textDecoration: "none" }}>← Portfolio</a></div><CaseStudyCanvas study={study} /></main>;
}
