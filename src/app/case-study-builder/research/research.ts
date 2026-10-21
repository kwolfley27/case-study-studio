import { authHeaders } from '../auth';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

/* Your own research tool: studies, questions, scoring and the server calls. */

export type QuestionType = 'single' | 'multi' | 'scale' | 'nps' | 'text' | 'long' | 'contact' | 'schedule' | 'photo' | 'rank';
export type ContactKey = 'name' | 'email' | 'phone';
export type FieldMode = 'off' | 'optional' | 'required';
/** Show a question only when an earlier choice question was answered with one of these options. */
export type ShowIf = { questionId: string; anyOf: string[] };
export type Question = { id: string; type: QuestionType; prompt: string; options?: string[]; min?: number; max?: number; minLabel?: string; maxLabel?: string; required?: boolean; preset?: string;
  /** Contact info: which fields to ask for. */ contact?: Partial<Record<ContactKey, FieldMode>>;
  /** Book a time: a Calendly (or other scheduling) link. */ url?: string;
  showIf?: ShowIf;
  /** Smaller, lighter text under the question (e.g. examples). */ hint?: string;
  /** How many AI follow-up questions to ask (0–3), and what they should dig into. */ followups?: number; probe?: string;
  /** Choice questions: only follow up when one of these was picked (empty = any answer). */ followIf?: string[];
  /** Choice questions: use the answers as groups (buckets) to compare in Results. */ group?: boolean;
  /** A picture shown above the question. */ image?: string;
  /** Pictures for each choice option (same order as options); shows the options as picture cards. */ optionImages?: string[] };
