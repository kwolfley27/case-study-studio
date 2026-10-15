import { useState } from 'react';
import { figmaStatus, getFigmaToken, setFigmaToken } from './ImageSlots';
import type { AffinityData } from './AffinityDiagram';

/*
  Pull sticky notes from a FigJam board into the affinity diagram.
  One Figma API request per pull (fits a View seat's small monthly allowance).
  FigJam sections become the structure: the outer section is the area of concern, a section inside it
  the issue, and the section a sticky sits in the cluster. Stickies outside any section go to the notes still to sort.
*/
const LINK = /figma\.com\/(?:board|file|design)\/([a-zA-Z0-9]+)[^?#]*(?:\?[^#]*node-id=([0-9]+[-:][0-9]+))?/;
type Sticky = { text: string; color: string; path: string[] };
const COLOR_NAMES: Array<[string, [number, number, number]]> = [['Yellow', [1, .85, .4]], ['Pink', [1, .7, .75]], ['Red', [1, .5, .45]], ['Orange', [1, .7, .4]], ['Green', [.6, .85, .6]], ['Blue', [.6, .75, 1]], ['Teal', [.5, .85, .85]], ['Purple', [.75, .65, 1]], ['Grey', [.85, .85, .85]]];
function colorName(c?: { r: number; g: number; b: number }) {
  if (!c) return 'Notes';
  let best = 'Notes', d = Infinity;
  for (const [name, [r, g, b]] of COLOR_NAMES) { const x = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2; if (x < d) { d = x; best = name; } }
  return best;
}
type FNode = { type: string; name?: string; characters?: string; fills?: Array<{ color?: { r: number; g: number; b: number } }>; children?: FNode[] };
function walk(node: FNode, path: string[], out: Sticky[]) {
  if (node.type === 'STICKY') { const text = (node.characters ?? '').trim(); if (text) out.push({ text, color: colorName(node.fills?.[0]?.color), path }); return; }
  const next = node.type === 'SECTION' && node.name?.trim() ? [...path, node.name.trim()] : path;
  node.children?.forEach(ch => walk(ch, next, out));
}

export function stickiesToAffinity(stickies: Sticky[]): AffinityData {
  const groups: AffinityData['groups'] = []; const unsorted: string[] = [];
  const find = <T extends { title: string }>(list: T[], title: string, make: () => T) => list.find(x => x.title === title) ?? (list.push(make()), list[list.length - 1]);
  for (const s of stickies) {
    if (!s.path.length) { unsorted.push(s.text); continue; } // outside any section: left in Notes to sort
    const g = s.path[0];
    const i = s.path.length >= 3 ? s.path[1] : s.path[0];
    const a = s.path[s.path.length - 1];
    const group = find(groups, g, () => ({ title: g, issues: [] }));
    const issue = find(group.issues, i, () => ({ title: i, aspects: [] }));
    const aspect = find(issue.aspects, a, () => ({ title: a, notes: [] }));
    aspect.notes.push(s.text);
  }
  return { groups, unsorted };
}

export function FigJamPull({ onImport }: { onImport: (data: AffinityData, count: number) => void }) {
  const [link, setLink] = useState('');
  const [token, setToken] = useState(getFigmaToken());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const run = async () => {
    const m = link.trim().match(LINK);
    if (!m) { setNote({ text: 'Paste a FigJam board link (figma.com/board/…). A link to one section works too: right-click it → Copy link to selection.', error: true }); return; }
    if (token.trim()) setFigmaToken(token);
    if (!getFigmaToken()) { setNote({ text: 'Add your Figma access token first.', error: true }); return; }
    setBusy(true); setNote(null);
    try {
      const [, key, rawId] = m; const id = rawId?.replace('-', ':');
      const r = await fetch(id ? `https://api.figma.com/v1/files/${key}/nodes?ids=${encodeURIComponent(id)}` : `https://api.figma.com/v1/files/${key}`, { headers: { 'X-Figma-Token': getFigmaToken() } });
      figmaStatus(r.status);
      const data = await r.json();
      const root: FNode | undefined = id ? data.nodes?.[id]?.document : data.document;
      if (!root) throw new Error('Figma didn’t return that board or section.');
      const stickies: Sticky[] = []; walk(root, [], stickies);
      if (!stickies.length) throw new Error('No sticky notes found there. Check the link points at the board or a section with stickies.');
      if (!window.confirm(`Replace this diagram with ${stickies.length} sticky notes from FigJam?`)) { setBusy(false); return; }
      onImport(stickiesToAffinity(stickies), stickies.length);
      setNote({ text: `Brought in ${stickies.length} sticky notes. Pull again any time the board changes.` });
    } catch (e) { setNote({ text: e instanceof Error ? e.message : 'Could not read the board.', error: true }); }
    finally { setBusy(false); }
  };
  return <div className="csb-figjam">
    <p className="csb-panel-kicker">Pull from FigJam</p>
    <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.figma.com/board/…" aria-label="FigJam board link" />
    {!getFigmaToken() && <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Figma access token" aria-label="Figma personal access token" />}
    <button type="button" className="csb-quiet-button" disabled={busy || !link.trim()} onClick={() => void run()}>{busy ? 'Reading the board…' : 'Pull sticky notes'}</button>
    {note && <p className={`csb-field-note ${note.error ? 'is-error' : ''}`}>{note.text}</p>}
    <p className="csb-field-note">FigJam sections become your clusters (a section inside a section becomes the issue above it). Stickies outside any section land in Notes to sort. Uses one Figma request.</p>
  </div>;
}
