export type SectionKind = "showcase" | "screenFocus" | "screenStory" | "screenStrip" | "affinity" | "aeiou" | "abtest" | "coverHero" | "details" | "rows" | "empathy" | "timeline" | "screenRecording" | "prototype" | "findings" | "interviews" | "carousel" | "wireframes" | "fullMedia" | "survey" | "narrative" | "metrics" | "flow" | "quotes" | "comparison" | "gallery" | "methods" | "columns" | "problem" | "competitors" | "gap" | "persona" | "journey" | "issueFlow" | "annotated";

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
  /** Connected Research survey (live results) and the question ids shown. */
  studyId?: string;
  studyTitle?: string;
  questionIds?: string[];
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
  items: Array<{ title: string; detail: string; value?: string; image?: string; frameId?: string; tileSize?: "standard" | "wide" | "large"; finding?: string; findingNote?: string; quote?: string; quoteNote?: string; when?: string; point?: string; blockType?: "person" | "list" | "text" | "quote" | "day" | "meter" | "photo" | "facts" | "chips"; /** AEIOU category letter. */ cat?: "a" | "e" | "i" | "o" | "u"; /** Coded notes pinned on a photo (0–1 positions). */ pins?: Array<{ x: number; y: number; cat: "a" | "e" | "i" | "o" | "u"; note: string }>; /** Spotlights on a screen (0–1 box) with a note. */ spots?: Array<{ x: number; y: number; w: number; h: number; note: string }>; hidden?: boolean; actions?: string; touchpoints?: string; thoughts?: string; pains?: string; opportunities?: string; owner?: string }>;
  /** Per-section switches, e.g. hideEyebrow, hideTitle, hideBody, portrait. */
  options?: Record<string, string | number | boolean>;
  /** Screen recording settings: video, background, frame, cursor, click moments, crop. */
  recording?: { src: string; background: "accent" | "sunset" | "ocean" | "aurora" | "paper" | "night" | "image" | "none"; bgImage?: string; frame: "none" | "browser" | "mac" | "laptop" | "phone"; padding: number; radius: number; cursor: "halo" | "arrow" | "dot" | "none"; zoom: number; clicks: Array<{ t: number; x: number; y: number; zoom?: number; hold?: number }>; track?: Array<{ t: number; x: number; y: number }>; analyzed?: boolean; loop?: boolean; controls?: boolean; speed?: number; crop?: { x: number; y: number; w: number; h: number } };
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
  /** Keep the section but leave it off the page. */
  hidden?: boolean;
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
  /** A/B test: change boxes, metrics and outcome. */
  abtest?: import("./ABTest").ABTestData;
  /** Affinity diagram: green areas > pink issues > blue clusters > yellow notes. */
  affinity?: import("./AffinityDiagram").AffinityData;
  prototype?: { url: string; device: "phone" | "laptop"; hideUi?: boolean; /* the prototype frame size, so the device screen matches it */ size?: { w: number; h: number }; /** Zoom the embed to crop away Figma's own margin (1 = none). */ zoom?: number };
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
  /** Caption under the hero image (Title reveal header). */
  heroCaption?: string;
  /** Motion level: expressive (default) or calm. */
  motion?: "calm" | "expressive";
  /** Header layout: standard, or full width with the hero image rising over the title. */
  hero?: { style: "standard" | "immersive" | "reveal"; bg: "accent" | "soft" | "paper" | "night" | "image"; bgImage?: string; frame: "none" | "laptop" | "desktop" | "browser" | "phone" };
  /** Brand tokens: colours, fonts, headline weight, corners. */
  brand?: Partial<import("./brand").Brand>;
  sections: CaseStudySection[];
}

