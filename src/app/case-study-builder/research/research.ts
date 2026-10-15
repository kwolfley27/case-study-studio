import { projectId, publicAnonKey } from '../../../utils/supabase/info';

/* Your own research tool: studies, questions, scoring and the server calls. */

export type QuestionType = 'single' | 'multi' | 'scale' | 'nps' | 'text' | 'long';
export type Question = { id: string; type: QuestionType; prompt: string; options?: string[]; min?: number; max?: number; minLabel?: string; maxLabel?: string; required?: boolean; preset?: string };
export type Task = { id: string; title: string; scenario?: string; success?: string };
export type Outcome = 'success' | 'help' | 'fail' | 'skipped';
export type TaskRecord = { taskId: string; status: Outcome; ms: number; notes?: string; tags?: string[] };
export type Session = { id: string; at: string; participant: string; durationMs: number; audioPath?: string; audioUrl?: string; notes?: string; tasks: TaskRecord[]; transcript?: Transcript; notionPageId?: string };
export type TranscriptLine = { s: number; e: number; spk: number; text: string };
export type Transcript = { at: string; speakers: string[]; segments: TranscriptLine[] };
export type Study = { id: string; kind: 'survey' | 'usability'; /** 'interview': a usability-style session where each step is a question you ask, not a task. */ format?: 'interview'; tasks?: Task[]; title: string; /** The case study this research belongs to. */ projectId?: string; projectTitle?: string; intro?: string; thanks?: string; status: 'open' | 'closed'; questions: Question[]; notion?: { pageUrl?: string; databaseId?: string; error?: string }; createdAt?: string; updatedAt?: string; responses?: number; published?: boolean };
export type Response = { id: string; at: string; ms: number; answers: Record<string, string | number | string[]> };

export const QUESTION_TYPES: Array<[QuestionType, string, string]> = [
  ['single', 'One choice', 'Pick one option'],
  ['multi', 'Checkboxes', 'Pick any that apply'],
  ['scale', 'Scale', 'Rate from 1 to 5 (or 7)'],
  ['nps', 'NPS 0–10', 'How likely to recommend'],
  ['text', 'Short answer', 'A few words'],
  ['long', 'Long answer', 'A paragraph'],
];

const qid = () => crypto.randomUUID().slice(0, 8);
export const newQuestion = (type: QuestionType): Question => ({
  id: qid(), type, required: type !== 'long' && type !== 'text',
  prompt: { single: 'Which best describes you?', multi: 'Which of these do you use?', scale: 'How easy was it to book a class?', nps: 'How likely are you to recommend this to a friend?', text: 'In a few words, what was hardest?', long: 'Tell us about the last time you booked a class.' }[type],
  ...(type === 'single' || type === 'multi' ? { options: ['Option one', 'Option two', 'Option three'] } : {}),
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

export const newStudy = (project?: { id: string; title: string }): Study => ({ id: crypto.randomUUID(), kind: 'survey', title: 'Untitled survey', projectId: project?.id, projectTitle: project?.title, intro: 'Thanks for helping! This takes about 3 minutes. There are no right or wrong answers.', thanks: 'Thank you — your answers really help.', status: 'open', questions: [newQuestion('single'), newQuestion('scale'), newQuestion('text')], published: false });

/* ---------- Scoring ---------- */
export type QuestionResult =
  | { q: Question; kind: 'choice'; answered: number; options: Array<{ label: string; count: number }> }
  | { q: Question; kind: 'scale'; answered: number; mean: number; dist: number[] }
  | { q: Question; kind: 'nps'; answered: number; score: number; promoters: number; passives: number; detractors: number }
  | { q: Question; kind: 'text'; answered: number; answers: string[] };

export function aggregate(study: Study, responses: Response[]): QuestionResult[] {
  return study.questions.map(q => {
    const vals = responses.map(r => r.answers[q.id]).filter(v => v != null && v !== '' && !(Array.isArray(v) && !v.length));
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
    response = await fetch(RESEARCH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, apikey: publicAnonKey, ...(owner ? { 'X-Studio-Passcode': getPasscode() } : {}) }, body: JSON.stringify({ action, ...body }) });
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