/** How the participant pages look. */
export type Theme = { accent?: string; background?: string; cover?: string };
export const ACCENTS = ['#000000', '#2f5b45', '#1f4ea3', '#6b3fa0', '#c2410c', '#be185d', '#0f766e'];
export const BACKGROUNDS = ['#fdfcfc', '#f6f1e9', '#eef3ef', '#eef2f8', '#f6eef4'];
/** A readable text colour on top of the accent. */
export const onColor = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return '#fff'; const n = parseInt(m[1], 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#000' : '#fff'; };
/** The question's main line and its smaller helper line. A trailing "(For example, …)" in the question counts as helper text. */
export function splitPrompt(q: Pick<Question, 'prompt' | 'hint'>): { title: string; sub: string } {
  const own = (q.hint ?? '').trim();
  const m = /^([\s\S]*?[?.!:])\s*\(([^()]{6,})\)\s*$/.exec(q.prompt ?? '');
  if (m && m[1].length > 8) return { title: m[1], sub: own || m[2].trim() };
  return { title: q.prompt, sub: own };
}
export const duplicateQuestion = (q: Question): Question => ({ ...structuredClone(q), id: qid(), preset: q.preset?.startsWith('sus-') || q.preset === 'nps' ? undefined : q.preset === 'recruit' || q.preset === 'name' ? undefined : q.preset });
export type Answer = string | number | string[] | Partial<Record<ContactKey, string>>;
export type Task = { id: string; title: string; scenario?: string; success?: string };
export type Outcome = 'success' | 'help' | 'fail' | 'skipped';
export type TaskRecord = { taskId: string; status: Outcome; ms: number; notes?: string; tags?: string[] };
export type Session = { id: string; at: string; participant: string; durationMs: number; audioPath?: string; audioUrl?: string; notes?: string; tasks: TaskRecord[]; transcript?: Transcript; notionPageId?: string };
export type TranscriptLine = { s: number; e: number; spk: number; text: string };
export type Transcript = { at: string; speakers: string[]; segments: TranscriptLine[] };
export type Study = { id: string; kind: 'survey' | 'usability'; theme?: Theme; /** What you want to learn. Private; guides the AI follow-ups. */ goal?: string; /** Most AI follow-ups one participant gets in total (default 6). */ followupBudget?: number; /** 'interview': a usability-style session where each step is a question you ask, not a task. */ format?: 'interview'; tasks?: Task[]; title: string; /** The case study this research belongs to. */ projectId?: string; projectTitle?: string; intro?: string; thanks?: string; status: 'open' | 'closed'; questions: Question[]; notion?: { pageUrl?: string; databaseId?: string; error?: string }; createdAt?: string; updatedAt?: string; responses?: number; published?: boolean };
/** An AI follow-up the participant was asked, and their answer. */
export type FollowUp = { q: string; a: string };
export type Response = { id: string; at: string; ms: number; answers: Record<string, Answer>; followups?: Record<string, FollowUp[]>; /** Signed links to uploaded photos, by question (added when results load). */ photoUrls?: Record<string, string[]> };
export const canFollowUp = (q: Question) => q.type === 'long' || q.type === 'text' || q.type === 'single' || q.type === 'multi' || q.type === 'rank';
export const hasOptions = (q: Question) => q.type === 'single' || q.type === 'multi' || q.type === 'rank';
/** How an answer reads in plain words (rankings are numbered). */
export const answerWords = (v: unknown, q?: Question) => Array.isArray(v) ? (q?.type === 'rank' ? v.map((x, i) => `${i + 1}. ${x}`).join(', ') : v.join(', ')) : v != null && typeof v !== 'object' ? String(v) : '';
export const isChoice = (q: Question) => q.type === 'single' || q.type === 'multi';
export const DEFAULT_FOLLOWUP_BUDGET = 6;
/** Does this answer earn a follow-up? Choice questions can be limited to certain answers. */
export function wantsFollowUp(q: Question, v: unknown) {
  if (!canFollowUp(q) || !(q.followups && q.followups > 0)) return false;
  if (isChoice(q) && q.followIf?.length) return (Array.isArray(v) ? v : [v]).some(x => q.followIf!.includes(String(x)));
  return true;
}

/* ---------- Question checker: the mistakes experienced researchers avoid ---------- */
export type Lint = { level: 'warn' | 'tip'; text: string };
export function lintQuestion(q: Question): Lint[] {
  if (q.preset || !['single', 'multi', 'text', 'long', 'scale'].includes(q.type)) return [];
  const p = (q.prompt || '').trim(); const low = p.toLowerCase(); const out: Lint[] = [];
  const open = q.type === 'long' || q.type === 'text';
  const story = /^(tell me|walk me|describe|talk me|think about|picture)\b/i.test(p); // a story prompt with supporting cues is fine
  const marks = (p.match(/\?/g) || []).length;
  if (/\b(how much would you pay|would you pay|would you (use|buy|try|want|like)|will you|if there (was|were)|would it help|would you be (interested|likely))\b/.test(low))
    out.push({ level: 'warn', text: 'Asks people to predict the future. People are bad at that. Ask about something they already did: “Tell me about the last time you…”' });
  if (/\b(don’t|don't|doesn’t|doesn't|isn’t|isn't|wouldn’t|wouldn't) you\b|\bhow (great|easy|helpful|useful|much do you (love|like))\b|\b(agree|frustrating|annoying|love)\b.*\?/.test(low) && !/tell me|walk me/.test(low))
    out.push({ level: 'warn', text: 'May lead people toward an answer. Keep the wording neutral, e.g. “How do you feel about…” or “What was that like?”' });
  if (!story && (marks > 1 || /\?\s*\S.*\b(and|or) (what|how|why|when|where|who)\b/i.test(p) || /\b(and|or) (what|how|why|when|where|who)\b[^?]*\?$/i.test(p) && p.split(/\b(?:and|or) (?:what|how|why|when|where|who)\b/i)[0].length > 25))
    out.push({ level: 'tip', text: 'Two questions in one. People tend to answer only one. Consider splitting it, or let an AI follow-up ask the second part.' });
  if (open && marks <= 1 && /^(do|does|did|are|is|was|were|have|has|can|could|would|will|should)\b/i.test(p))
    out.push({ level: 'tip', text: 'Yes/no wording: people may answer in one word. Try “Tell me about…” or “Walk me through…”.' });
  if (open && /\b(usually|typically|normally|in general|generally)\b/i.test(p) && !/\blast time\b/i.test(p))
    out.push({ level: 'tip', text: 'Asks for an average, which people tend to idealise. Anchor it to a real moment: “the last time you…”.' });
  if (open && /^why\b/i.test(p))
    out.push({ level: 'tip', text: '“Why” can feel like being put on the spot. “What made you…” or “What led to…” usually gets a fuller story.' });
  return out;
}

/** A realistic time estimate for one person: open answers by voice take a minute or two; questions behind "Show only if"
    usually apply to only some people; optional ones are often skipped; follow-ups are capped by the per-person limit and the AI often stops early. */
export function estimateMinutes(qs: Question[], followupBudget = DEFAULT_FOLLOWUP_BUDGET) {
  let min = 0, fuSlots = 0;
  // Questions that branch off the same answer are alternatives: count the branch group once (its longest question).
  const branches = new Map<string, number>();
  for (const q of qs) {
    let m = q.type === 'long' ? 1.5 : q.type === 'text' ? 0.4 : q.type === 'photo' ? 0.8 : q.type === 'rank' ? 0.4 : q.type === 'contact' || q.type === 'schedule' ? 0.5 : 0.2;
    if (!q.required && (q.type === 'long' || q.type === 'photo')) m *= 0.5;
    if (q.followups) fuSlots += Math.min(3, q.followups);
    if (q.showIf?.questionId) { const k = q.showIf.questionId; branches.set(k, Math.max(branches.get(k) ?? 0, m)); continue; }
    min += m;
  }
  for (const m of branches.values()) min += m;
  min += Math.min(fuSlots, followupBudget) * 0.8 * 0.6;
  return Math.max(1, Math.round(min));
}

export const QUESTION_TYPES: Array<[QuestionType, string, string]> = [
  ['single', 'One choice', 'Pick one option'],
  ['multi', 'Checkboxes', 'Pick any that apply'],
  ['rank', 'Rank', 'Put options in order, best first'],
  ['scale', 'Scale', 'Rate from 1 to 5 (or 7)'],
  ['nps', 'NPS 0–10', 'How likely to recommend'],
  ['text', 'Short answer', 'A few words'],
  ['long', 'Long answer', 'A paragraph'],
  ['contact', 'Contact info', 'Name, email, phone'],
  ['schedule', 'Book a time', 'Calendly or other booking link'],
  ['photo', 'Show me (photo)', 'Upload a screenshot or photo'],
];

export const CONTACT_FIELDS: Array<[ContactKey, string]> = [['name', 'Name'], ['email', 'Email'], ['phone', 'Phone']];
export const DEFAULT_CONTACT: Record<ContactKey, FieldMode> = { name: 'required', email: 'required', phone: 'off' };
export const contactModes = (q: Question): Record<ContactKey, FieldMode> => ({ ...DEFAULT_CONTACT, ...(q.contact ?? {}) });
export const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const validPhone = (v: string) => v.replace(/\D/g, '').length >= 7;
/** Problems with a contact answer, by field. Empty when it's fine to continue. */
export function contactErrors(q: Question, v: unknown): Partial<Record<ContactKey, string>> {
  const a = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Partial<Record<ContactKey, string>>; const m = contactModes(q); const out: Partial<Record<ContactKey, string>> = {};
  for (const [k, label] of CONTACT_FIELDS) {
    const val = (a[k] ?? '').trim(); if (m[k] === 'off') continue;
    if (!val) { if (m[k] === 'required') out[k] = `${label} is required`; continue; }
    if (k === 'email' && !validEmail(val)) out[k] = 'Check the email address';
    if (k === 'phone' && !validPhone(val)) out[k] = 'Check the phone number';
  }
  return out;
}
/** Whether a question should be shown, given the answers so far. */
export const isShown = (q: Question, answers: Record<string, unknown>) => {
  if (!q.showIf?.questionId || !q.showIf.anyOf?.length) return true;
  const v = answers[q.showIf.questionId];
  return (Array.isArray(v) ? v : [v]).some(x => q.showIf!.anyOf.includes(String(x)));
};
/** Calendly can be embedded inline; other booking links open in a new tab. */
export const isCalendly = (url?: string) => { try { return !!url && /(^|\.)calendly\.com$/.test(new URL(url).hostname); } catch { return false; } };
export function bookingUrl(url: string, contact?: Partial<Record<ContactKey, string>>, embed = false) {
  try {
    const u = new URL(url);
    if (isCalendly(url)) {
      if (contact?.name) u.searchParams.set('name', contact.name);
      if (contact?.email) u.searchParams.set('email', contact.email);
      if (embed) { u.searchParams.set('embed_domain', location.hostname); u.searchParams.set('embed_type', 'Inline'); u.searchParams.set('hide_gdpr_banner', '1'); }
    }
    return u.toString();
  } catch { return url; }
}
export const BOOKED = 'Booked a time', OPENED = 'Opened the booking link';

const qid = () => crypto.randomUUID().slice(0, 8);
export const newQuestion = (type: QuestionType): Question => ({
  id: qid(), type, required: type !== 'long' && type !== 'text' && type !== 'schedule' && type !== 'photo',
  prompt: { single: 'Which best describes you?', multi: 'Which of these do you use?', scale: 'How easy was it to book a class?', nps: 'How likely are you to recommend this to a friend?', text: 'In a few words, what was hardest?', rank: 'Rank these from best to worst.', long: 'Tell us about the last time you booked a class.', contact: 'How can we reach you?', schedule: 'Pick a time for a 25–30 minute chat', photo: 'Show us: add a screenshot or photo of your last grocery list.' }[type],
  ...(type === 'contact' ? { contact: { ...DEFAULT_CONTACT } } : {}),
  ...(type === 'schedule' ? { url: '' } : {}),
  ...(type === 'single' || type === 'multi' || type === 'rank' ? { options: ['Option one', 'Option two', 'Option three'] } : {}),
  ...(type === 'scale' ? { min: 1, max: 5, minLabel: 'Very hard', maxLabel: 'Very easy' } : {}),
});

/* System Usability Scale: the standard 10 statements, 1 = strongly disagree … 5 = strongly agree. */
export const SUS_ITEMS = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need the support of a technical person to be able to use this system.',
  'I found the various functions in this system were well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
];
export const susQuestions = (): Question[] => SUS_ITEMS.map((prompt, i) => ({ id: qid(), type: 'scale', prompt, min: 1, max: 5, minLabel: 'Strongly disagree', maxLabel: 'Strongly agree', required: true, preset: `sus-${i + 1}` }));
export const npsQuestion = (): Question => ({ ...newQuestion('nps'), preset: 'nps' });

