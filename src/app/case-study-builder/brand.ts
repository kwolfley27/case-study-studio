/*
  Brand styles: a small set of design tokens a case study is painted with.
  Can be filled from a Figma frame, an image of a style guide, or a tokens
  file (JSON from Tokens Studio / Figma variables export, or CSS variables).
*/

export type Brand = {
  ink: string;        // headlines and strong text
  body: string;       // paragraph text
  paper: string;      // page background
  surface: string;    // cards and tinted sections
  display: string;    // headline font family ('' = page style default)
  text: string;       // body font family ('' = page style default)
  weight: 300 | 400 | 600;
  radius: 'sharp' | 'soft' | 'round';
};
export type SavedBrand = Brand & { id: string; name: string; accent: string; accent2?: string; theme?: 'editorial' | 'classic' };

export const defaultBrand: Brand = { ink: '#0f0e0d', body: '#777169', paper: '#fdfcfc', surface: '#f5f3f1', display: '', text: '', weight: 300, radius: 'soft' };
export const radii = { sharp: '6px', soft: '16px', round: '28px' } as const;

export const fontChoices = ['Inter', 'DM Sans', 'Manrope', 'Plus Jakarta Sans', 'Work Sans', 'IBM Plex Sans', 'Space Grotesk', 'Sora', 'Outfit', 'Bricolage Grotesque', 'Syne', 'Fraunces', 'Instrument Serif', 'Playfair Display', 'Newsreader', 'Source Serif 4', 'Lora', 'Libre Caslon Text'];

