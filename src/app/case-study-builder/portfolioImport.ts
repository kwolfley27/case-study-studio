import { createSection, lucidExample, type BuilderStudy, type CaseStudySection } from './model';
import { freshCopy, listStudies, saveStudy } from './studyLibrary';

/*
  Bring Katelyn's existing website case studies into the studio as drafts.
  library/portfolio-import.json was made from the website's code: each case study's words placed into
  studio sections, every picture it used (as a web-sized copy), and the words that lived inside its
  hand-built visuals (kept as notes in the asset gallery so nothing is lost).
*/
type PlanSection = { kind: CaseStudySection['kind']; eyebrow?: string; title?: string; body?: string; items?: Array<{ title?: string; detail?: string; value?: string; image?: string }>; fromVisual?: string };
export type PlanAsset = { src: string; kind: 'image' | 'video'; from: string };
export type PlanNote = { from: string; visual: string; text: string[]; images: string[] };
type Plan = { key: string; replaces: string; slug: string; name: string; title: string; summary: string; role: string; timeframe: string; team: string; tags: string[]; accent?: string; hero?: string | null; parent?: string | null; skipIf?: string; sections: PlanSection[]; notes: PlanNote[]; assets: PlanAsset[] };

const abs = (u?: string | null) => !u ? undefined : /^https?:/.test(u) ? u : new URL(u, `${location.origin}${location.pathname}`).href;

/** Plans not brought in yet. */
export const pending = (plans: Plan[], studies: Array<{ id: string }>) => { const have = new Set(studies.map(x => (x as BuilderStudy).replaces).filter(Boolean)); const ids = new Set(studies.map(x => x.id)); return plans.filter(p => !have.has(p.replaces) && !(p.skipIf && ids.has(p.skipIf))); };

export async function loadPortfolioPlans(): Promise<Plan[]> {
  const r = await fetch(`${import.meta.env.BASE_URL}library/portfolio-import.json?v=${Date.now()}`);
  if (!r.ok) throw new Error('Couldn’t load your website case studies.');
  return (await r.json()).studies as Plan[];
}

function toStudy(p: Plan): BuilderStudy {
  const base = freshCopy(lucidExample, p.title);
  const sections = p.sections.map(s => {
    const sec = createSection(s.kind);
    sec.eyebrow = s.eyebrow || sec.eyebrow;
    sec.title = s.title || sec.title;
    if (s.body !== undefined) sec.body = s.body;
    if (s.items?.length) sec.items = s.items.map(it => ({ ...(sec.items[0] ?? {}), title: /^(Image|Slide) \d+$/.test(it.title ?? '') ? '' : it.title ?? '', detail: it.detail ?? '', ...(it.value !== undefined ? { value: it.value } : {}), ...(it.image ? { image: abs(it.image) } : {}) }));
    sec.variant = 'light';
    if (s.kind !== 'narrative' && s.body === undefined) { sec.body = ''; sec.options = { ...(sec.options ?? {}), hideBody: true }; }
    // name it after the old chapter so the section list reads like the old page
    const short = (t?: string) => t && t.length <= 30 ? t : undefined;
    sec.navLabel = s.kind === 'narrative' ? short(s.eyebrow) || short(s.title) : short(s.title !== s.eyebrow ? s.title : undefined) || (s.eyebrow ? `${s.eyebrow} visuals`.slice(0, 30) : undefined);
    return sec;
  });
  const facts = [
    { label: 'Role', value: p.role }, { label: 'Team', value: p.team },
    { label: 'Timeline', value: p.timeframe }, { label: 'Status', value: '' },
  ];
  return {
    ...base,
    slug: p.slug, title: p.title, summary: p.summary,
    client: p.parent === 'lucid' ? 'Lucid Software' : p.name,
    role: p.role, timeframe: p.timeframe, facts,
    accent: /^#[0-9a-f]{6}$/i.test(p.accent || '') ? p.accent! : base.accent,
    heroImage: abs(p.hero), hero: { style: 'standard', bg: 'accent', frame: 'none' },
    sections, moreStudies: [], publishedAt: undefined, onWebsite: false,
    replaces: p.replaces, importTidy: 2,
    assets: p.assets.map(a => ({ ...a, src: abs(a.src)! })),
    notes: p.notes.map(n => ({ ...n, images: n.images.map(i => abs(i)!) })),
  };
}

/** Add any website case studies that aren't in the studio yet. Returns how many were added. */
export async function importPortfolio(onProgress?: (text: string) => void): Promise<number> {
  const plans = await loadPortfolioPlans();
  const list = await listStudies();
  const have = new Set(list.map(s => (s as BuilderStudy).replaces).filter(Boolean));
  const ids = new Set(list.map(s => s.id));
  let added = 0;
  for (const p of plans) {
    if (have.has(p.replaces) || (p.skipIf && ids.has(p.skipIf))) continue;
    onProgress?.(`Bringing in ${p.title}…`);
    await saveStudy(toStudy(p)); added++;
  }
  return added;
}