/* About you: who they are, sorted into groups you can compare in Results. Name is first name + last initial only. */
export const AGE_RANGES = ['18–24', '25–34', '35–44', '45–54', '55+'];
export const PREP_OPTIONS = ['Most weeks', 'Sometimes', 'Rarely or never'];
export const LIFESTYLE_OPTIONS = ['Student', 'Work full-time', 'Parent or caregiver', 'Go to the gym regularly', 'Run or train for races', 'Play a sport', 'None of these'];
export function aboutYouQuestions(): Question[] {
  return [
    { id: qid(), type: 'text', preset: 'name', required: true, prompt: 'What’s your first name and last initial?', hint: 'For example, Sam L. Just so we can tell answers apart; it isn’t shared.' },
    { id: qid(), type: 'single', preset: 'about', required: true, group: true, prompt: 'What’s your age range?', options: [...AGE_RANGES] },
    { id: qid(), type: 'single', preset: 'about', required: true, group: true, prompt: 'How often do you meal prep?', hint: 'Making meals or ingredients ahead of time to eat later in the week.', options: [...PREP_OPTIONS], followups: 1, followIf: ['Rarely or never'], probe: 'If they rarely or never meal prep, ask what gets in the way, or whether they have tried and what happened.' },
    { id: qid(), type: 'multi', preset: 'about', required: true, group: true, prompt: 'Which of these describe you right now?', options: [...LIFESTYLE_OPTIONS], followups: 1, followIf: ['Go to the gym regularly', 'Run or train for races', 'Play a sport'], probe: 'For people who train: ask how their training shapes what and when they eat, or how food planning fits around training.' },
  ];
}
/** The participant's display name (first name + last initial), if the study asks for it. Never sent to AI or added to a case study. */
export const participantName = (study: Study, r: { answers: Record<string, unknown> }) => { const q = study.questions.find(x => x.preset === 'name'); const v = q ? r.answers[q.id] : ''; return typeof v === 'string' ? v.trim().slice(0, 40) : ''; };
export const groupQuestions = (study: Study) => study.questions.filter(q => q.group && (q.type === 'single' || q.type === 'multi'));
/** A short anonymous description from someone's groups, e.g. "Most weeks · Runner". */
export const groupLabel = (study: Study, r: { answers: Record<string, unknown> }) => groupQuestions(study).filter(q => !AGE_RANGES.some(a => q.options?.includes(a))).map(q => { const v = r.answers[q.id]; return Array.isArray(v) ? v.filter(x => x !== 'None of these').join(', ') : v ? String(v) : ''; }).filter(Boolean).join(' · ');
const matchesValue = (v: unknown, option: string) => Array.isArray(v) ? v.includes(option) : v === option;
/** Keep only responses in the chosen buckets (questionId → option). */
export const filterByGroups = <R extends { answers: Record<string, unknown> }>(responses: R[], picks: Record<string, string>) => responses.filter(r => Object.entries(picks).every(([qid, opt]) => matchesValue(r.answers[qid], opt)));
export const bucketCount = (responses: Array<{ answers: Record<string, unknown> }>, qid: string, option: string) => responses.filter(r => matchesValue(r.answers[qid], option)).length;