/* ── fonts ─────────────────────────────────────────────────────────── */
const systemFonts = new Set(['', 'system-ui', '-apple-system', 'sf pro', 'sf pro display', 'sf pro text', 'helvetica', 'helvetica neue', 'arial']);
export function loadFont(family: string) {
  const name = family.trim();
  if (systemFonts.has(name.toLowerCase()) || typeof document === 'undefined') return;
  const id = `csb-font-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}
export const fontStack = (family: string, serifish = false) => family ? `"${family}", ${serifish ? 'Georgia, serif' : 'ui-sans-serif, system-ui, sans-serif'}` : '';
const looksSerif = (family: string) => /serif|fraunces|playfair|newsreader|lora|caslon|garamond|georgia|times/i.test(family) && !/sans/i.test(family);

/* ── colour helpers ────────────────────────────────────────────────── */
export const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export function parseColor(value: string): string | null {
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) { let h = m[1]; if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join(''); return '#' + h.slice(0, 6).toLowerCase(); }
  m = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  if (m) return toHex(+m[1], +m[2], +m[3]);
  m = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%/i);
  if (m) { const [r, g, b] = hslToRgb(+m[1] / 360, +m[2] / 100, +m[3] / 100); return toHex(r, g, b); }
  return null;
}
function hslToRgb(h: number, s: number, l: number) {
  const f = (n: number) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}
export function hsl(hex: string) {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0; if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s, l };
}
export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (shift: number) => ((pa >> shift & 255) * (1 - t) + (pb >> shift & 255) * t);
  return toHex(c(16), c(8), c(0));
}
const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/* ── turn a bag of colours (+ optional names and fonts) into a brand ── */
export type Swatch = { hex: string; weight: number; name?: string; text?: boolean };
export type Suggestion = { brand: Partial<Brand>; accent?: string; accent2?: string; palette: string[] };

export function suggestBrand(swatches: Swatch[], fonts: Array<{ family: string; size?: number; weight?: number; count?: number }> = []): Suggestion {
  const merged = new Map<string, Swatch>();
  for (const s of swatches) { const hex = parseColor(s.hex); if (!hex) continue; const prev = merged.get(hex); merged.set(hex, prev ? { ...prev, weight: prev.weight + s.weight, name: prev.name || s.name, text: prev.text || s.text } : { ...s, hex }); }
  const all = [...merged.values()].sort((a, b) => b.weight - a.weight);
  const named = (re: RegExp) => all.find(s => s.name && re.test(s.name));
  const info = all.map(s => ({ ...s, ...hsl(s.hex) }));
  const lights = info.filter(c => c.l > 0.9);
  const darks = info.filter(c => c.l < 0.28);
  const greys = info.filter(c => c.s < 0.18 && c.l >= 0.3 && c.l <= 0.72);
  const vivid = info.filter(c => c.s > 0.3 && c.l > 0.22 && c.l < 0.8);
  const accent = named(/primary|brand|accent(?!.*2)|main/i)?.hex ?? vivid[0]?.hex;
  const accentInfo = accent ? hsl(accent) : null;
  const accent2 = named(/secondary|accent.?2|tertiary/i)?.hex ?? vivid.find(c => c.hex !== accent && (!accentInfo || hueGap(c.h, accentInfo.h) > 28))?.hex;
  const paper = named(/background|^bg|canvas|paper|base|page/i)?.hex ?? lights[0]?.hex;
  const surface = named(/surface|card|subtle.?bg|muted.?bg|neutral.?(50|100)/i)?.hex ?? lights.find(c => c.hex !== paper)?.hex ?? (paper ? mix(paper, darks[0]?.hex ?? '#000000', 0.035) : undefined);
  const ink = named(/^(text|ink|foreground|fg|heading|primary.?text)$|text.?primary|neutral.?900/i)?.hex ?? (darks.find(c => c.text) ?? darks[0])?.hex;
  const body = named(/text.?secondary|body|muted|subtle.?text|neutral.?(500|600)/i)?.hex ?? (greys.find(c => c.text) ?? greys[0])?.hex ?? (ink && paper ? mix(ink, paper, 0.45) : undefined);

  const brand: Partial<Brand> = {};
  if (ink) brand.ink = ink; if (body) brand.body = body; if (paper) brand.paper = paper; if (surface) brand.surface = surface;
  if (fonts.length) {
    const byFamily = new Map<string, { size: number; count: number; weight: number }>();
    for (const f of fonts) { const k = f.family.trim(); if (!k) continue; const prev = byFamily.get(k); byFamily.set(k, { size: Math.max(prev?.size ?? 0, f.size ?? 16), count: (prev?.count ?? 0) + (f.count ?? 1), weight: f.size && f.size >= 28 ? f.weight ?? prev?.weight ?? 400 : prev?.weight ?? f.weight ?? 400 }); }
    const families = [...byFamily.entries()];
    const display = families.sort((a, b) => b[1].size - a[1].size)[0];
    const text = [...byFamily.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    if (display) { brand.display = display[0]; const w = display[1].weight; brand.weight = w <= 350 ? 300 : w >= 550 ? 600 : 400; }
    if (text) brand.text = text[0];
  }
  return { brand, accent, accent2, palette: all.slice(0, 12).map(s => s.hex) };
}

/* ── image → palette (for screenshots of a style guide or design) ──── */
export async function paletteFromImage(file: Blob): Promise<Swatch[]> {
  const bitmap = await createImageBitmap(file);
  const w = 160, h = Math.max(1, Math.round(bitmap.height * 160 / bitmap.width));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); if (!ctx) return [];
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
    const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    cur.r += r; cur.g += g; cur.b += b; cur.n++; buckets.set(key, cur);
  }
  // merge near-identical buckets
  const raw = [...buckets.values()].map(v => ({ hex: toHex(v.r / v.n, v.g / v.n, v.b / v.n), weight: v.n })).sort((a, b) => b.weight - a.weight);
  const out: Swatch[] = [];
  for (const c of raw) {
    const near = out.find(o => { const a = parseInt(o.hex.slice(1), 16), b = parseInt(c.hex.slice(1), 16); return Math.abs((a >> 16) - (b >> 16)) + Math.abs((a >> 8 & 255) - (b >> 8 & 255)) + Math.abs((a & 255) - (b & 255)) < 42; });
    if (near) near.weight += c.weight; else out.push({ ...c });
    if (out.length > 40) break;
  }
  // vivid colours are usually small in area but matter most: boost them
  return out.map(s => { const { s: sat, l } = hsl(s.hex); return { ...s, weight: sat > 0.3 && l > 0.2 && l < 0.85 ? s.weight * 6 : s.weight }; });
}

/* ── tokens file (JSON or CSS variables) ───────────────────────────── */
export function parseTokensFile(text: string): { swatches: Swatch[]; fonts: Array<{ family: string; size?: number; count?: number }> } {
  const swatches: Swatch[] = []; const fonts: Array<{ family: string; size?: number; count?: number }> = [];
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let json: unknown; try { json = JSON.parse(trimmed); } catch { throw new Error('That JSON file could not be read.'); }
    const walk = (node: unknown, path: string[]) => {
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      const value = obj.$value ?? obj.value; const type = String(obj.$type ?? obj.type ?? '');
      if (value !== undefined && (typeof value === 'string' || typeof value === 'object')) {
        const name = path.join('/');
        if (typeof value === 'string' && (type === 'color' || parseColor(value))) { const hex = parseColor(value); if (hex) swatches.push({ hex, weight: 1, name }); }
        if (/fontFamil/i.test(type) || /font.?famil/i.test(name)) { const fam = Array.isArray(value) ? String(value[0]) : typeof value === 'string' ? value.split(',')[0].replace(/["']/g, '') : ''; if (fam) fonts.push({ family: fam, size: /display|heading|title|h1/i.test(name) ? 48 : 16 }); }
        if (type === 'typography' && typeof value === 'object' && value) { const v = value as Record<string, unknown>; const fam = String(v.fontFamily ?? '').split(',')[0].replace(/["']/g, ''); if (fam) fonts.push({ family: fam, size: Number(String(v.fontSize ?? '16').replace(/[^\d.]/g, '')) || 16 }); }
        return;
      }
      for (const [k, v] of Object.entries(obj)) if (!k.startsWith('$')) walk(v, [...path, k]);
    };
    walk(json, []);
  } else {
    for (const m of trimmed.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      const [, name, value] = m; const hex = parseColor(value);
      if (hex) swatches.push({ hex, weight: 1, name });
      else if (/font/i.test(name) && !/size|weight|height/i.test(name)) { const fam = value.split(',')[0].replace(/["']/g, '').trim(); if (fam && !/^var\(/.test(fam)) fonts.push({ family: fam, size: /display|heading|title/i.test(name) ? 48 : 16 }); }
    }
  }
  if (!swatches.length && !fonts.length) throw new Error('No colours or fonts found in that file.');
  return { swatches, fonts };
}

/* ── Figma: read fills and text styles from a frame (or the first page) ── */
export async function brandFromFigma(link: string, token: string): Promise<{ swatches: Swatch[]; fonts: Array<{ family: string; size?: number; weight?: number; count?: number }> }> {
  const m = link.match(/figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)[^?#]*(?:\?[^#]*node-id=([0-9]+[-:][0-9]+))?/);
  if (!m) throw new Error('Paste a Figma file or frame link.');
  const [, key, rawNode] = m;
  const get = async (path: string) => { const r = await fetch(`https://api.figma.com/v1/${path}`, { headers: { 'X-Figma-Token': token } }); if (r.status === 403) throw new Error('Figma said no access. Check the token and that it can open this file.'); if (!r.ok) throw new Error(`Figma request failed (${r.status}).`); return r.json(); };
  const swatches: Swatch[] = []; const fonts: Array<{ family: string; size?: number; weight?: number; count?: number }> = [];

  // Figma variables (paid plans) give the cleanest tokens; ignore if unavailable.
  try {
    const vars = await get(`files/${key}/variables/local`);
    const collections = vars?.meta?.variables ? Object.values(vars.meta.variables) as Array<{ name: string; resolvedType: string; valuesByMode: Record<string, { r: number; g: number; b: number } | unknown> }> : [];
    for (const v of collections) if (v.resolvedType === 'COLOR') { const c = Object.values(v.valuesByMode)[0] as { r?: number; g?: number; b?: number }; if (c && typeof c.r === 'number') swatches.push({ hex: toHex(c.r * 255, (c.g ?? 0) * 255, (c.b ?? 0) * 255), weight: 4, name: v.name }); }
  } catch { /* not available on this plan */ }

  let ids = rawNode ? [rawNode.replace('-', ':')] : [];
  if (!ids.length) { const file = await get(`files/${key}?depth=2`); ids = (file.document?.children?.[0]?.children ?? []).slice(0, 4).map((n: { id: string }) => n.id); }
  if (ids.length) {
    const data = await get(`files/${key}/nodes?ids=${encodeURIComponent(ids.join(','))}`);
    const styleNames: Record<string, string> = {};
    for (const n of Object.values(data.nodes ?? {}) as Array<{ styles?: Record<string, { name: string }> }>) for (const [id, st] of Object.entries(n?.styles ?? {})) styleNames[id] = st.name;
    const walk = (node: any) => {
      if (!node || node.visible === false) return;
      const area = Math.max(1, (node.absoluteBoundingBox?.width ?? 10) * (node.absoluteBoundingBox?.height ?? 10));
      const isText = node.type === 'TEXT';
      for (const fill of node.fills ?? []) if (fill.type === 'SOLID' && fill.visible !== false && (fill.opacity ?? 1) > .5) {
        const c = fill.color; const name = node.styles?.fill ? styleNames[node.styles.fill] : undefined;
        swatches.push({ hex: toHex(c.r * 255, c.g * 255, c.b * 255), weight: isText ? 400 : Math.sqrt(area), name, text: isText });
      }
      if (isText && node.style?.fontFamily) fonts.push({ family: node.style.fontFamily, size: node.style.fontSize, weight: node.style.fontWeight, count: Math.max(1, (node.characters ?? '').length / 20) });
      for (const child of node.children ?? []) walk(child);
    };
    for (const n of Object.values(data.nodes ?? {}) as Array<{ document: unknown }>) walk(n?.document);
  }
  if (!swatches.length && !fonts.length) throw new Error('No colours or text found there. Try linking the frame that holds your colours and type.');
  return { swatches, fonts };
}

