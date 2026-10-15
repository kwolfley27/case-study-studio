export type SectionKind = "coverHero" | "details" | "timeline" | "screenRecording" | "prototype" | "findings" | "interviews" | "carousel" | "wireframes" | "fullMedia" | "survey" | "narrative" | "metrics" | "flow" | "quotes" | "comparison" | "gallery" | "methods" | "columns" | "problem" | "competitors" | "gap" | "persona" | "journey" | "issueFlow" | "annotated";

export interface SurveyQuestion {
  sourceName: string;
  columnIndex: number;
  chart: "bars" | "arcs";
  multiSelect: boolean;
  answered: number;
  options: Array<{ label: string; count: number }>;
}

export interface SurveySource {
  url?: string;
  updatedAt: string;
  totalResponses: number;
  questions: SurveyQuestion[];
}

export interface CaseStudySection {
  id: string;
  kind: SectionKind;
  eyebrow: string;
  title: string;
  body: string;
  variant: "light" | "dark" | "tinted";
  items: Array<{ title: string; detail: string; value?: string; image?: string; frameId?: string; tileSize?: "standard" | "wide" | "large"; finding?: string; findingNote?: string; quote?: string; quoteNote?: string; when?: string; point?: string; blockType?: "list" | "text" | "quote" | "day" | "meter"; hidden?: boolean }>;
  /** Per-section switches, e.g. hideEyebrow, hideTitle, hideBody, portrait. */
  options?: Record<string, string | number | boolean>;
  /** Screen recording settings: video, background, frame, cursor, click moments, crop. */
  recording?: { src: string; background: "accent" | "sunset" | "ocean" | "aurora" | "paper" | "night" | "image" | "none"; bgImage?: string; frame: "none" | "browser" | "mac" | "laptop" | "phone"; padding: number; radius: number; cursor: "arrow" | "dot" | "none"; zoom: number; clicks: Array<{ t: number; x: number; y: number; zoom?: number; hold?: number }>; loop?: boolean; controls?: boolean; speed?: number; crop?: { x: number; y: number; w: number; h: number } };
  /** Token text styles per field, e.g. { title: { tone: "accent", size: "l" } }. */
  textStyles?: Record<string, { tone?: "ink" | "muted" | "accent" | "accent2"; size?: "s" | "l" | "xl"; weight?: "light" | "regular" | "bold" }>;
  /** Work timeline phases (bars under the weeks). detail = one note per line. */
  phases?: Array<{ title: string; detail: string }>;
  /** Work timeline column label, e.g. Week, Day, Sprint. */
  timeUnit?: string;
  /** Short label for the case study side menu. Falls back to navDefaults[kind]. */
  navLabel?: string;
  /** Hide this section from the side menu. */
  hideFromNav?: boolean;
  layout?: {
    count?: number;
    columns?: 1 | 2 | 3;
    pattern?: "even" | "bento";
    gap?: number;
    scale?: number;
    presentation?: "images" | "phones";
  };
  figmaSource?: { url: string; fileKey: string; nodeId: string; importedAt: string; mode: "snapshot" | "live" };
  surveySource?: SurveySource;
  prototype?: { url: string; device: "phone" | "laptop"; hideUi?: boolean };
  fit?: "contain" | "cover";
  criteria?: string;
  columns?: 2 | 3 | 4;
  templateId?: string;
  sourcePageId?: string;
}

export interface BuilderStudy {
  id: string;
  slug: string;
  title: string;
  summary: string;
  client: string;
  role: string;
  timeframe: string;
  accent: string;
  heroImage?: string;
  sourcePageId?: string;
  lastSyncedAt?: string;
  sources?: { notionUrl?: string; figmaUrl?: string };
  /** Show the case study side menu (default on). */
  showNav?: boolean;
  /** Page style. Defaults to editorial. */
  theme?: "editorial" | "classic";
  /** Optional second accent colour, used through text styles. */
  accent2?: string;
  /** Motion level: expressive (default) or calm. */
  motion?: "calm" | "expressive";
  /** Brand tokens: colours, fonts, headline weight, corners. */
  brand?: Partial<import("./brand").Brand>;
  sections: CaseStudySection[];
}

