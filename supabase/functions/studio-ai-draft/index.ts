// Case Study Studio — "Draft with AI"
// Reads the linked Notion project page and Figma design page, asks Claude to
// assemble a case study from the Studio's component library, and returns it.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   Claude API key (console.anthropic.com)
//   NOTION_TOKEN        Notion internal integration secret (page must be shared with it)
//   FIGMA_TOKEN         Figma personal access token with file_content:read
//   STUDIO_PASSCODE     Any phrase; the Studio asks for it once so strangers can't spend your credits
//   CLAUDE_MODEL        Optional, defaults to claude-sonnet-5-5

const allowed = new Set(['https://kwolfley27.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);
const NOTION_VERSION = '2022-06-28';
const MAX_NOTION_CHARS = 60_000;
const MAX_FRAMES = 40;
const VISION_FRAMES = 10;

type Frame = { id: string; name: string; group: string; width: number; height: number };

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

  const passcode = Deno.env.get('STUDIO_PASSCODE') || '';
  if (!passcode || request.headers.get('x-studio-passcode') !== passcode) return reply({ error: 'passcode', message: 'Enter your Studio passcode to use AI drafting.' }, 401);
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return reply({ error: 'AI drafting is not configured yet (missing ANTHROPIC_API_KEY).' }, 500);

  try {
    const body = await request.json();
    const notionUrl: string = body.notionUrl || '';
    const figmaUrl: string = body.figmaUrl || '';
    const catalog: unknown = body.catalog;
    const current: unknown = body.current;
    if (!notionUrl && !figmaUrl) return reply({ error: 'Add a Notion research link or a Figma design link first.' }, 400);

    const notes = notionUrl ? await readNotion(notionUrl) : { text: '', title: '' };
    const figma = figmaUrl ? await readFigma(figmaUrl) : { fileKey: '', fileName: '', frames: [] as Frame[], previews: {} as Record<string, string> };

    const draft = await askClaude({ anthropicKey, notes, figma, catalog, current, guidance: String(body.guidance || '').slice(0, 2000) });

    // Render full-resolution images for frames Claude placed, so the Studio can download them.
    const used = new Set<string>();
    for (const section of draft.sections ?? []) for (const item of section.items ?? []) if (item.frameId) used.add(String(item.frameId));
    if (draft.heroFrameId) used.add(String(draft.heroFrameId));
    const known = new Set(figma.frames.map(frame => frame.id));
    const ids = [...used].filter(id => known.has(id)).slice(0, 30);
    const images: Record<string, string> = ids.length ? await figmaImages(figma.fileKey, ids, 2) : {};

    return reply({ draft, images, figma: { fileKey: figma.fileKey, fileName: figma.fileName, frameCount: figma.frames.length }, notion: { title: notes.title, characters: notes.text.length } });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'AI draft failed.' }, 400);
  }
});