export const brandStyleVars = (brand?: Partial<Brand>): Record<string, string> => {
  if (!brand) return {};
  const v: Record<string, string> = {};
  if (brand.ink) Object.assign(v, { '--t-ink': brand.ink, '--csb-text': brand.ink, '--csb-ink': brand.ink, '--t-graphite': mix(brand.ink, brand.paper || '#ffffff', 0.25) });
  if (brand.body) Object.assign(v, { '--t-body': brand.body, '--csb-secondary': brand.body, '--csb-muted': brand.body, '--t-muted': mix(brand.body, brand.paper || '#ffffff', 0.3), '--t-dim': mix(brand.body, brand.paper || '#ffffff', 0.3) });
  if (brand.paper) Object.assign(v, { '--t-paper': brand.paper, '--csb-white': brand.paper });
  if (brand.surface) Object.assign(v, { '--t-surface': brand.surface, '--csb-gray': brand.surface });
  if (brand.ink && brand.paper) Object.assign(v, { '--t-line': mix(brand.paper, brand.ink, 0.1), '--t-line2': mix(brand.paper, brand.ink, 0.08), '--csb-rule': mix(brand.paper, brand.ink, 0.1), '--csb-line': mix(brand.paper, brand.ink, 0.08), '--t-night': mix(brand.ink, '#000000', 0.15) });
  if (brand.display) Object.assign(v, { '--brand-display': fontStack(brand.display, looksSerif(brand.display)), '--ed-display': fontStack(brand.display, looksSerif(brand.display)) });
  if (brand.text) v['--brand-body'] = fontStack(brand.text, looksSerif(brand.text));
  if (brand.weight) v['--brand-weight'] = String(brand.weight);
  if (brand.radius) v['--brand-radius'] = radii[brand.radius];
  return v;
};