export const componentNames: Record<SectionKind, string> = {
  coverHero: "Title reveal hero",
  details: "Project details",
  screenRecording: "Screen recording",
  timeline: "Work timeline",
  prototype: "Interactive prototype",
  findings: "Numbered findings",
  interviews: "Interview highlights",
  carousel: "Screen carousel",
  wireframes: "Linked wireframe showcase",
  fullMedia: "Full width image / GIF",
  survey: "Survey results",
  persona: "Persona",
  journey: "Journey & emotion",
  issueFlow: "Color-coded issue flow",
  annotated: "Annotated screen",
  methods: "Research methods", columns: "Flexible columns", problem: "Problem statement", competitors: "Competitor analysis", gap: "Gap analysis",
  narrative: "Editorial story",
  metrics: "Metric constellation",
  flow: "Process flow",
  quotes: "Research voices",
  comparison: "Before / after",
  gallery: "Visual gallery",
};

export const componentDescriptions: Record<SectionKind, string> = {
  details: "Your role, timeline, team and tools at a glance. Show or hide any detail.",
  screenRecording: "A prototype video on a styled background that zooms into each click.",
  timeline: "Week-by-week activities grouped into phases, built from your process log.",
  coverHero: "A big title that holds still while your hero image scrolls up and over it.",
  prototype: "Embed a clickable Figma prototype in a phone or laptop frame.",
  findings: "A numbered list of problems or findings, one idea per row.",
  interviews: "Pick a participant to see their summary, a finding and a quote.",
  carousel: "Large screens in a horizontal scroller with arrows.",
  wireframes: "Import Figma screens into staggered iPhone mockups, then refresh by frame ID.",
  fullMedia: "Show an image or animated GIF edge to edge at its natural proportions.",
  survey: "Turn Google Forms responses into clear, evidence-backed charts.",
  persona: "A portrait, goals, pain points, and a day-in-the-life timeline.",
  journey: "Plot emotion across stages with observed quotes and opportunities.",
  issueFlow: "Trace task steps and color-code the issues found in research.",
  annotated: "Explain one designed screen with numbered callouts.",
  methods: "A clear research intention with the methods behind it.", columns: "Icon-led columns for findings, principles, or opportunities.", problem: "Frame who needs help, the barrier, and the desired change.", competitors: "Compare competitors across six editable criteria.", gap: "Connect existing approaches to an unmet need.",
  narrative: "A focused, readable passage with a strong visual pause.",
  metrics: "Animated figures with the context behind each number.",
  flow: "A step-by-step sequence that draws itself as you scroll.",
  quotes: "Human evidence, surfaced as an editorial quote system.",
  comparison: "Show the shift from the initial assumption to the outcome.",
  gallery: "A restrained frame for mockups, artifacts, and prototypes.",
};

export const navDefaults: Record<SectionKind, string> = {
  coverHero: "Overview", details: "Overview", timeline: "Timeline", screenRecording: "Demo", prototype: "Prototype", findings: "Findings", interviews: "Interviews", carousel: "Explorations",
  wireframes: "Wireframes", fullMedia: "Visuals", survey: "Survey", persona: "Persona", journey: "Journey", issueFlow: "Task analysis",
  annotated: "The design", methods: "Research", columns: "Highlights", problem: "The problem", competitors: "Competitors", gap: "The gap",
  narrative: "Context", metrics: "By the numbers", flow: "Process", quotes: "What we heard", comparison: "Before & after", gallery: "Gallery",
};
export const navLabelFor = (section: Pick<CaseStudySection, "kind" | "navLabel">) => section.navLabel?.trim() || navDefaults[section.kind];