export const componentNames: Record<SectionKind, string> = {
  coverHero: "Title reveal hero",
  abtest: "A/B test",
  aeiou: "AEIOU observations",
  affinity: "Affinity diagram",
  showcase: "Component showcase",
  screenFocus: "Focus carousel",
  screenStory: "Screen story",
  screenStrip: "Screen filmstrip",
  details: "Project details",
  empathy: "Empathy map",
  rows: "Labeled rows",
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
  journey: "User journey map",
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
  showcase: "A bento of soft panels, each showing one designed component at its real size. Pull them straight from Figma.",
  screenFocus: "Screens slide past as you scroll; each one comes to the centre big enough to read, with optional spotlights.",
  screenStory: "A big screen stays pinned while short steps scroll beside it and swap what it shows.",
  screenStrip: "One large screen with thumbnails to switch, plus highlight buttons for spotlights.",
  affinity: "Observations that scatter from a pile into clusters as you scroll, under issues and areas of concern.",
  aeiou: "Code observation photos and notes as Activities, Environments, Interactions, Objects and Users; hover a letter to see just those.",
  abtest: "Two versions in one frame, the changes between them, and what happened.",
  empathy: "The user in the centre with what they say, think, do and feel around them.",
  details: "Your role, timeline, team and tools at a glance. Show or hide any detail.",
  screenRecording: "A looping, GIF-like prototype recording that zooms into each tap, on a styled background.",
  timeline: "Week-by-week activities grouped into phases, built from your process log.",
  coverHero: "A big title that holds still while your hero image scrolls up and over it.",
  prototype: "Embed a clickable Figma prototype in a phone or laptop frame.",
  findings: "A numbered list of problems or findings, one idea per row.",
  interviews: "Pick a participant to see their summary, a finding and a quote.",
  carousel: "Large screens in a horizontal scroller with arrows.",
  wireframes: "Import Figma screens into staggered iPhone mockups, then refresh by frame ID.",
  fullMedia: "Show an image or animated GIF edge to edge at its natural proportions.",
  survey: "Live charts from a survey you run in Research, or from Google Forms responses.",
  persona: "A portrait, goals, pain points, and a day-in-the-life timeline.",
  journey: "Stages as columns with actions, thoughts, an emotion curve, pain points and opportunities. Pick which rows to show.",
  issueFlow: "Trace task steps and color-code the issues found in research.",
  annotated: "Explain one designed screen with numbered callouts.",
  methods: "A clear research intention with the methods behind it.", columns: "Icon-led columns for findings, principles, or opportunities.", rows: "Numbered rows with a label and a statement — a clean layout for any list.", problem: "Frame who needs help, the barrier, and the desired change.", competitors: "Compare competitors across six editable criteria.", gap: "Connect existing approaches to an unmet need.",
  narrative: "A focused, readable passage with a strong visual pause.",
  metrics: "Animated figures with the context behind each number.",
  flow: "A step-by-step sequence that draws itself as you scroll.",
  quotes: "Human evidence, surfaced as an editorial quote system.",
  comparison: "Show the shift from the initial assumption to the outcome.",
  gallery: "A restrained frame for mockups, artifacts, and prototypes.",
};

export const navDefaults: Record<SectionKind, string> = {
  showcase: "Components", screenFocus: "Screens", screenStory: "Walkthrough", screenStrip: "Screens", affinity: "Affinity", aeiou: "Observations", abtest: "A/B test", coverHero: "Overview", details: "Overview", empathy: "Empathy map", rows: "Details", timeline: "Timeline", screenRecording: "Demo", prototype: "Prototype", findings: "Findings", interviews: "Interviews", carousel: "Explorations",
  wireframes: "Wireframes", fullMedia: "Visuals", survey: "Survey", persona: "Persona", journey: "Journey", issueFlow: "Task analysis",
  annotated: "The design", methods: "Research", columns: "Highlights", problem: "The problem", competitors: "Competitors", gap: "The gap",
  narrative: "Context", metrics: "By the numbers", flow: "Process", quotes: "What we heard", comparison: "Before & after", gallery: "Gallery",
};
export const navLabelFor = (section: Pick<CaseStudySection, "kind" | "navLabel">) => section.navLabel?.trim() || navDefaults[section.kind];
/** A section label turned into a short menu name: drops numbering like "02 / " and tidies case. */
export const labelFromEyebrow = (eyebrow: string) => { const t = eyebrow.replace(/^\s*\d+\s*[\/·.\-–—:]\s*/, '').trim(); return t && t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t; };

