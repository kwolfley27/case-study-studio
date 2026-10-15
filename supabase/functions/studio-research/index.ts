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
//
// Secrets: STUDIO_PASSCODE, NOTION_TOKEN (same as AI drafting).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';

const allowed = new Set(['https://kwolfley27.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);
const BUCKET = 'case-study-research';
const NOTION_VERSION = '2022-06-28';
const MAX_BODY = 60_000;

type Question = { id: string; type: 'single' | 'multi' | 'scale' | 'nps' | 'text' | 'long'; prompt: string; options?: string[]; min?: number; max?: number; minLabel?: string; maxLabel?: string; required?: boolean; preset?: string };
type Study = { id: string; kind: 'survey'; title: string; intro?: string; thanks?: string; status: 'open' | 'closed'; questions: Question[]; notion?: { pageUrl?: string; databaseId?: string; error?: string }; createdAt?: string; updatedAt?: string };

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
  const owner = () => { const pass = Deno.env.get('STUDIO_PASSCODE') || ''; return !!pass && request.headers.get('x-studio-passcode') === pass; };

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
      if (!study || study.status !== 'open') return reply({ error: 'This study is closed.' }, 410);
      const answers = (body.answers && typeof body.answers === 'object') ? body.answers as Record<string, unknown> : {};
      const clean: Record<string, string | number | string[]> = {};
      for (const q of study.questions) {
        const v = answers[q.id];
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
      if (!s || typeof s !== 'object' || !Array.isArray(s.questions)) return reply({ error: 'Send a study.' }, 400);
      const id = cleanId(s.id) || crypto.randomUUID();
      const prev = await readJson<Study>(`studies/${id}.json`);
      const study: Study = {
        id, kind: 'survey', title: text(s.title, 200) || 'Untitled study', intro: text(s.intro, 2000), thanks: text(s.thanks, 1000),
        status: s.status === 'closed' ? 'closed' : 'open',
        questions: s.questions.slice(0, 60).map(q => ({ id: cleanId(q.id) || crypto.randomUUID().slice(0, 8), type: q.type, prompt: text(q.prompt, 500), options: Array.isArray(q.options) ? q.options.map(o => text(o, 200)).filter(Boolean).slice(0, 30) : undefined, min: q.min, max: q.max, minLabel: text(q.minLabel, 60), maxLabel: text(q.maxLabel, 60), required: !!q.required, preset: q.preset ? text(q.preset, 20) : undefined })),
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
        const { data: rs } = await store.list(`responses/${s.id}`, { limit: 1000 });
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
      return reply({ study, responses });
    }
    if (action === 'remove') {
      const id = cleanId(body.id);
      const { data } = await store.list(`responses/${id}`, { limit: 1000 });
      const paths = [`studies/${id}.json`, ...(data ?? []).map(f => `responses/${id}/${f.name}`)];
      await store.remove(paths);
      return reply({ ok: true });
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
  if (q.type === 'single') return { select: { options: (q.options ?? []).slice(0, 100).map(name => ({ name: name.replace(/,/g, ' ').slice(0, 100) })) } };
  if (q.type === 'multi') return { multi_select: { options: (q.options ?? []).slice(0, 100).map(name => ({ name: name.replace(/,/g, ' ').slice(0, 100) })) } };
  if (q.type === 'scale' || q.type === 'nps') return { number: { format: 'number' } };
  return { rich_text: {} };
}
async function ensureDatabase(study: Study): Promise<string> {
  const properties: Record<string, unknown> = { Participant: { title: {} }, Submitted: { date: {} }, 'Time (s)': { number: { format: 'number' } } };
  study.questions.forEach((q, i) => { properties[propName(q, i)] = propSchema(q); });
  if (study.notion?.databaseId) {
    await notion(`databases/${study.notion.databaseId}`, { method: 'PATCH', body: JSON.stringify({ title: [{ text: { content: `${study.title} · responses` } }], properties }) });
    return study.notion.databaseId;
  }
  const parent = notionPageId(study.notion?.pageUrl || '');
  if (!parent) throw new Error('That does not look like a Notion page link.');
  const db = await notion('databases', { method: 'POST', body: JSON.stringify({ parent: { type: 'page_id', page_id: parent }, title: [{ text: { content: `${study.title} · responses` } }], properties }) });
  return db.id;
}
async function notionRow(study: Study, response: { id: string; at: string; ms: number; answers: Record<string, string | number | string[]> }) {
  const properties: Record<string, unknown> = {
    Participant: { title: [{ text: { content: `Participant ${response.id.slice(0, 4).toUpperCase()}` } }] },
    Submitted: { date: { start: response.at } },
    'Time (s)': { number: Math.round(response.ms / 1000) },
  };
  study.questions.forEach((q, i) => {
    const v = response.answers[q.id]; if (v == null) return;
    const name = propName(q, i);
    if (q.type === 'single') properties[name] = { select: { name: String(v).replace(/,/g, ' ').slice(0, 100) } };
    else if (q.type === 'multi') properties[name] = { multi_select: (v as string[]).map(x => ({ name: x.replace(/,/g, ' ').slice(0, 100) })) };
    else if (q.type === 'scale' || q.type === 'nps') properties[name] = { number: Number(v) };
    else properties[name] = { rich_text: [{ text: { content: String(v).slice(0, 1990) } }] };
  });
  await notion('pages', { method: 'POST', body: JSON.stringify({ parent: { database_id: study.notion!.databaseId }, properties }) });
}