/* Recruit for interviews: "Would you be open to a follow-up?" → contact info → book a time, only for Yes / Maybe. */
export const INTEREST_OPTIONS = ['Yes', 'Maybe, if there’s a time that works', 'No thanks'];
export function recruitQuestions(): Question[] {
  const ask: Question = { id: qid(), type: 'single', preset: 'recruit', required: true, prompt: 'Would you be open to a 25–30 minute follow-up interview?', options: [...INTEREST_OPTIONS] };
  const showIf = { questionId: ask.id, anyOf: INTEREST_OPTIONS.slice(0, 2) };
  return [ask,
    { ...newQuestion('contact'), prompt: 'Great! How can we reach you?', showIf },
    { ...newQuestion('schedule'), prompt: 'Want to pick a time now?', showIf }];
}

export const newStudy = (project?: { id: string; title: string }): Study => ({ id: crypto.randomUUID(), kind: 'survey', title: 'Untitled survey', projectId: project?.id, projectTitle: project?.title, intro: 'Thanks for helping! This takes about 3 minutes. There are no right or wrong answers.', thanks: 'Thank you — your answers really help.', status: 'open', questions: [newQuestion('single'), newQuestion('scale'), newQuestion('text')], published: false });

/* ---------- Scoring ---------- */
export type QuestionResult =
  | { q: Question; kind: 'choice'; answered: number; options: Array<{ label: string; count: number }> }
  | { q: Question; kind: 'scale'; answered: number; mean: number; dist: number[] }
  | { q: Question; kind: 'nps'; answered: number; score: number; promoters: number; passives: number; detractors: number }
  | { q: Question; kind: 'text'; answered: number; answers: string[] }
  | { q: Question; kind: 'contact'; answered: number }
  | { q: Question; kind: 'schedule'; answered: number; booked: number }
  | { q: Question; kind: 'photo'; answered: number }
  | { q: Question; kind: 'rank'; answered: number; items: Array<{ label: string; avg: number; firsts: number }> };