export const createSection = (kind: SectionKind): CaseStudySection => ({
  id: crypto.randomUUID(),
  kind,
  eyebrow: componentNames[kind],
  title: {
    coverHero: "Making access feel obvious, not accidental.",
    timeline: "How the work unfolded",
    details: "Project overview",
    screenRecording: "See it in motion",
    prototype: "Try it yourself",
    findings: "What kept coming up",
    interviews: "Interview highlights",
    carousel: "Screens I explored",
    wireframes: "From wireframes to a clear direction",
    fullMedia: "See the work in detail",
    survey: "User research & key insights",
    persona: "Getting to know the people behind the problem",
    journey: "Follow the experience, not just the screens",
    issueFlow: "Spot the risks in every action",
    annotated: "Show what changed, and why",
    methods: "Understanding how people use it today", columns: "What matters most", problem: "Make the real problem impossible to miss", competitors: "Where the alternatives fall short", gap: "Where the intervention should be",
    narrative: "The moment that changed the direction",
    metrics: "The opportunity, in numbers",
    flow: "How the experience unfolded",
    quotes: "What people actually said",
    comparison: "From the original brief to the real problem",
    gallery: "The work, up close",
  }[kind],
  body: kind === "coverHero" ? "" : kind === "fullMedia" ? "Add a short introduction, or leave this blank to let the media speak for itself." : "Add the key idea you want a reader to remember. Keep it short enough to let the visual carry the story.",
  variant: "light",
  items: {
    coverHero: [{ title: "Hero visual", detail: "", image: "" }],
    details: [{ title: "My role", detail: "Product designer — research, UX and UI" }, { title: "Timeline", detail: "6 weeks · Summer 2026" }, { title: "Team", detail: "Me — Product designer\nAlex Kim — Product manager\nSam Lee — Engineer" }, { title: "Tools", detail: "Figma, Notion, Maze" }, { title: "Platform", detail: "iOS and web" }, { title: "Deliverables", detail: "Research report, prototype, UI kit" }],
    screenRecording: [{ title: "yourproduct.com", detail: "Add a caption, like: booking a class now takes two taps." }],
    timeline: ([["Stakeholder questions", "Discover", "1"], ["Competitive research", "Discover", "1"], ["User interviews", "Discover", "1-2"], ["Empathy map & persona", "Define", "2"], ["Problem statement", "Define", "2"], ["Card sorting", "Develop", "3"], ["Sketches & wireframes", "Develop", "3"], ["Prototype", "Develop", "3-4"], ["Usability testing", "Deliver", "4"], ["Improvements", "Deliver", "4"]] as const).map(([title, value, when]) => ({ title, value, when, detail: "" })),
    prototype: [{ title: "Prototype", detail: "Add a note on what to try, like: tap Edit to see the new access notice." }],
    findings: ["The first finding", "The second finding", "The third finding", "The fourth finding"].map(title => ({ title, detail: "One or two sentences of evidence: what you saw, how often, and why it matters." })),
    interviews: [["Participant one", "Role or context"], ["Participant two", "Role or context"], ["Participant three", "Role or context"]].map(([title, value]) => ({ title, value, detail: "A one-sentence summary of this conversation and what it revealed.", finding: "The most important thing you learned from this person.", findingNote: "Why it matters for the design.", quote: "A short verbatim quote from the interview.", quoteNote: "What this quote shows." })),
    carousel: ["Screen one", "Screen two", "Screen three", "Screen four"].map(title => ({ title, detail: "Why this screen was explored, kept or shelved.", image: "" })),
    wireframes: Array.from({length:4}, (_, i) => ({title:`Screen ${i+1}`, detail:"Add a caption explaining this step.", image:""})),
    fullMedia: [{ title: "Visual detail", detail: "Add a caption about what this shows.", image: "" }],
    survey: [{ title: "Survey question one", detail: "Add a short takeaway from this result." }, { title: "Survey question two", detail: "Explain what this result changed in the design." }],
    persona: [{ title: "The person", detail: "Role, context, and a concise description.", value: "Traits", image: "" }, { title: "Goals", detail: "Goal one\nGoal two\nGoal three" }, { title: "Pain points", detail: "Pain one\nPain two\nPain three" }, { title: "A day in their life", detail: "Morning: a key moment\nAfternoon: another moment\nEvening: a final moment" }],
    journey: ["Discover", "Try", "Get stuck", "Recover", "Continue"].map((title, index) => ({ title, detail: ["Curious · What can I do?", "Hopeful · This looks useful.", "Frustrated · What changed?", "Reassured · Now I understand.", "Confident · I can keep going."][index], value: String([46, 72, 20, 54, 80][index]) })),
    issueFlow: ["Open entry point", "Ask a question", "Review answer", "Copy the result"].map((title, index) => ({ title, detail: ["Wrong selection", "Premature action", "Missed indicator", "Recall failure"][index], value: ["S", "A", "C", "R"][index] })),
    annotated: [{ title: "Designed screen", detail: "Upload a screen or paste its image URL.", image: "" }, ...["Menu", "Offers", "Subscription", "Notifications", "Profile", "Navigation"].map(title => ({ title, detail: "Explain the design decision here." }))],
    methods: [{title: "Interviews", detail: "Understand motivations and unmet needs."}, {title: "Think-aloud testing", detail: "Observe behavior in the real flow."}, {title: "Task analysis", detail: "Find moments of friction."}],
    columns: Array.from({length: 3}, (_, i) => ({title: `Finding ${i + 1}`, detail: "Add an observation and explain why it matters.", value: "Evidence or measurement"})),
    problem: [{title: "Who", detail: "Describe the people affected."}, {title: "Needs", detail: "What are they trying to accomplish?"}, {title: "Because", detail: "What evidence explains the barrier?"}],
    competitors: ["Alternative A", "Alternative B", "Alternative C"].map(title => ({title, detail: "Add source, date, and scoring rationale.", value: "0,0,0,0,0,0"})),
    gap: [{title: "Existing approach A", detail: "What it offers", value: "What is missing"}, {title: "Existing approach B", detail: "What it offers", value: "What is missing"}, {title: "Existing approach C", detail: "What it offers", value: "What is missing"}],
    narrative: [],
    metrics: [
      { value: "15", title: "Participants", detail: "Describe what this figure represents." },
      { value: "3", title: "Days", detail: "Give the number useful context." },
      { value: "1", title: "Key insight", detail: "Explain what changed next." },
    ],
    flow: [
      { title: "Discover", detail: "What did you observe?" },
      { title: "Define", detail: "What did the evidence reveal?" },
      { title: "Design", detail: "How did the solution evolve?" },
    ],
    quotes: [
      { title: "Participant 01", detail: "Add a real, short research quote here." },
      { title: "Participant 02", detail: "Use the participant’s own words." },
    ],
    comparison: [
      { title: "Before", detail: "State the original assumption or experience." },
      { title: "After", detail: "State what your work changed." },
    ],
    gallery: Array.from({ length: 3 }, (_, index) => ({ title: `Artifact ${String(index + 1).padStart(2, "0")}`, detail: "Add a caption explaining why this matters.", image: "", tileSize: index === 0 ? "wide" as const : "standard" as const })),
  }[kind],
  ...({
    gallery: { layout: { count: 3, columns: 2 as const, pattern: "bento" as const, gap: 20, scale: 100, presentation: "images" as const } },
    metrics: { layout: { count: 3, columns: 3 as const } },
    wireframes: { layout: { count: 4, scale: 100 } },
    prototype: { prototype: { url: "", device: "phone" as const, hideUi: true } },
    findings: { layout: { count: 4 } },
    screenRecording: { recording: { src: "", background: "accent" as const, frame: "browser" as const, padding: 64, radius: 14, cursor: "arrow" as const, zoom: 1.8, clicks: [], loop: true, controls: false, speed: 1 } },
    timeline: { timeUnit: "Week", phases: [{ title: "Discover", detail: "Learn about the people" }, { title: "Define", detail: "Frame the problem" }, { title: "Develop", detail: "Explore and prototype" }, { title: "Deliver", detail: "Test and refine" }] },
    interviews: { layout: { count: 3 } },
    carousel: { layout: { count: 4 } },
  } as Partial<Record<SectionKind, Partial<Pick<CaseStudySection, "layout" | "prototype" | "phases" | "timeUnit" | "recording">>>>)[kind],
});

