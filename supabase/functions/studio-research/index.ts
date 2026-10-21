import { caller } from '../_shared/access.ts';
// Case Study Studio — Research (your own Maze-style studies)
//
// Studies and responses live in a private Storage bucket ("case-study-research").
// Responses are also mirrored into a Notion database you own, created on first
// publish inside the Notion page you link (the page must be shared with the
// Case Study Studio integration).
//
// Actions (POST JSON { action, ... }):
//   get      public   { id }              → the open study, for participants
//   submit   public   { id, answers, ms } → saves one response (+ Notion row)
//   publish  passcode { study }           → saves the study, creates the Notion database
//   list     passcode {}                  → your studies with response counts
//   results  passcode { id }              → all responses for one study
//   remove   passcode { id }              → deletes a study and its responses
//   audioUpload passcode { id, sessionId, type } → signed upload link for a session recording
//   session  passcode { id, session }     → saves a moderated usability session (+ Notion row)
//   transcript passcode { id, sessionId, transcript } → saves a transcript (+ appends it to the Notion row)
//
// Secrets: STUDIO_PASSCODE, NOTION_TOKEN (same as AI drafting).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

const allowed = new Set(['https://kwolfley27.github.io', 'https://studio.katelynwolfley.design', 'http://localhost:5173', 'http://127.0.0.1:5173']);
const BUCKET = 'case-study-research';
const NOTION_VERSION = '2022-06-28';
const MAX_BODY = 400_000;

type ContactKey = 'name' | 'email' | 'phone';
type FieldMode = 'off' | 'optional' | 'required';
type Question = { id: string; type: 'single' | 'multi' | 'scale' | 'nps' | 'text' | 'long' | 'contact' | 'schedule'; prompt: string; options?: string[]; min?: number; max?: number; minLabel?: string; maxLabel?: string; required?: boolean; preset?: string; contact?: Partial<Record<ContactKey, FieldMode>>; url?: string; showIf?: { questionId: string; anyOf: string[] }; image?: string; optionImages?: string[]; hint?: string };
const httpsUrl = (v: unknown) => /^https:\/\/[^\s"'<>]+$/.test(String(v ?? '')) ? text(v, 800) : '';
const color = (v: unknown) => /^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v) : undefined;
type Answer = string | number | string[] | Partial<Record<ContactKey, string>>;
const QUESTION_TYPES = new Set(['single', 'multi', 'scale', 'nps', 'text', 'long', 'contact', 'schedule']);
const CONTACT_KEYS: ContactKey[] = ['name', 'email', 'phone'];
const BOOKING_STATES = new Set(['Booked a time', 'Opened the booking link']);
const fieldMode = (q: Question, k: ContactKey): FieldMode => { const v = q.contact?.[k] ?? (k === 'phone' ? 'off' : 'required'); return v === 'off' || v === 'optional' || v === 'required' ? v : 'off'; };
const isShown = (q: Question, answers: Record<string, unknown>) => { if (!q.showIf?.questionId || !q.showIf.anyOf?.length) return true; const v = answers[q.showIf.questionId]; return (Array.isArray(v) ? v : [v]).some(x => q.showIf!.anyOf.includes(String(x))); };
type Task = { id: string; title: string; scenario?: string; success?: string };
type Outcome = 'success' | 'help' | 'fail' | 'skipped';
type Transcript = { at: string; speakers: string[]; segments: Array<{ s: number; e: number; spk: number; text: string }> };
type Session = { id: string; at: string; participant: string; durationMs: number; audioPath?: string; notes?: string; notionPageId?: string; transcript?: Transcript; tasks: Array<{ taskId: string; status: Outcome; ms: number; notes?: string; tags?: string[] }> };
type Study = { id: string; kind: 'survey' | 'usability'; theme?: { accent?: string; background?: string; cover?: string }; format?: 'interview'; tasks?: Task[]; title: string; projectId?: string; projectTitle?: string; intro?: string; thanks?: string; status: 'open' | 'closed'; questions: Question[]; notion?: { pageUrl?: string; databaseId?: string; error?: string }; createdAt?: string; updatedAt?: string };

