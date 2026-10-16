// Case Study Studio — "Draft with AI"
// Deployed automatically by .github/workflows/deploy-functions.yml when this folder changes.
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
    // Miso, the studio cat: turn one spoken request into a few studio actions. Small and fast.
    if (body.task === 'assistant') {
      const said = String(body.said || '').slice(0, 600);
      if (!said) return reply({ error: 'Nothing was said.' }, 400);
      const image = typeof body.image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(body.image) && body.image.length < 2_500_000 ? body.image : '';
      return reply(await assist(anthropicKey, said, body.context ?? {}, image));
    }
    // Affinity diagram: sort research notes into a bottom-up hierarchy.
    if (body.task === 'affinity') {
      const notes = (Array.isArray(body.notes) ? body.notes : []).map((n: unknown) => String(n).slice(0, 400)).filter(Boolean).slice(0, 300);
      if (notes.length < 3) return reply({ error: 'Add at least three notes to sort.' }, 400);
      return reply(await sortAffinity(anthropicKey, notes, String(body.guidance || '').slice(0, 1000)));
    }
    // Recorded flow: name each screenshot and the action that led to it.
    if (body.task === 'flowFromScreens') {
      const images = (Array.isArray(body.images) ? body.images : []).map((x: unknown) => String(x)).filter((x: string) => /^[A-Za-z0-9+/=]+$/.test(x) && x.length < 400_000).slice(0, 20);
      if (images.length < 2) return reply({ error: 'Send at least two screenshots.' }, 400);
      return reply(await nameScreens(anthropicKey, images, String(body.context || '').slice(0, 200)));
    }
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
    case 'date': return value.date?.start ? value.date.start + (value.date.end ? ` → ${value.date.end}` : '') : '';
    case 'formula': return value.formula ? String(value.formula[value.formula.type] ?? '') : '';
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

Story: follow a clear arc — context → problem → research (Discover) → definition (Define) → design (Develop) → solution and outcome (Deliver) → reflection. Usually 7–12 sections. Choose the component whose shape fits the evidence (a ratio or count → metrics; participants with quotes → interviews or quotes; a list of problems → findings; competitor notes → competitors; an emotional journey → journey; a dated process log or list of activities by week/phase → timeline; screens → carousel, wireframes, gallery or annotated).

Honesty rules — these matter more than polish:
- Use only facts, numbers and quotes that appear in the notes. Never invent statistics, participants, quotes, outcomes or impact.
- Quotes must be verbatim from the notes. If the notes have no quote for a slot, leave quote fields empty rather than writing one.
- If something useful is missing, write a short bracketed placeholder like "[Add: number of participants]" instead of guessing.
- Distinguish measured outcomes from hopes or estimates in the wording.

Writing: the designer's voice — first person ("I") unless the notes say "we". Plain, specific, warm. Headlines short (max ~9 words). Body copy 1–3 sentences. No buzzwords, no exclamation marks.

Images: use Figma frames by their exact frameId from the frame list. Only place a frame where its name/preview fits. Set heroFrameId to the best overview or hero frame if one exists. Never invent frame IDs.

Section-level data: when a catalog entry has a sectionShape (affinity, abtest, roadmap), fill that object on the section in the same shape. For persona and aeiou, keep each item's blockType and cat exactly as in itemShape.

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
              timeUnit: { type: 'string', description: 'timeline only: Week, Day, Sprint or Month.' },
              phases: { type: 'array', description: 'timeline only: one entry per phase, in order.', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string', description: 'A short note, 3–5 words.' } } } },
              affinity: { type: 'object', description: 'affinity only: groups (green areas) > issues (pink) > aspects (blue, first person) > notes (yellow, copied word for word from the research).' },
              abtest: { type: 'object', description: 'abtest only: result (b, a or none), method line, and up to 3 metrics. Use only numbers stated in the notes.' },
              roadmap: { type: 'object', description: 'roadmap only: start (YYYY-MM-DD, the Monday of week 0), weeks, lanes [{id,title}], cards [{lane,week (0-based),span,title,bullets}], breaks (week indexes with no sprint), milestones [{week,label,major}]. Use only dates and work in the notes.' },
              items: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { title: { type: 'string' }, detail: { type: 'string' }, value: { type: 'string' }, frameId: { type: 'string' }, finding: { type: 'string' }, findingNote: { type: 'string' }, quote: { type: 'string' }, quoteNote: { type: 'string' }, when: { type: 'string', description: 'timeline only: unit number or range, e.g. "2" or "1-3".' } } } },
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