export function aggregate(study: Study, responses: Response[]): QuestionResult[] {
  return study.questions.map(q => {
    const vals = responses.map(r => r.answers[q.id]).filter(v => v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some(Boolean)));
    if (q.type === 'single' || q.type === 'multi') {
      const counts = new Map((q.options ?? []).map(o => [o, 0]));
      for (const v of vals) for (const x of (Array.isArray(v) ? v : [v])) counts.set(String(x), (counts.get(String(x)) ?? 0) + 1);
      return { q, kind: 'choice', answered: vals.length, options: [...counts].map(([label, count]) => ({ label, count })) };
    }
    if (q.type === 'scale') {
      const lo = q.min ?? 1, hi = q.max ?? 5; const dist = Array.from({ length: hi - lo + 1 }, () => 0);
      let sum = 0; for (const v of vals) { const n = Number(v); dist[n - lo]++; sum += n; }
      return { q, kind: 'scale', answered: vals.length, mean: vals.length ? sum / vals.length : 0, dist };
    }
    if (q.type === 'nps') {
      let p = 0, pa = 0, d = 0; for (const v of vals) { const n = Number(v); if (n >= 9) p++; else if (n >= 7) pa++; else d++; }
      const t = Math.max(1, vals.length);
      return { q, kind: 'nps', answered: vals.length, score: Math.round(((p - d) / t) * 100), promoters: p, passives: pa, detractors: d };
    }
    if (q.type === 'contact') return { q, kind: 'contact', answered: vals.length };
    if (q.type === 'photo') return { q, kind: 'photo', answered: vals.length };
    if (q.type === 'rank') {
      const items = (q.options ?? []).map(label => { const pos = vals.map(v => (v as string[]).indexOf(label)).filter(i => i >= 0); return { label, avg: pos.length ? pos.reduce((a, b) => a + b + 1, 0) / pos.length : 0, firsts: pos.filter(i => i === 0).length }; });
      return { q, kind: 'rank', answered: vals.length, items: items.sort((a, b) => (a.avg || 99) - (b.avg || 99) || b.firsts - a.firsts) };
    }
    if (q.type === 'schedule') return { q, kind: 'schedule', answered: vals.length, booked: vals.filter(v => v === BOOKED).length };
    return { q, kind: 'text', answered: vals.length, answers: vals.map(String) };
  });
}