/* ── Notion ─────────────────────────────────────────────────────────────── */
function notionId(url: string) {
  const match = url.replace(/-/g, '').match(/([0-9a-f]{32})(?:[?#]|$)/i) || url.replace(/-/g, '').match(/([0-9a-f]{32})/i);
  if (!match) throw new Error('That Notion link does not contain a page ID. Use “Copy link” on the project page.');
  const id = match[1];
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
async function notion(path: string, init: RequestInit = {}) {
  const token = Deno.env.get('NOTION_TOKEN');
  if (!token) throw new Error('Notion is not connected yet (missing NOTION_TOKEN).');
  const response = await fetch(`https://api.notion.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (response.status === 404) throw new Error('Notion could not find that page. In Notion, open the page → ••• → Connections → add your Case Study Studio integration.');
  if (response.status === 401) throw new Error('The Notion token is not valid.');
  if (!response.ok) throw new Error(`Notion request failed (${response.status}).`);
  return response.json();
}
const rich = (parts: Array<{ plain_text?: string }> = []) => parts.map(part => part.plain_text ?? '').join('');
function propertyText(value: any): string {
  if (!value) return '';
  switch (value.type) {
    case 'title': return rich(value.title);
    case 'rich_text': return rich(value.rich_text);
    case 'number': return value.number == null ? '' : String(value.number);
    case 'select': return value.select?.name ?? '';
    case 'multi_select': return (value.multi_select ?? []).map((item: any) => item.name).join(', ');
    case 'status': return value.status?.name ?? '';
    case 'date': return value.date?.start ?? '';
    case 'url': return value.url ?? '';
    case 'checkbox': return value.checkbox ? 'yes' : 'no';
    default: return '';
  }
}
async function readNotion(url: string) {
  const id = notionId(url);
  let text = '';
  let title = '';
  const add = (line: string) => { if (text.length < MAX_NOTION_CHARS) text += line + '\n'; };
  try { const page = await notion(`pages/${id}`); title = Object.values(page.properties ?? {}).map(propertyText).find(Boolean) ?? ''; add(`# ${title}`); }
  catch (error) { if (String(error).includes('could not find')) { /* may be a database */ } else throw error; }
  const walk = async (blockId: string, depth: number) => {
    if (depth > 4 || text.length >= MAX_NOTION_CHARS) return;
    let cursor: string | undefined;
    do {
      const data = await notion(`blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
      for (const block of data.results ?? []) {
        if (text.length >= MAX_NOTION_CHARS) return;
        const type = block.type; const value = block[type] ?? {};
        const line = rich(value.rich_text);
        if (type === 'child_page') { add(`\n## Subpage: ${value.title}`); await walk(block.id, depth + 1); continue; }
        if (type === 'child_database') { add(`\n## Database: ${value.title}`); await readDatabase(block.id, add); continue; }
        if (type.startsWith('heading_')) add(`\n${'#'.repeat(Number(type.slice(-1)) + 1)} ${line}`);
        else if (type === 'bulleted_list_item' || type === 'to_do') add(`- ${line}`);
        else if (type === 'numbered_list_item') add(`1. ${line}`);
        else if (type === 'quote' || type === 'callout') add(`> ${line}`);
        else if (type === 'table_row') add(`| ${(value.cells ?? []).map(rich).join(' | ')} |`);
        else if (type === 'image') add(`[image: ${rich(value.caption) || 'untitled'}]`);
        else if (type === 'bookmark' || type === 'link_preview' || type === 'embed') add(`[link: ${value.url}]`);
        else if (line) add(line);
        if (block.has_children && !['child_page', 'child_database'].includes(type)) await walk(block.id, depth + 1);
      }
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
  };
  try { await walk(id, 0); }
  catch (error) { if (!text) { await readDatabase(id, add); } else throw error; }
  if (!text.trim()) throw new Error('The Notion page was empty or not shared with the integration.');
  return { text: text.slice(0, MAX_NOTION_CHARS), title };
}
async function readDatabase(id: string, add: (line: string) => void) {
  const data = await notion(`databases/${id}/query`, { method: 'POST', body: JSON.stringify({ page_size: 50 }) });
  for (const row of data.results ?? []) {
    const fields = Object.entries(row.properties ?? {}).map(([name, value]) => `${name}: ${propertyText(value)}`).filter(line => !line.endsWith(': ')).join(' · ');
    add(`- ${fields}`);
  }
}

/* ── Figma ──────────────────────────────────────────────────────────────── */
async function figmaApi(path: string) {
  const token = Deno.env.get('FIGMA_TOKEN');
  if (!token) throw new Error('Figma is not connected yet (missing FIGMA_TOKEN).');
  const response = await fetch(`https://api.figma.com/v1/${path}`, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(30000) });
  if (response.status === 403) throw new Error('Figma access denied. Check the token and file access.');
  if (response.status === 429) throw new Error('Figma rate limit reached. Try again in a minute.');
  if (!response.ok) throw new Error(`Figma request failed (${response.status}).`);
  return response.json();
}
async function figmaImages(fileKey: string, ids: string[], scale: number) {
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 15) {
    const chunk = ids.slice(i, i + 15);
    const data = await figmaApi(`images/${fileKey}?ids=${encodeURIComponent(chunk.join(','))}&format=png&scale=${scale}`);
    Object.assign(out, data.images ?? {});
  }
  return out;
}
async function readFigma(url: string) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/^\/(?:design|file|proto)\/([a-zA-Z0-9]+)/);
  if (!match) throw new Error('Use a Figma design link.');
  const fileKey = match[1];
  const nodeId = parsed.searchParams.get('node-id')?.replace(/-/g, ':');
  const frames: Frame[] = [];
  const visit = (node: any, group: string) => {
    if (!node || node.visible === false || frames.length >= MAX_FRAMES) return;
    const box = node.absoluteBoundingBox;
    if (['FRAME', 'COMPONENT', 'INSTANCE'].includes(node.type) && box && box.width >= 240 && box.height >= 240) { frames.push({ id: node.id, name: node.name, group, width: Math.round(box.width), height: Math.round(box.height) }); return; }
    for (const child of node.children ?? []) visit(child, ['SECTION', 'CANVAS', 'FRAME'].includes(node.type) ? node.name : group);
  };
  let fileName = 'Figma file';
  if (nodeId) {
    const data = await figmaApi(`files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=3`);
    fileName = data.name ?? fileName;
    const root = data.nodes?.[nodeId]?.document;
    if (!root) throw new Error('That Figma page or frame was not found.');
    if (root.type === 'CANVAS' || root.type === 'SECTION') for (const child of root.children ?? []) visit(child, root.name); else visit(root, '');
  } else {
    const data = await figmaApi(`files/${fileKey}?depth=3`);
    fileName = data.name ?? fileName;
    for (const page of data.document?.children ?? []) for (const child of page.children ?? []) visit(child, page.name);
  }
  const previews = frames.length ? await figmaImages(fileKey, frames.slice(0, VISION_FRAMES).map(frame => frame.id), 0.4) : {};
  return { fileKey, fileName, frames, previews };
}

/* ── Claude ─────────────────────────────────────────────────────────────── */
const SYSTEM = `You are the writing and layout partner inside Case Study Studio, a tool a UX designer uses to build portfolio case studies in an Apple-like, minimal style.

Your job: turn the designer's research notes (from Notion) and design frames (from Figma) into a complete case study by choosing components from the provided catalog and filling them in. Return it with the build_case_study tool.

Story: follow a clear arc — context → problem → research (Discover) → definition (Define) → design (Develop) → solution and outcome (Deliver) → reflection. Usually 7–12 sections. Choose the component whose shape fits the evidence (a ratio or count → metrics; participants with quotes → interviews or quotes; a list of problems → findings; competitor notes → competitors; an emotional journey → journey; screens → carousel, wireframes, gallery or annotated).

Honesty rules — these matter more than polish:
- Use only facts, numbers and quotes that appear in the notes. Never invent statistics, participants, quotes, outcomes or impact.
- Quotes must be verbatim from the notes. If the notes have no quote for a slot, leave quote fields empty rather than writing one.
- If something useful is missing, write a short bracketed placeholder like "[Add: number of participants]" instead of guessing.
- Distinguish measured outcomes from hopes or estimates in the wording.

Writing: the designer's voice — first person ("I") unless the notes say "we". Plain, specific, warm. Headlines short (max ~9 words). Body copy 1–3 sentences. No buzzwords, no exclamation marks.

Images: use Figma frames by their exact frameId from the frame list. Only place a frame where its name/preview fits. Set heroFrameId to the best overview or hero frame if one exists. Never invent frame IDs.

Fields: each section has kind, navLabel (1–2 words for the side menu), eyebrow (short phase label), title, body, variant (light | tinted | dark — alternate for rhythm, use dark sparingly for emphasis), and items following that component's item shape in the catalog. Use layoutCount when a component shows a variable number of items.`;

async function askClaude({ anthropicKey, notes, figma, catalog, current, guidance }: { anthropicKey: string; notes: { text: string; title: string }; figma: { fileName: string; frames: Frame[]; previews: Record<string, string> }; catalog: unknown; current: unknown; guidance: string }) {
  const frameList = figma.frames.map(frame => `- ${frame.id} · "${frame.name}"${frame.group ? ` (in ${frame.group})` : ''} · ${frame.width}×${frame.height}`).join('\n');
  const content: any[] = [
    { type: 'text', text: `COMPONENT CATALOG (kind → name, purpose, item shape example):\n${JSON.stringify(catalog).slice(0, 30000)}` },
    { type: 'text', text: `CURRENT CASE STUDY (for project name, role, accent and anything the designer already wrote; you may rewrite it):\n${JSON.stringify(current).slice(0, 12000)}` },
    { type: 'text', text: `NOTION NOTES${notes.title ? ` — "${notes.title}"` : ''}:\n${notes.text || '(none provided)'}` },
    { type: 'text', text: `FIGMA FRAMES from "${figma.fileName}" (use these exact IDs):\n${frameList || '(none provided)'}` },
  ];
  for (const frame of figma.frames.slice(0, VISION_FRAMES)) {
    const url = figma.previews[frame.id];
    if (url) { content.push({ type: 'text', text: `Preview of ${frame.id} "${frame.name}":` }); content.push({ type: 'image', source: { type: 'url', url } }); }
  }
  if (guidance) content.push({ type: 'text', text: `DESIGNER'S NOTE FOR THIS DRAFT: ${guidance}` });
  content.push({ type: 'text', text: 'Build the case study now with the build_case_study tool.' });

  const tool = {
    name: 'build_case_study',
    description: 'Return the complete case study.',
    input_schema: {
      type: 'object',
      required: ['title', 'summary', 'sections'],
      properties: {
        title: { type: 'string', description: 'Case study headline.' },
        summary: { type: 'string', description: 'One or two sentence summary.' },
        client: { type: 'string' }, role: { type: 'string' }, timeframe: { type: 'string' },
        heroFrameId: { type: 'string', description: 'Figma frame ID for the hero image, if any.' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            required: ['kind', 'title'],
            properties: {
              kind: { type: 'string' }, navLabel: { type: 'string' }, eyebrow: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' },
              variant: { type: 'string', enum: ['light', 'tinted', 'dark'] },
              layoutCount: { type: 'integer' }, columns: { type: 'integer' }, criteria: { type: 'string' },
              items: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { title: { type: 'string' }, detail: { type: 'string' }, value: { type: 'string' }, frameId: { type: 'string' }, finding: { type: 'string' }, findingNote: { type: 'string' }, quote: { type: 'string' }, quoteNote: { type: 'string' } } } },
            },
          },
        },
        gaps: { type: 'array', items: { type: 'string' }, description: 'Important things missing from the notes that the designer should add.' },
      },
    },
  };

  // tool_choice "auto" (some models reject a forced tool). If Claude answers in
  // text instead of calling the tool, ask once more for the tool call.
  const messages: any[] = [{ role: 'user', content }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('CLAUDE_MODEL') || 'claude-sonnet-5-5', max_tokens: 12000, system: SYSTEM + '\n\nAlways respond by calling the build_case_study tool. Do not reply in plain text.', tools: [tool], tool_choice: { type: 'auto' }, messages }),
      signal: AbortSignal.timeout(140000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ? `Claude: ${data.error.message}` : `Claude request failed (${response.status}).`);
    const use = (data.content ?? []).find((part: any) => part.type === 'tool_use');
    if (use) return use.input;
    if (data.stop_reason === 'max_tokens') throw new Error('The draft ran too long. Try guidance like “keep it under 8 sections”.');
    messages.push({ role: 'assistant', content: data.content?.length ? data.content : [{ type: 'text', text: '(no answer)' }] }, { role: 'user', content: 'Now call the build_case_study tool with the complete case study.' });
  }
  throw new Error('Claude did not return a case study. Try again.');
}