export const lucidExample: BuilderStudy = {
  id: "studio-starter",
  slug: "untitled-case-study",
  title: "Your case study title",
  summary: "Explain the problem, the evidence, and what your design changed.",
  client: "Project name",
  role: "Product designer",
  timeframe: "2026",
  accent: "#c8553d",
  sections: [
    { ...createSection("problem"), eyebrow: "01 / Define", variant: "dark" },
    { ...createSection("methods"), eyebrow: "02 / Discover" },
    { ...createSection("metrics"), eyebrow: "03 / Evidence", variant: "dark" },
    { ...createSection("wireframes"), eyebrow: "04 / Develop" },
  ],
};

export function isBuilderStudy(value: unknown): value is BuilderStudy {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BuilderStudy>;
  const kinds = new Set(Object.keys(componentNames));
  const variants = new Set(["light", "dark", "tinted"]);
  return typeof item.id === "string" && typeof item.title === "string" && typeof item.slug === "string" &&
    typeof item.summary === "string" && typeof item.client === "string" && typeof item.role === "string" &&
    typeof item.timeframe === "string" && typeof item.accent === "string" &&
    (item.sources === undefined || (item.sources !== null && typeof item.sources === "object" &&
      (item.sources.figmaUrl === undefined || typeof item.sources.figmaUrl === "string") &&
      (item.sources.notionUrl === undefined || typeof item.sources.notionUrl === "string"))) && Array.isArray(item.sections) &&
    item.sections.every(section => section && typeof section.id === "string" && kinds.has(section.kind) &&
      typeof section.title === "string" && typeof section.body === "string" && typeof section.eyebrow === "string" &&
      variants.has(section.variant) &&
      (section.fit === undefined || ["contain", "cover"].includes(section.fit)) &&
      (section.layout === undefined || (section.layout !== null && typeof section.layout === "object" &&
        (section.layout.count === undefined || (Number.isInteger(section.layout.count) && section.layout.count >= 1 && section.layout.count <= 8)) &&
        (section.layout.columns === undefined || [1, 2, 3].includes(section.layout.columns)) &&
        (section.layout.pattern === undefined || ["even", "bento"].includes(section.layout.pattern)) &&
        (section.layout.gap === undefined || (Number.isFinite(section.layout.gap) && section.layout.gap >= 0 && section.layout.gap <= 48)) &&
        (section.layout.scale === undefined || (Number.isFinite(section.layout.scale) && section.layout.scale >= 65 && section.layout.scale <= 135)) &&
        (section.layout.presentation === undefined || ["images", "phones"].includes(section.layout.presentation)))) &&
      (section.figmaSource === undefined || (section.figmaSource !== null && typeof section.figmaSource === "object" &&
        [section.figmaSource.url, section.figmaSource.fileKey, section.figmaSource.nodeId, section.figmaSource.importedAt].every(value => typeof value === "string") &&
        ["snapshot", "live"].includes(section.figmaSource.mode))) && Array.isArray(section.items) && section.items.every(entry =>
        entry && typeof entry.title === "string" && typeof entry.detail === "string" &&
        (entry.value === undefined || typeof entry.value === "string") && (entry.image === undefined || typeof entry.image === "string") && (entry.frameId === undefined || typeof entry.frameId === "string") &&
        (entry.tileSize === undefined || ["standard", "wide", "large"].includes(entry.tileSize))) &&
      (section.surveySource === undefined || (section.surveySource !== null && typeof section.surveySource === "object" &&
        (section.surveySource.url === undefined || typeof section.surveySource.url === "string") &&
        typeof section.surveySource.updatedAt === "string" && Number.isInteger(section.surveySource.totalResponses) &&
        Array.isArray(section.surveySource.questions) && section.surveySource.questions.every(question =>
          question && typeof question.sourceName === "string" && Number.isInteger(question.columnIndex) &&
          ["bars", "arcs"].includes(question.chart) && typeof question.multiSelect === "boolean" &&
          Number.isInteger(question.answered) && Array.isArray(question.options) && question.options.every(option =>
            option && typeof option.label === "string" && Number.isInteger(option.count))))));
}