/** SUS score (0–100) if the study has all 10 SUS items. */
export function susScore(study: Study, responses: Response[]): { score: number; n: number; grade: string } | null {
  const items = Array.from({ length: 10 }, (_, i) => study.questions.find(q => q.preset === `sus-${i + 1}`));
  if (items.some(q => !q)) return null;
  const scores = responses.map(r => { let sum = 0; for (let i = 0; i < 10; i++) { const v = Number(r.answers[items[i]!.id]); if (!v) return null; sum += i % 2 === 0 ? v - 1 : 5 - v; } return sum * 2.5; }).filter((x): x is number => x != null);
  if (!scores.length) return { score: 0, n: 0, grade: '' };
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  const grade = score >= 85 ? 'Excellent' : score >= 72 ? 'Good' : score >= 68 ? 'Above average' : score >= 51 ? 'OK' : 'Poor';
  return { score: Math.round(score * 10) / 10, n: scores.length, grade };
}

/** Turn choice and scale results into the survey chart component's data. */
export function toSurveyQuestions(results: QuestionResult[], ids?: string[]) {
  const usable = results.filter(r => (r.kind === 'choice' || (r.kind === 'scale' && !r.q.preset)) && r.answered > 0 && (!ids || ids.includes(r.q.id)));
  return usable.map((r, i) => r.kind === 'choice'
    ? { sourceName: r.q.prompt, columnIndex: i, chart: 'bars' as const, multiSelect: r.q.type === 'multi', answered: r.answered, options: [...r.options].sort((a, b) => b.count - a.count) }
    : r.kind === 'scale' ? { sourceName: r.q.prompt, columnIndex: i, chart: 'bars' as const, multiSelect: false, answered: r.answered, options: r.dist.map((count, k) => ({ label: `${(r.q.min ?? 1) + k}${k === 0 && r.q.minLabel ? ` · ${r.q.minLabel}` : k === r.dist.length - 1 && r.q.maxLabel ? ` · ${r.q.maxLabel}` : ''}`, count })) } : null).filter((q): q is NonNullable<typeof q> => !!q);
}
export const chartable = (results: QuestionResult[]) => results.filter(r => (r.kind === 'choice' || (r.kind === 'scale' && !r.q.preset)));

/* ---------- Server ---------- */
export const RESEARCH_URL = import.meta.env.VITE_STUDIO_RESEARCH_URL || (projectId ? `https://${projectId}.supabase.co/functions/v1/studio-research` : '');
export const participantLink = (id: string) => `${location.origin}${location.pathname}#/r/${id}`;
const PASS = 'csb-ai-passcode';
export const getPasscode = () => { try { return localStorage.getItem(PASS) || ''; } catch { return ''; } };
export const setPasscode = (v: string) => { try { localStorage.setItem(PASS, v); } catch { /* ignore */ } };