const cleanId = (v: unknown) => String(v ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
const text = (v: unknown, n = 2000) => String(v ?? '').slice(0, n);

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://kwolfley27.github.io',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-studio-passcode',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  if (origin && !allowed.has(origin)) return reply({ error: 'Origin not allowed.' }, 403);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return reply({ error: 'That is too much data.' }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return reply({ error: 'Send JSON.' }, 400); }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const store = supabase.storage.from(BUCKET);
  const readJson = async <T,>(path: string): Promise<T | null> => { const { data } = await store.download(path); return data ? JSON.parse(await data.text()) as T : null; };
  const writeJson = (path: string, value: unknown) => store.upload(path, new Blob([JSON.stringify(value)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });

  const action = String(body.action || '');
  const who = await caller(request, { ownerOnly: true });
  const owner = () => who.ok;

  try {
    // ---------- Public: participants ----------
    if (action === 'get') {
      const study = await readJson<Study>(`studies/${cleanId(body.id)}.json`);
      if (!study) return reply({ error: 'This study could not be found.' }, 404);
      if (study.status !== 'open') return reply({ error: 'This study is closed. Thank you for your interest.' }, 410);
      const { notion: _n, ...publicStudy } = study;
      return reply({ study: publicStudy });
    }
    if (action === 'submit') {
      const id = cleanId(body.id);
      const study = await readJson<Study>(`studies/${id}.json`);
      if (!study || study.status !== 'open' || study.kind === 'usability') return reply({ error: 'This study is closed.' }, 410);
      const answers = (body.answers && typeof body.answers === 'object') ? body.answers as Record<string, unknown> : {};
      const clean: Record<string, Answer> = {};
      for (const q of study.questions) {
        if (!isShown(q, clean)) continue; // skipped by "Show only if"
        const v = answers[q.id];
        if (q.type === 'contact') {
          const a = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
          const c: Partial<Record<ContactKey, string>> = {};
          for (const k of CONTACT_KEYS) { if (fieldMode(q, k) === 'off') continue; const val = text(a[k], k === 'name' ? 120 : 200).trim(); if (val) c[k] = val; }
          const empty = !Object.keys(c).length;
          if (empty && !q.required) continue;
          for (const k of CONTACT_KEYS) if (fieldMode(q, k) === 'required' && !c[k]) return reply({ error: `Please add your ${k}.` }, 400);
          if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) return reply({ error: 'Please check your email address.' }, 400);
          if (c.phone && c.phone.replace(/\D/g, '').length < 7) return reply({ error: 'Please check your phone number.' }, 400);
          clean[q.id] = c; continue;
        }
        if (q.type === 'schedule') { const st = text(v, 60); if (BOOKING_STATES.has(st)) clean[q.id] = st; continue; }
        if (v == null || v === '') { if (q.required) return reply({ error: `Please answer: ${q.prompt}` }, 400); continue; }
        if (q.type === 'multi') clean[q.id] = (Array.isArray(v) ? v : [v]).map(x => text(x, 200)).filter(x => q.options?.includes(x)).slice(0, 30);
        else if (q.type === 'single') { const s = text(v, 200); if (q.options?.includes(s)) clean[q.id] = s; }
        else if (q.type === 'scale' || q.type === 'nps') { const n = Number(v); const lo = q.type === 'nps' ? 0 : (q.min ?? 1), hi = q.type === 'nps' ? 10 : (q.max ?? 5); if (Number.isFinite(n) && n >= lo && n <= hi) clean[q.id] = Math.round(n); }
        else clean[q.id] = text(v, q.type === 'long' ? 4000 : 500);
      }
      const response = { id: crypto.randomUUID(), at: new Date().toISOString(), ms: Math.max(0, Math.min(86_400_000, Number(body.ms) || 0)), answers: clean };
      await writeJson(`responses/${id}/${response.at.replace(/[:.]/g, '-')}-${response.id.slice(0, 8)}.json`, response);
      if (study.notion?.databaseId) await notionRow(study, response).catch(() => undefined);
      return reply({ ok: true });
    }

    // ---------- Owner only ----------
    if (!owner()) return reply({ error: 'passcode', message: 'Enter your Studio passcode to manage research.' }, 401);

    if (action === 'publish') {
      const s = body.study as Study;
      if (!s || typeof s !== 'object' || (!Array.isArray(s.questions) && !Array.isArray(s.tasks))) return reply({ error: 'Send a study.' }, 400);
      const id = cleanId(s.id) || crypto.randomUUID();
      const prev = await readJson<Study>(`studies/${id}.json`);
      const study: Study = {
        id, kind: s.kind === 'usability' ? 'usability' : 'survey', format: s.kind === 'usability' && s.format === 'interview' ? 'interview' : undefined, tasks: Array.isArray(s.tasks) ? s.tasks.slice(0, 30).map(t => ({ id: cleanId(t.id) || crypto.randomUUID().slice(0, 8), title: text(t.title, 200), scenario: text(t.scenario, 1500), success: text(t.success, 500) })) : undefined, title: text(s.title, 200) || 'Untitled study', projectId: s.projectId ? text(s.projectId, 80) : undefined, projectTitle: s.projectTitle ? text(s.projectTitle, 200) : undefined, intro: text(s.intro, 2000), thanks: text(s.thanks, 1000),
        status: s.status === 'closed' ? 'closed' : 'open',
        theme: s.theme ? { accent: color(s.theme.accent), background: color(s.theme.background), cover: httpsUrl(s.theme.cover) || undefined } : undefined,
        questions: (Array.isArray(s.questions) ? s.questions : []).slice(0, 60).filter(q => QUESTION_TYPES.has(q.type)).map(q => ({ id: cleanId(q.id) || crypto.randomUUID().slice(0, 8), type: q.type, prompt: text(q.prompt, 500), options: Array.isArray(q.options) ? q.options.map(o => text(o, 200)).filter(Boolean).slice(0, 30) : undefined, min: q.min, max: q.max, minLabel: text(q.minLabel, 60), maxLabel: text(q.maxLabel, 60), required: !!q.required, preset: q.preset ? text(q.preset, 20) : undefined,
          contact: q.type === 'contact' ? Object.fromEntries(CONTACT_KEYS.map(k => [k, fieldMode(q, k)])) as Record<ContactKey, FieldMode> : undefined,
          url: q.type === 'schedule' && /^https:\/\//.test(String(q.url ?? '')) ? text(q.url, 500) : undefined,
          hint: q.hint ? text(q.hint, 500) : undefined,
          image: httpsUrl(q.image) || undefined,
          optionImages: Array.isArray(q.optionImages) && (q.type === 'single' || q.type === 'multi') ? q.optionImages.slice(0, 30).map(httpsUrl) : undefined,
          showIf: q.showIf?.questionId ? { questionId: cleanId(q.showIf.questionId), anyOf: (Array.isArray(q.showIf.anyOf) ? q.showIf.anyOf : []).map(o => text(o, 200)).slice(0, 30) } : undefined })),
        notion: { pageUrl: s.notion?.pageUrl ? text(s.notion.pageUrl, 500) : undefined, databaseId: prev?.notion?.databaseId },
        createdAt: prev?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      // Create (or re-sync) the Notion responses database inside the linked page.
      if (study.notion?.pageUrl) {
        try { study.notion.databaseId = await ensureDatabase(study); study.notion.error = undefined; }
        catch (error) { study.notion.error = error instanceof Error ? error.message : 'Notion failed.'; }
      }
      await writeJson(`studies/${id}.json`, study);
      return reply({ study });
    }
    if (action === 'list') {
      const { data } = await store.list('studies', { limit: 200 });
      const studies = [];
      for (const file of data ?? []) {
        const s = await readJson<Study>(`studies/${file.name}`); if (!s) continue;
        const { data: rs } = await store.list(`${s.kind === 'usability' ? 'sessions' : 'responses'}/${s.id}`, { limit: 1000 });
        studies.push({ ...s, responses: (rs ?? []).length });
      }
      studies.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return reply({ studies });
    }
    if (action === 'results') {
      const id = cleanId(body.id);
      const study = await readJson<Study>(`studies/${id}.json`);
      if (!study) return reply({ error: 'Study not found.' }, 404);
      const { data } = await store.list(`responses/${id}`, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      const responses = (await Promise.all((data ?? []).map(f => readJson(`responses/${id}/${f.name}`)))).filter(Boolean);
      if (study.kind !== 'usability') return reply({ study, responses });
      const { data: sf } = await store.list(`sessions/${id}`, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      const sessions = (await Promise.all((sf ?? []).map(f => readJson<Session>(`sessions/${id}/${f.name}`)))).filter((x): x is Session => !!x);
      const withAudio = await Promise.all(sessions.map(async ss => { if (!ss.audioPath) return ss; const { data: signed } = await store.createSignedUrl(ss.audioPath, 3600); return { ...ss, audioUrl: signed?.signedUrl }; }));
      return reply({ study, responses, sessions: withAudio });
    }
    if (action === 'remove') {
      const id = cleanId(body.id);
      const { data } = await store.list(`responses/${id}`, { limit: 1000 });
      const { data: sf } = await store.list(`sessions/${id}`, { limit: 1000 });
      const { data: af } = await store.list(`audio/${id}`, { limit: 1000 });
      const paths = [`studies/${id}.json`, ...(data ?? []).map(f => `responses/${id}/${f.name}`), ...(sf ?? []).map(f => `sessions/${id}/${f.name}`), ...(af ?? []).map(f => `audio/${id}/${f.name}`)];
      await store.remove(paths);
      return reply({ ok: true });
    }
    if (action === 'audioUpload') {
      const id = cleanId(body.id), sid = cleanId(body.sessionId);
      const type = String(body.type || 'audio/webm');
      if (!/^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a)/.test(type)) return reply({ error: 'Upload an audio recording.' }, 400);
      const ext = type.includes('mp4') || type.includes('m4a') || type.includes('aac') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('mpeg') ? 'mp3' : 'webm';
      const path = `audio/${id}/${sid}.${ext}`;
      const { data, error } = await store.createSignedUploadUrl(path, { upsert: true });
      if (error || !data) return reply({ error: `Storage: ${error?.message || 'could not create an upload link.'}` }, 500);
      return reply({ uploadUrl: data.signedUrl, token: data.token, path });
    }
    if (action === 'session') {
      const id = cleanId(body.id);
      const study = await readJson<Study>(`studies/${id}.json`);
      if (!study || study.kind !== 'usability') return reply({ error: 'Save the usability test first.' }, 404);
      const raw = body.session as Session;
      const valid = new Set((study.tasks ?? []).map(t => t.id));
      const session: Session = {
        id: cleanId(raw?.id) || crypto.randomUUID(), at: new Date().toISOString(), participant: text(raw?.participant, 80) || 'Participant',
        durationMs: Math.max(0, Math.min(14_400_000, Number(raw?.durationMs) || 0)), audioPath: raw?.audioPath && String(raw.audioPath).startsWith(`audio/${id}/`) ? text(raw.audioPath, 200) : undefined, notes: text(raw?.notes, 4000),
        tasks: (Array.isArray(raw?.tasks) ? raw.tasks : []).filter(t => valid.has(String(t.taskId))).map(t => ({ taskId: String(t.taskId), status: (['success', 'help', 'fail', 'skipped'].includes(t.status) ? t.status : 'skipped') as Outcome, ms: Math.max(0, Math.min(7_200_000, Number(t.ms) || 0)), notes: text(t.notes, 2000), tags: (Array.isArray(t.tags) ? t.tags : []).map(x => text(x, 40)).slice(0, 10) })),
      };
      let notionError: string | undefined;
      if (study.notion?.databaseId) session.notionPageId = await notionSession(study, session).catch(e => { notionError = e instanceof Error ? e.message : 'Notion failed.'; return undefined; });
      await writeJson(`sessions/${id}/${session.at.replace(/[:.]/g, '-')}-${session.id.slice(0, 8)}.json`, session);
      return reply({ ok: true, notionError });
    }
    if (action === 'transcript') {
      // Save a transcript made in the browser onto a session, and add it to the session's Notion page.
      const id = cleanId(body.id), sid = cleanId(body.sessionId);
      const study = await readJson<Study>(`studies/${id}.json`);
      const { data: sf } = await store.list(`sessions/${id}`, { limit: 1000 });
      const file = (sf ?? []).find(f => f.name.endsWith(`-${sid.slice(0, 8)}.json`));
      if (!study || !file) return reply({ error: 'Session not found.' }, 404);
      const session = await readJson<Session>(`sessions/${id}/${file.name}`); if (!session) return reply({ error: 'Session not found.' }, 404);
      const t = body.transcript as Transcript;
      session.transcript = {
        at: new Date().toISOString(),
        speakers: (Array.isArray(t?.speakers) ? t.speakers : []).slice(0, 6).map(x => text(x, 40) || 'Speaker'),
        segments: (Array.isArray(t?.segments) ? t.segments : []).slice(0, 5000).map(x => ({ s: Math.max(0, Number(x.s) || 0), e: Math.max(0, Number(x.e) || 0), spk: Math.max(0, Math.min(5, Math.round(Number(x.spk) || 0))), text: text(x.text, 2000) })).filter(x => x.text),
      };
      await writeJson(`sessions/${id}/${file.name}`, session);
      let notionError: string | undefined;
      if (body.toNotion !== false) {
        if (!session.notionPageId) notionError = study.notion?.databaseId ? 'This session was saved before transcripts could go to Notion.' : undefined;
        else await notionTranscript(session.notionPageId, session.transcript).catch(e => { notionError = e instanceof Error ? e.message : 'Notion failed.'; });
      }
      return reply({ ok: true, notionError });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Something went wrong.' }, 500);
  }
});

/* ---------- Notion ---------- */
async function notion(path: string, init: RequestInit = {}) {
  const token = Deno.env.get('NOTION_TOKEN');
  if (!token) throw new Error('Notion is not connected (missing NOTION_TOKEN).');
  const r = await fetch(`https://api.notion.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (r.status === 404) throw new Error('Notion could not find that page. In Notion: open the page → ••• → Connections → add the Case Study Studio integration.');
  if (!r.ok) throw new Error(`Notion request failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
const notionPageId = (url: string) => { const m = url.replace(/-/g, '').match(/([0-9a-f]{32})(?:[?#]|$)/i); return m ? m[1] : ''; };
const propName = (q: Question, i: number) => `${String(i + 1).padStart(2, '0')} ${q.prompt}`.slice(0, 90).replace(/[.,]+$/, '');
function propSchema(q: Question) {
  if (q.type === 'schedule') return { select: { options: [{ name: 'Booked a time', color: 'green' }, { name: 'Opened the booking link', color: 'gray' }] } };
  if (q.type === 'single') return { select: { options: (q.options ?? []).slice(0, 100).map(name => ({ name: name.replace(/,/g, ' ').slice(0, 100) })) } };
  if (q.type === 'multi') return { multi_select: { options: (q.options ?? []).slice(0, 100).map(name => ({ name: name.replace(/,/g, ' ').slice(0, 100) })) } };
  if (q.type === 'scale' || q.type === 'nps') return { number: { format: 'number' } };
  return { rich_text: {} };
}
const OUTCOMES = [{ name: 'Success', color: 'green' }, { name: 'With help', color: 'yellow' }, { name: 'Failed', color: 'red' }, { name: 'Skipped', color: 'gray' }];
const taskName = (t: Task, i: number, iv?: boolean) => `${iv ? 'Q' : 'T'}${i + 1} ${t.title}`.slice(0, 80).replace(/[.,?]+$/, '');
async function ensureDatabase(study: Study): Promise<string> {
  const properties: Record<string, unknown> = { Participant: { title: {} }, Submitted: { date: {} }, 'Time (s)': { number: { format: 'number' } } };
  if (study.kind === 'usability') {
    const iv = study.format === 'interview';
    (study.tasks ?? []).forEach((t, i) => { if (!iv) properties[taskName(t, i)] = { select: { options: OUTCOMES } }; properties[`${taskName(t, i, iv)} · time (s)`] = { number: { format: 'number' } }; properties[`${taskName(t, i, iv)} · notes`] = { rich_text: {} }; });
    properties['Session notes'] = { rich_text: {} };
  } else study.questions.forEach((q, i) => {
    // Contact info gets real Name / Email / Phone columns instead of one text column.
    if (q.type === 'contact') { if (fieldMode(q, 'name') !== 'off') properties.Name = { rich_text: {} }; if (fieldMode(q, 'email') !== 'off') properties.Email = { email: {} }; if (fieldMode(q, 'phone') !== 'off') properties.Phone = { phone_number: {} }; return; }
    properties[propName(q, i)] = propSchema(q);
  });
  if (study.notion?.databaseId) {
    await notion(`databases/${study.notion.databaseId}`, { method: 'PATCH', body: JSON.stringify({ title: [{ text: { content: `${study.title} · responses` } }], properties }) });
    return study.notion.databaseId;
  }
  const parent = notionPageId(study.notion?.pageUrl || '');
  if (!parent) throw new Error('That does not look like a Notion page link.');
  const db = await notion('databases', { method: 'POST', body: JSON.stringify({ parent: { type: 'page_id', page_id: parent }, title: [{ text: { content: `${study.title} · responses` } }], properties }) });
  return db.id;
}
async function notionRow(study: Study, response: { id: string; at: string; ms: number; answers: Record<string, Answer> }) {
  const properties: Record<string, unknown> = {
    Participant: { title: [{ text: { content: `Participant ${response.id.slice(0, 4).toUpperCase()}` } }] },
    Submitted: { date: { start: response.at } },
    'Time (s)': { number: Math.round(response.ms / 1000) },
  };
  study.questions.forEach((q, i) => {
    const v = response.answers[q.id]; if (v == null) return;
    const name = propName(q, i);
    if (q.type === 'contact') { const c = v as Partial<Record<ContactKey, string>>; if (c.name) properties.Name = { rich_text: [{ text: { content: c.name } }] }; if (c.email) properties.Email = { email: c.email }; if (c.phone) properties.Phone = { phone_number: c.phone }; return; }
    if (q.type === 'schedule') { properties[name] = { select: { name: String(v) } }; return; }
    if (q.type === 'single') properties[name] = { select: { name: String(v).replace(/,/g, ' ').slice(0, 100) } };
    else if (q.type === 'multi') properties[name] = { multi_select: (v as string[]).map(x => ({ name: x.replace(/,/g, ' ').slice(0, 100) })) };
    else if (q.type === 'scale' || q.type === 'nps') properties[name] = { number: Number(v) };
    else properties[name] = { rich_text: [{ text: { content: String(v).slice(0, 1990) } }] };
  });
  await notion('pages', { method: 'POST', body: JSON.stringify({ parent: { database_id: study.notion!.databaseId }, properties }) });
}

async function notionSession(study: Study, session: Session) {
  const label: Record<Outcome, string> = { success: 'Success', help: 'With help', fail: 'Failed', skipped: 'Skipped' };
  const properties: Record<string, unknown> = {
    Participant: { title: [{ text: { content: session.participant } }] },
    Submitted: { date: { start: session.at } },
    'Time (s)': { number: Math.round(session.durationMs / 1000) },
    'Session notes': { rich_text: session.notes ? [{ text: { content: session.notes.slice(0, 1990) } }] : [] },
  };
  (study.tasks ?? []).forEach((t, i) => {
    const r = session.tasks.find(x => x.taskId === t.id); if (!r) return;
    const iv = study.format === 'interview';
    if (!iv) properties[taskName(t, i)] = { select: { name: label[r.status] } };
    properties[`${taskName(t, i, iv)} · time (s)`] = { number: Math.round(r.ms / 1000) };
    const note = [r.tags?.length ? `[${r.tags.join(', ')}]` : '', r.notes || ''].filter(Boolean).join(' ');
    if (note) properties[`${taskName(t, i, study.format === 'interview')} · notes`] = { rich_text: [{ text: { content: note.slice(0, 1990) } }] };
  });
  const page = await notion('pages', { method: 'POST', body: JSON.stringify({ parent: { database_id: study.notion!.databaseId }, properties }) });
  return page.id as string;
}

/* The transcript goes inside the session's Notion page: one paragraph per turn, speaker in bold. */
async function notionTranscript(pageId: string, t: Transcript) {
  const stamp = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  const turns: Array<{ spk: number; s: number; text: string }> = [];
  for (const seg of t.segments) { const last = turns[turns.length - 1]; if (last && last.spk === seg.spk && last.text.length < 1700) last.text += ` ${seg.text}`; else turns.push({ spk: seg.spk, s: seg.s, text: seg.text }); }
  const blocks: unknown[] = [{ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Transcript' } }] } }, ...turns.map(turn => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [
    { text: { content: `${t.speakers[turn.spk] || `Speaker ${turn.spk + 1}`}` }, annotations: { bold: true } },
    { text: { content: `  ${stamp(turn.s)}\n` }, annotations: { color: 'gray' } },
    { text: { content: turn.text.slice(0, 1900) } },
  ] } }))];
  for (let i = 0; i < blocks.length; i += 100) await notion(`blocks/${pageId}/children`, { method: 'PATCH', body: JSON.stringify({ children: blocks.slice(i, i + 100) }) });
}
