// Browser-facing Figma frame catalog. The caller supplies a short-lived-in-memory PAT.
const allowed = new Set(['https://kwolfley27.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']);

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://kwolfley27.github.io',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-figma-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  if (origin && !allowed.has(origin)) return reply({ error: 'Origin not allowed.' }, 403);

  try {
    const token = request.headers.get('x-figma-token') || '';
    if (!token || token.length > 512) return reply({ error: 'Add a Figma personal access token with file_content:read.' }, 400);
    const body = await request.json();
    const sourceUrl = new URL(body.sourceUrl);
    const match = sourceUrl.pathname.match(/^\/(?:design|file)\/([a-zA-Z0-9]+)(?:\/|$)/);
    const nodeId = sourceUrl.searchParams.get('node-id')?.replace(/-/g, ':');
    if (sourceUrl.protocol !== 'https:' || !['figma.com', 'www.figma.com'].includes(sourceUrl.hostname) || !match || !/^\d+:\d+$/.test(nodeId || '')) return reply({ error: 'Use a Figma design page link with a node-id.' }, 400);
    const fileKey = match[1];
    const api = async (path: string) => {
      const response = await fetch(`https://api.figma.com/v1/${path}`, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(response.status === 403 ? 'Figma access denied. Check token scope and file access.' : response.status === 429 ? 'Figma rate limit reached. Try again later.' : `Figma request failed (${response.status}).`);
      return response.json();
    };
    const data = await api(`files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`);
    const root = data.nodes?.[nodeId]?.document;
    if (!root) return reply({ error: 'Page or frame not found.' }, 404);
    const frames: Array<{ id: string; name: string; group: string; width: number; height: number }> = [];
    const walk = (node: any, group = '') => {
      if (node.visible === false) return;
      const box = node.absoluteBoundingBox;
      if (['FRAME', 'COMPONENT', 'INSTANCE'].includes(node.type) && box && box.width >= 200 && box.width <= 700 && box.height / box.width >= 1.3 && box.height / box.width <= 3.5) {
        frames.push({ id: node.id, name: node.name, group, width: box.width, height: box.height });
        return;
      }
      for (const child of node.children || []) walk(child, ['SECTION', 'FRAME'].includes(node.type) ? node.name : group);
    };
    walk(root);
    if (!frames.length) return reply({ error: 'No phone-sized frames found on this page.' }, 404);
    const ids: string[] = body.ids === undefined ? frames.slice(0, 40).map(frame => frame.id) : body.ids;
    if (!Array.isArray(ids) || ids.length > 40 || ids.some(id => typeof id !== 'string')) return reply({ error: 'Choose up to 40 frame IDs.' }, 400);
    const allowedIds = new Set(frames.map(frame => frame.id));
    const found = ids.filter(id => allowedIds.has(id));
    const renders = found.length ? await api(`images/${fileKey}?ids=${encodeURIComponent(found.join(','))}&format=png&scale=2`) : { images: {} };
    return reply({ fileKey, nodeId, url: `https://www.figma.com/design/${fileKey}?node-id=${nodeId.replace(':', '-')}`, fileName: data.name || 'Figma file', importedAt: new Date().toISOString(), mode: 'live', frames: frames.filter(frame => found.includes(frame.id)).map(frame => ({ ...frame, image: renders.images?.[frame.id] || null })), missing: ids.filter(id => !allowedIds.has(id)), truncated: body.ids === undefined && frames.length > 40 });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Unable to import Figma frames.' }, 400);
  }
});