export class NeedsPasscode extends Error {}
export async function call<T>(action: string, body: Record<string, unknown> = {}, owner = false): Promise<T> {
  if (!RESEARCH_URL) throw new Error('Research is not connected on this site.');
  let response: globalThis.Response;
  try {
    response = await fetch(RESEARCH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(owner ? { 'X-Studio-Passcode': getPasscode() } : {}) }, body: JSON.stringify({ action, ...body }) });
  } catch { throw new Error('Could not reach the research service. Check your connection.'); }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new NeedsPasscode(data.message || 'Enter your Studio passcode.');
  if (response.status === 404 && !data.error) throw new Error('The research service is not deployed yet. Ask Codex to deploy studio-research.');
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data as T;
}

/* Drafts you haven't published yet stay in this browser. */
const DRAFTS = 'csb-research-drafts';
export const readDrafts = (): Study[] => { try { return JSON.parse(localStorage.getItem(DRAFTS) || '[]'); } catch { return []; } };
export const writeDrafts = (list: Study[]) => { try { localStorage.setItem(DRAFTS, JSON.stringify(list)); } catch { /* ignore */ } };

/* ---------- Usability tests ---------- */
export const newTask = (n: number): Task => ({ id: crypto.randomUUID().slice(0, 8), title: ['Sign in', 'Book a class', 'Cancel a booking', 'Find your receipt'][n % 4], scenario: 'You want to … Show me how you would do that.', success: 'Reaches the confirmation screen' });
export const newQuestionStep = (n: number): Task => ({ id: crypto.randomUUID().slice(0, 8), title: ['Tell me about the last time you…', 'What was the hardest part of that?', 'How do you deal with that today?', 'If you could change one thing, what would it be?'][n % 4], scenario: 'Can you tell me more about that? What happened next?', success: '' });
export const newInterview = (project?: { id: string; title: string }): Study => ({ ...newUsability(project), format: 'interview', title: 'Untitled interview guide', tasks: [newQuestionStep(0), newQuestionStep(1), newQuestionStep(2), newQuestionStep(3)] });
/* An interview's questions in time order: when each started and ended in the recording (seconds). */
export const questionWindows = (study: Study, session: Session) => { let t = 0; return (study.tasks ?? []).map(q => { const ms = session.tasks.find(x => x.taskId === q.id)?.ms ?? 0; const w = { q, from: t / 1000, to: (t + ms) / 1000 }; t += ms; return w; }); };
export const newUsability = (project?: { id: string; title: string }): Study => ({ id: crypto.randomUUID(), kind: 'usability', title: 'Untitled usability test', projectId: project?.id, projectTitle: project?.title, status: 'open', questions: [], tasks: [newTask(0), newTask(1), newTask(2)], published: false });
export const OUTCOME_LABEL: Record<Outcome, string> = { success: 'Success', help: 'With help', fail: 'Failed', skipped: 'Skipped' };
export const QUICK_TAGS = ['Hesitated', 'Misclick', 'Backtracked', 'Asked for help', 'Confused by label', 'Delighted'];

export type TaskResult = { task: Task; attempts: number; success: number; help: number; fail: number; rate: number; medianMs: number; notes: Array<{ participant: string; text: string; tags: string[] }> };
export function aggregateTasks(study: Study, sessions: Session[]): TaskResult[] {
  return (study.tasks ?? []).map(task => {
    const rec = sessions.map(s => ({ s, r: s.tasks.find(t => t.taskId === task.id) })).filter((x): x is { s: Session; r: TaskRecord } => !!x.r && x.r.status !== 'skipped');
    const success = rec.filter(x => x.r.status === 'success').length, help = rec.filter(x => x.r.status === 'help').length, fail = rec.filter(x => x.r.status === 'fail').length;
    const times = rec.map(x => x.r.ms).sort((a, b) => a - b);
    return { task, attempts: rec.length, success, help, fail, rate: rec.length ? Math.round(success / rec.length * 100) : 0, medianMs: times.length ? times[Math.floor(times.length / 2)] : 0,
      notes: rec.filter(x => x.r.notes || x.r.tags?.length).map(x => ({ participant: x.s.participant, text: x.r.notes || '', tags: x.r.tags ?? [] })) };
  });
}
export const fmtMs = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