export const createSection = (kind: SectionKind): CaseStudySection => ({
  id: crypto.randomUUID(),
  kind,
  eyebrow: componentNames[kind],
  title: {
    coverHero: "Making access feel obvious, not accidental.",
    timeline: "How the work unfolded",
    details: "Project overview",
    empathy: "Inside their head",
    abtest: "What changed, and what it did",
    aeiou: "What we observed",
    affinity: "What the notes added up to",
    showcase: "Components I designed",
    screenFocus: "The final screens, up close",
    screenStory: "How it works, step by step",
    screenStrip: "The final screens",
    rows: "The essentials",
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
    affinity: [],
    showcase: [{ title: "Task details", detail: "", image: "", tileSize: "standard" }, { title: "Filter menu", detail: "", image: "", tileSize: "standard" }, { title: "Calendar view", detail: "", image: "", tileSize: "wide" }],
    screenFocus: [{ title: "Find a class", detail: "Times are visible right on the schedule.", image: "", spots: [] }, { title: "Pick a time", detail: "Open spots show before you commit.", image: "", spots: [{ x: .08, y: .44, w: .84, h: .14, note: "Spots left are shown on every time, so nobody finds out at checkout." }] }, { title: "Confirm", detail: "One tap, with the pass applied automatically.", image: "", spots: [] }, { title: "You’re in", detail: "Added to your calendar with directions.", image: "", spots: [] }],
    screenStory: [{ title: "Find a class", detail: "Times are visible right on the schedule.", image: "", spots: [] }, { title: "Pick a time", detail: "Open spots show before you commit.", image: "", spots: [{ x: .08, y: .44, w: .84, h: .14, note: "Spots left are shown on every time, so nobody finds out at checkout." }] }, { title: "Confirm", detail: "One tap, with the pass applied automatically.", image: "", spots: [] }, { title: "You’re in", detail: "Added to your calendar with directions.", image: "", spots: [] }],
    screenStrip: [{ title: "Find a class", detail: "Times are visible right on the schedule.", image: "", spots: [] }, { title: "Pick a time", detail: "Open spots show before you commit.", image: "", spots: [{ x: .08, y: .44, w: .84, h: .14, note: "Spots left are shown on every time, so nobody finds out at checkout." }] }, { title: "Confirm", detail: "One tap, with the pass applied automatically.", image: "", spots: [] }, { title: "You’re in", detail: "Added to your calendar with directions.", image: "", spots: [] }],
    aeiou: [
      { title: "Activities", value: "Goal-directed actions. What pathways do people take to get things done?", detail: "People plan around the class, not the studio: booking happens in stolen minutes between other tasks." },
      { title: "Environments", value: "The whole arena: atmosphere, function, individual and shared spaces.", detail: "The lobby doubles as a waiting room and a checkout, so the 6 pm rush feels chaotic." },
      { title: "Interactions", value: "Between people, and between people and things. Routine or special?", detail: "Staff repeat the same pass explanation to almost every new member." },
      { title: "Objects", value: "The building blocks of the space, sometimes put to unintended uses.", detail: "A paper sign-up sheet works as the real waitlist, outside the app." },
      { title: "Users", value: "Who is present? Their roles, relationships, values and biases.", detail: "Shift workers book last-minute and value certainty over price." },
      { title: "Front desk, 6:05 pm", detail: "", image: "", cat: "e", blockType: "photo", pins: [{ x: .3, y: .38, cat: "o", note: "Paper waitlist taped to the counter" }, { x: .66, y: .55, cat: "i", note: "Staff explain the class pass, again" }, { x: .5, y: .78, cat: "u", note: "Three people waiting, all on phones" }] },
      { title: "Lobby, Tuesday", detail: "Checks the schedule on her phone while standing in line", cat: "a", blockType: "text" },
      { title: "Interview, P3", detail: "“I only find out it's full after I've already driven here.”", cat: "u", blockType: "text" },
      { title: "Front desk", detail: "Asks a friend to hold a spot by writing both names on the sheet", cat: "i", blockType: "text" },
      { title: "Lobby", detail: "No seating, so people lean on the merch shelf while waiting", cat: "e", blockType: "text" },
      { title: "Changing room", detail: "Phone propped on a water bottle to show the class QR code", cat: "o", blockType: "text" },
    ],
    abtest: [{ title: "A · Original", detail: "The current checkout", image: "" }, { title: "B · New design", detail: "Times shown up front", image: "" }],
    empathy: [
      { title: "Maya, new member", detail: "Busy nurse, books on her phone", image: "" },
      { title: "Says", value: "says", detail: "“I just need to know what's open.”\n“I'll book later.”" },
      { title: "Thinks", value: "thinks", detail: "Is this worth the money?\nI'll never find a time that works." },
      { title: "Does", value: "does", detail: "Scrolls the schedule at lunch\nGives up at checkout" },
      { title: "Feels", value: "feels", detail: "Rushed\nUnsure the plan fits her life" },
      { title: "Pains", detail: "Availability hidden until checkout\nNo way to filter by time", hidden: false },
      { title: "Gains", detail: "A class that fits her shift\nBooking in under a minute", hidden: false },
    ],
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
    persona: [
      { blockType: "person", title: "Maya Lopez", detail: "ER nurse who books classes between twelve-hour shifts.", value: "Planner, Night owl, Loyal", image: "" },
      { blockType: "facts", title: "Details", detail: "Age: 31\nLocation: Denver\nOccupation: ER nurse\nSchedule: Rotating shifts\nTech comfort: High" },
      { blockType: "quote", title: "In her words", detail: "If I can't see the time before I pay, I just close the app." },
      { blockType: "text", title: "Bio", detail: "Maya joined the studio to keep a routine through a rotating schedule. She books on her phone in short breaks and plans her week every Sunday." },
      { blockType: "list", title: "Core needs", detail: "See open times before committing\nRebook a favourite class in one tap\nKnow when a spot opens up" },
      { blockType: "list", title: "Frustrations", detail: "Availability hidden until checkout\nClasses fill while she's mid-shift\nNo way to filter by time" },
      { blockType: "chips", title: "Apps she lives in", detail: "Instagram\nGoogle Calendar\nSpotify\nMindbody" },
      { blockType: "chips", title: "Devices", detail: "iPhone\nApple Watch" },
    ],
    journey: [
      { title: "Discover", value: "55", detail: "Curious", actions: "Sees an ad\nOpens the app", touchpoints: "Instagram\nApp Store", thoughts: "Could this fit my week?", pains: "Unclear what's included", opportunities: "Show classes before sign-up", owner: "Marketing" },
      { title: "Sign up", value: "68", detail: "Hopeful", actions: "Creates an account\nPicks interests", touchpoints: "Onboarding", thoughts: "Nice, that was quick.", pains: "", opportunities: "Remember preferences", owner: "Product" },
      { title: "Book", value: "22", detail: "Frustrated", actions: "Searches classes\nTries to filter by time", touchpoints: "Schedule\nCheckout", thoughts: "Why can't I see availability?", pains: "Availability hidden until checkout\nNo time filter", opportunities: "Show open spots up front\nAdd a time filter", owner: "Product" },
      { title: "Attend", value: "62", detail: "Relieved", actions: "Gets reminder\nChecks in", touchpoints: "Push notification\nFront desk", thoughts: "That worked out.", pains: "Reminder came late", opportunities: "Reminder an hour before", owner: "Operations" },
      { title: "Return", value: "82", detail: "Confident", actions: "Rebooks the same class", touchpoints: "App", thoughts: "This is my routine now.", pains: "", opportunities: "One-tap rebook", owner: "Product" },
    ],
    issueFlow: ["Open entry point", "Ask a question", "Review answer", "Copy the result"].map((title, index) => ({ title, detail: ["Wrong selection", "Premature action", "Missed indicator", "Recall failure"][index], value: ["S", "A", "C", "R"][index] })),
    annotated: [{ title: "Designed screen", detail: "Upload a screen or paste its image URL.", image: "" }, ...["Menu", "Offers", "Subscription", "Notifications", "Profile", "Navigation"].map(title => ({ title, detail: "Explain the design decision here." }))],
    methods: [{title: "Interviews", detail: "Understand motivations and unmet needs."}, {title: "Think-aloud testing", detail: "Observe behavior in the real flow."}, {title: "Task analysis", detail: "Find moments of friction."}],
    columns: Array.from({length: 3}, (_, i) => ({title: `Finding ${i + 1}`, detail: "Add an observation and explain why it matters.", value: "Evidence or measurement"})),
    problem: [{ title: "Who", detail: "New members" }, { title: "need a way to", detail: "find a class that fits their schedule" }, { title: "because", detail: "the booking flow hides availability until checkout" }, { title: "How might we", detail: "show what's open before people commit?" }, { title: "We'll know it worked when", detail: "first-week bookings go up", hidden: true }],
    rows: [{title: "Who", detail: "Describe the people affected."}, {title: "Needs", detail: "What are they trying to accomplish?"}, {title: "Because", detail: "What evidence explains the barrier?"}],
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
    affinity: { affinity: { groups: [{ title: "Organizing my information", issues: [{ title: "Show me what I have to do", aspects: [{ title: "I want it printed in front of me", notes: ["Transfers meetings from email to a wall calendar", "Likes getting tasks by email rather than a call, so she can print them"] }, { title: "Daily to-do lists help me track progress", notes: ["Crosses items off a paper list through the day", "Rewrites tomorrow’s list every evening before leaving"] }] }, { title: "Keep me focused", aspects: [{ title: "Don’t interrupt me with non-critical stuff", notes: ["Mutes chat during deep work", "Lets calls go to voicemail before noon", "“If it’s urgent they’ll walk over.”"] }, { title: "Let me batch the small things", notes: ["Answers email twice a day", "Keeps a sticky of quick tasks for after lunch"] }] }] }], unsorted: [] } },
    abtest: { abtest: { mode: "wipe" as const, showMarkers: true, result: "b" as const, method: "Split test · 2 weeks · 4,212 sessions · 95% confidence", markers: [], metrics: [{ label: "Booking completion", kind: "rate" as const, a: "31", b: "44", better: "higher" as const }, { label: "Time to book", kind: "number" as const, a: "42", b: "18", unit: "s", better: "lower" as const }] } },
    findings: { layout: { count: 4 } },
    screenRecording: { recording: { src: "", background: "accent" as const, frame: "browser" as const, padding: 64, radius: 14, cursor: "halo" as const, zoom: 1.8, clicks: [], loop: true, controls: false, speed: 1 } },
    timeline: { timeUnit: "Week", phases: [{ title: "Discover", detail: "Learn about the people" }, { title: "Define", detail: "Frame the problem" }, { title: "Develop", detail: "Explore and prototype" }, { title: "Deliver", detail: "Test and refine" }] },
    interviews: { layout: { count: 3 } },
    carousel: { layout: { count: 4 } },
  } as Partial<Record<SectionKind, Partial<Pick<CaseStudySection, "affinity" | "abtest" | "layout" | "prototype" | "phases" | "timeUnit" | "recording">>>>)[kind],
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

/** One opening per case study: a Title reveal hero added as the first section becomes the header. */
export function migrateStudy(study: BuilderStudy): BuilderStudy {
  const first = study.sections[0];
  if (!first || first.kind !== "coverHero") return study;
  const media = first.items[0];
  return {
    ...study,
    client: first.eyebrow || study.client,
    title: first.title || study.title,
    summary: first.body || study.summary,
    heroImage: media?.image || study.heroImage,
    heroCaption: media?.detail || study.heroCaption,
    hero: { bg: "accent", ...study.hero, style: "reveal", frame: (first.options?.frame as NonNullable<BuilderStudy["hero"]>["frame"]) ?? study.hero?.frame ?? "none" },
    sections: study.sections.slice(1),
  };
}

/** Which intro parts are hidden for a section (explicit options win; some layouts hide parts by default). */
export function introHidden(section: Pick<CaseStudySection, "kind" | "options">) {
  const o = section.options ?? {};
  const statement = section.kind === "problem" && o.layout !== "rows";
  const pick = (key: string, fallback: boolean) => o[key] === undefined ? fallback : !!o[key];
  return { eyebrow: pick("hideEyebrow", false), title: pick("hideTitle", statement), body: pick("hideBody", statement) };
}
