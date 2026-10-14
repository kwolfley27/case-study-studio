export function parseFigmaSource(value) {
  let url; try { url = new URL(value); } catch { throw new Error('Paste a valid Figma page link.'); }
  const match = url.pathname.match(/^\/(?:design|file)\/([a-zA-Z0-9]+)(?:\/|$)/);
  const nodeId = url.searchParams.get('node-id')?.replace(/-/g, ':');
  if (url.protocol !== 'https:' || !['figma.com', 'www.figma.com'].includes(url.hostname) || !match || !/^\d+:\d+$/.test(nodeId || '')) throw new Error('Use a Figma design page link with a node-id.');
  return { fileKey: match[1], nodeId, url: `https://www.figma.com/design/${match[1]}?node-id=${nodeId.replace(':','-')}` };
}
export function collectScreens(root) {
  const result = [];
  function walk(node, group = '') {
    if (node.visible === false) return;
    const b = node.absoluteBoundingBox;
    if (['FRAME','COMPONENT','INSTANCE'].includes(node.type) && b && b.width >= 200 && b.width <= 700 && b.height / b.width >= 1.3 && b.height / b.width <= 3.5) {
      result.push({ id:node.id, name:node.name, group, width:b.width, height:b.height }); return;
    }
    for (const child of node.children || []) walk(child, ['SECTION','FRAME'].includes(node.type) ? node.name : group);
  }
  walk(root); return result;
}
export async function loadFigmaSource({sourceUrl, token, ids}, fetcher = fetch) {
  const source = parseFigmaSource(sourceUrl);
  if (!token || token.length > 512) throw new Error('Enter a Figma personal access token with file_content:read access. Your file password is not an API token.');
  async function api(path) {
    const response = await fetcher('https://api.figma.com/v1/' + path, {headers:{'X-Figma-Token':token},signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(response.status === 429 ? 'Figma rate limit reached. Keep your current images and try again later.' : response.status === 403 ? 'Figma access denied. Check the token scope and access to this file.' : 'Figma could not load this source (' + response.status + ').');
    return response.json();
  }
  const data = await api(`files/${source.fileKey}/nodes?ids=${encodeURIComponent(source.nodeId)}`);
  const root = data.nodes?.[source.nodeId]?.document;
  if (!root) throw new Error('This page or frame no longer exists. Choose a new source link.');
  const frames = collectScreens(root);
  if (!frames.length) throw new Error('No phone-sized frames found on this page. Link a page containing your mobile screens.');
  const requested = ids === undefined ? frames.slice(0,40).map(f=>f.id) : ids;
  if (!Array.isArray(requested) || requested.length > 40 || requested.some(id=>typeof id!=='string')) throw new Error('Choose up to 40 frame IDs.');
  const allowed = new Set(frames.map(f=>f.id));
  const found = requested.filter(id=>allowed.has(id));
  const renders = found.length ? await api(`images/${source.fileKey}?ids=${encodeURIComponent(found.join(','))}&format=png&scale=2`) : {images:{}};
  return {...source,fileName:data.name || 'Figma file',lastModified:data.lastModified,importedAt:new Date().toISOString(),mode:'live',frames:frames.filter(f=>found.includes(f.id)).map(f=>({...f,image:renders.images?.[f.id] || null})),missing:requested.filter(id=>!allowed.has(id)),truncated:ids===undefined && frames.length>40};
}