/* Affinity diagram sorting. Bottom-up: cluster the observations first, name each
   cluster in the user's voice (blue), group clusters into issues (pink), and
   issues into areas of concern (green). Never rewrite or invent observations. */
async function sortAffinity(anthropicKey: string, notes: string[], guidance: string) {
  const tool = {
    name: 'affinity_diagram',
    description: 'Return the affinity diagram.',
    input_schema: { type: 'object', required: ['groups'], properties: {
      groups: { type: 'array', items: { type: 'object', required: ['title', 'issues'], properties: {
        title: { type: 'string', description: 'Green note: an overarching area of concern within the work practice, 2–5 words.' },
        issues: { type: 'array', items: { type: 'object', required: ['title', 'aspects'], properties: {
          title: { type: 'string', description: 'Pink note: a specific issue within the area of concern, in the user\'s voice, 3–7 words.' },
          aspects: { type: 'array', items: { type: 'object', required: ['title', 'notes'], properties: {
            title: { type: 'string', description: 'Blue note: what this cluster of observations reveals, first person ("I want…", "Don\'t…"), 3–9 words.' },
            notes: { type: 'array', items: { type: 'string' }, description: 'The yellow notes in this cluster, copied exactly from the input.' },
          } } },
        } } },
      } } },
      unsorted: { type: 'array', items: { type: 'string' }, description: 'Notes that do not fit any cluster, copied exactly.' },
    } },
  };
  const system = `You are a UX researcher building an affinity diagram from contextual inquiry or usability notes. Work bottom-up: do not use predefined categories. First cluster the yellow notes by similarity of meaning, then name each cluster as a blue note in the user's voice, then group blue notes under pink issue notes, then pink notes under green areas of concern. Every input note must appear exactly once, copied word for word, either in a cluster or in unsorted. Clusters should have 2–6 notes. Keep labels short and plain. Always respond by calling the affinity_diagram tool.`;
  const messages: any[] = [{ role: 'user', content: `NOTES (one per line):\n${notes.map(n => `- ${n}`).join('\n')}${guidance ? `\n\nGUIDANCE: ${guidance}` : ''}` }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('CLAUDE_MODEL') || 'claude-sonnet-5-5', max_tokens: 8000, system, tools: [tool], tool_choice: { type: 'auto' }, messages }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ? `Claude: ${data.error.message}` : `Claude request failed (${response.status}).`);
    const use = (data.content ?? []).find((part: any) => part.type === 'tool_use');
    if (use) return use.input;
    messages.push({ role: 'assistant', content: data.content?.length ? data.content : [{ type: 'text', text: '(no answer)' }] }, { role: 'user', content: 'Now call the affinity_diagram tool.' });
  }
  throw new Error('Claude did not return a diagram. Try again.');
}

/* Recorded user flow: label each screen (a few words) and the action that got there.
   Screens are in order; mark near-duplicates or transition frames keep=false. */
async function nameScreens(anthropicKey: string, images: string[], context: string) {
  const tool = {
    name: 'user_flow',
    description: 'Return one entry per screenshot, in the same order.',
    input_schema: { type: 'object', required: ['steps'], properties: {
      title: { type: 'string', description: 'The task being done, e.g. "ClassPass · book a class". Include the product name if visible.' },
      steps: { type: 'array', items: { type: 'object', required: ['label', 'keep'], properties: {
        label: { type: 'string', description: 'Name of this screen, 1–4 words, Title-free sentence case, e.g. "Class schedule", "Payment sheet".' },
        action: { type: 'string', description: 'What the user did on the previous screen to get here, starting with a verb, e.g. "Tap Book", "Search yoga". Empty for the first screen.' },
        keep: { type: 'boolean', description: 'false if this frame is a duplicate, a loading/transition frame, or a keyboard-only change of the previous screen.' },
      } } },
    } },
  };
  const content: any[] = [{ type: 'text', text: `These ${images.length} screenshots are consecutive screens from a screen recording of someone using an app or website${context ? ` (${context})` : ''}. Name each screen and the action between screens.` }];
  images.forEach((data, i) => { content.push({ type: 'text', text: `Screen ${i + 1}:` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }); });
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('CLAUDE_MODEL') || 'claude-sonnet-5-5', max_tokens: 3000, system: 'You are a UX designer documenting a user flow from screenshots. Be literal: only describe what is visible. Always answer by calling the user_flow tool with exactly one step per screenshot.', tools: [tool], tool_choice: { type: 'tool', name: 'user_flow' }, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ? `Claude: ${data.error.message}` : `Claude request failed (${response.status}).`);
  const use = (data.content ?? []).find((part: any) => part.type === 'tool_use');
  if (!use) throw new Error('Claude did not name the screens. Try again.');
  return use.input;
}


/* ── Miso, the studio cat ──────────────────────────────────────────────── */
async function assist(anthropicKey: string, said: string, context: any, image = '') {
  const ctx = JSON.stringify(context).slice(0, 24_000);
  const tool = {
    name: 'studio_actions',
    description: 'Reply to Katelyn and change her case study.',
    input_schema: { type: 'object', required: ['say', 'actions'], properties: {
      say: { type: 'string', description: 'A very short reply, 2–10 words, warm and plain (e.g. "Done, it’s shorter now."). If you need to ask something, ask one short question. Use an empty string to stay quiet.' },
      answer: { type: 'string', description: 'Only when she asks you a question or wants your opinion or feedback: your answer, shown in a small chat. Plain text, short lines; use "- " for points. At most about 120 words.' },
      done: { type: 'string', description: 'For context.event "frame_brief" only: 2–5 words to say once it is built (e.g. "Done. It’s after the problem.").' },
      plan: { type: 'string', description: 'Only when the goal you two are working on changes: what it is now, in a few words (e.g. "fill the empty Cricut study with frames from Figma"). An empty string clears it when it is done or she drops it. Leave this out to keep the current plan.' },
      actions: { type: 'array', description: 'What to do, in order. Empty if you only answer or ask.', items: { type: 'object', required: ['type'], properties: {
        type: { type: 'string', enum: ['set_text', 'add_section', 'move_section', 'delete_section', 'set_variant', 'select', 'place_clip', 'set_mode'] },
        sectionId: { type: 'string', description: 'An id from context.sections, "hero" for the header, or "new1", "new2"… for sections added earlier in this same reply.' },
        field: { type: 'string', description: 'set_text: "title", "eyebrow", "body", "items.N.title" or "items.N.detail" (N = item index from the context).' },
        value: { type: 'string', description: 'set_text: the new text. Keep her voice: plain, short, sentence case, no hype, never invent numbers or quotes.' },
        templateId: { type: 'string', description: 'add_section: a template id from context.templates.' },
        afterId: { type: 'string', description: 'add_section: put it after this section (optional).' },
        toIndex: { type: 'number', description: 'move_section: new position, 0-based.' },
        variant: { type: 'string', enum: ['light', 'tinted', 'dark'] },
        itemIndex: { type: 'number', description: 'place_clip: which image spot in the section (optional; defaults to the spot she is pointing at or the first empty one). For the case study header image use sectionId "hero".' },
        mode: { type: 'string', enum: ['canvas', 'preview', 'present'] },
      } } },
    } },
  };
  const system = `You are Miso, a small helpful cat living in Katelyn's case study editor. She talks to you out loud while she works, so requests can be rough ("um", run-ons). Do exactly what she asked, nothing more. context.history is the recent conversation, oldest first; use it to understand follow-ups ("no, the other one", "yeah put that there"). When context.ambient is true you are overhearing everything she says: she may be thinking aloud, talking to someone else or reading text. Act only on clear requests about her case study, the studio or the frame she brought from Figma. If she's just thinking aloud or it's unclear she means you, return no actions and an empty say. Never chime in just to agree. Questions to you are for you, even in ambient mode ("hey, how's the title looking?", "is this subtitle too long?", "what do you think of this section?", "which is better?"). Answer them in answer, as a senior product designer and design hiring manager reviewing her portfolio: honest and specific, about her actual words (context.header for the title, the small line above it, the subtitle and the details; context.sections for sections). Say what works, what a hiring manager would wonder about, and give 1–3 concrete rewrites in her voice (plain, short, sentence case, outcome first, no hype, never invented numbers). Keep say to a word or two ("Hmm, here's my take.") and change nothing unless she asks. If she then says to use one ("use the second one", "yeah do that"), apply it with set_text (sectionId "hero" with field "title", "summary" or "eyebrow" for the header) and give no answer, just a short say. But when she tells you what you two are about to do ("hey look, it's empty, let's go to Figma and fill it out"), that is for you even in ambient mode: set plan, and say in a few words what she should do next (e.g. "Okay. Click a frame in Figma and I'll put it in."). context.plan is the goal she set earlier; keep working toward it across messages and tabs. When context.event is "figma_pick" she just clicked a frame in Figma (context.clip is that frame). If context.plan says to put frames in as she picks them, use place_clip to put it in the best empty image spot (match the frame name to section titles; the hero first if heroHasImage is false; items with hasImage false are empty) and say where in a few words ("Put it in the hero."). Otherwise return no actions and an empty say (she will tell you what to make with it). When an image is attached it is the frame she picked (context.clip). Use what you see to build what she asks: read its headings and copy, add fitting sections from context.templates (in the same reply, refer to sections you add as "new1", "new2"… in order, in set_text, place_clip and afterId), write their text from what is actually visible in the frame, and place the frame with place_clip. Never invent numbers, quotes or results that are not in the frame; leave those for her. context.clip may come from any website, not only Figma (context.clip.site, context.clip.url, context.clip.pageTitle): an App Store or Play Store page, a competitor's site, Lucid, an article. context.clip.text is the exact text inside what she circled. When you quote it (reviews, what people are saying, competitor claims), copy the words exactly, trimming only with "…", and say where they came from in the item's detail (for example "App Store review" or "Competitor site: " plus the site). Never write a quote, rating, review count or claim that is not in context.clip.text or visible in the image. Reviews and quotes fit a quotes or insights section; another product's screens and claims fit a competitors, positioning or feature comparison section. When context.event is "frame_brief", she picked this frame and then talked about it; KATELYN SAID is everything she said, in order (lines starting "(then she said:)" are her answers or changes after your last plan; follow them). Choose the one best section for this frame and what she wants to say: a single polished or final screen → a screen focus section, or an annotated screen when she points out specific details or decisions; a before and after → a flow or screen comparison; several screens or states → a screen gallery or strip; a phone or site to scroll → a scrolling site; research, diagrams or charts → the matching research or numbers section. Use only templates in context.templates. Put it where it belongs in the story (afterId), write its title and text from her words (tidied, short, in her voice), and place the frame. If one choice would really change the result (for example whether she wants annotations, and which details they should point at), ask that one short question in say and return no actions. Otherwise return all the actions, and in say describe the plan in one short sentence that ends with a question, like "I’ll add an annotated screen after the problem, with your three notes. Okay?" She will say okay or tell you what to change. "This"/"it"/"here" means context.target (what she circled or selected); otherwise context.selectedId. context.clip is a screen she brought from Figma; use place_clip when she says to put it somewhere ("hero", "header" or "cover" means sectionId "hero"). If context.fromAnotherTab is true she is looking at Figma, not the studio, so decide the spot from her words and the section titles; if it's unclear, ask which section. If she names a different case study than context.studyTitle, say she needs to open that one in the studio first. Use only section ids, item indexes and template ids that exist in the context. Deleting is allowed only if she clearly asked. Keep text edits in her voice: plain, short, sentence case. Never invent metrics, quotes or results; if something needs facts you don't have, ask. Always respond by calling studio_actions.`;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('CLAUDE_ASSIST_MODEL') || 'claude-haiku-5-5', max_tokens: 3000, system, tools: [tool], tool_choice: { type: 'tool', name: 'studio_actions' }, messages: [{ role: 'user', content: [...(image ? [{ type: 'image', source: { type: 'base64', media_type: image.slice(5, image.indexOf(';')), data: image.slice(image.indexOf(',') + 1) } }] : []), { type: 'text', text: `CONTEXT:\n${ctx}\n\nKATELYN SAID: ${said}` }] }] }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ? `Claude: ${data.error.message}` : `Claude request failed (${response.status}).`);
  const use = (data.content ?? []).find((part: any) => part.type === 'tool_use');
  return use?.input ?? { say: 'Sorry, I missed that.', actions: [] };
}
