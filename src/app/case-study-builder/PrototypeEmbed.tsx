import { useRef, useState } from 'react';
import { getFigmaToken, setFigmaToken } from './ImageSlots';
import { MousePointerClick, Play, RotateCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useReducedMotion } from './MotionKit';
import { EditableText } from './EditableText';
import type { CaseStudySection } from './model';

/*
  Interactive Figma prototype, embedded in a device frame.
  Accepts a prototype link (figma.com/proto/…) or a design link (view only).
  The iframe loads only after a visitor presses "Try the prototype", which keeps
  the case study fast. Visitors need view access: in Figma, Share → anyone with
  the link can view.
*/

const FIGMA_LINK = /figma\.com\/(proto|design|file)\/([a-zA-Z0-9]+)(?:\/([^?#]*))?(?:\?([^#]*))?/;

export function figmaEmbedUrl(link: string, hideUi = true, bg?: string): string | null {
  const match = link.trim().match(FIGMA_LINK);
  if (!match) return null;
  const [, type, key, name = 'Prototype', query = ''] = match;
  const source = new URLSearchParams(query);
  const params = new URLSearchParams();
  for (const name of ['node-id', 'starting-point-node-id', 'page-id']) { const value = source.get(name); if (value) params.set(name, value); }
  // "contain" fills the device screen (share links usually carry scale-down,
  // which leaves black bars); the screen itself is sized to the frame.
  params.set('scaling', 'contain');
  params.set('content-scaling', 'fixed');
  if (bg) params.set('bg-color', bg.replace('#', ''));
  params.set('embed-host', 'case-study-studio');
  if (hideUi) { params.set('hide-ui', '1'); params.set('footer', 'false'); }
  const kind = type === 'proto' ? 'proto' : 'design';
  return `https://embed.figma.com/${kind}/${key}/${encodeURIComponent(decodeURIComponent(name))}?${params.toString()}`;
}

type Proto = NonNullable<CaseStudySection['prototype']>;
export const SCREEN_PRESETS: Array<[string, number, number]> = [
  ['iPhone 16 / 15', 393, 852], ['iPhone 16 Pro Max', 440, 956], ['iPhone SE', 375, 667], ['Android', 412, 915],
  ['iPad', 820, 1180], ['Laptop', 1440, 900], ['Desktop', 1920, 1080],
];
export const defaultSize = (device: Proto['device']) => device === 'laptop' ? { w: 1440, h: 900 } : { w: 393, h: 852 };

/* Read the prototype's starting frame size from Figma (needs a token, kept in memory only). */
export async function detectFrameSize(link: string, token = getFigmaToken()): Promise<{ w: number; h: number }> {
  const match = link.trim().match(FIGMA_LINK);
  if (!match) throw new Error('That is not a Figma link.');
  if (!token) throw new Error('Add a Figma access token to detect the size.');
  const query = new URLSearchParams(match[4] || '');
  const node = (query.get('starting-point-node-id') || query.get('node-id') || '').replace('-', ':');
  if (!node) throw new Error('The link has no frame in it. Pick the size below instead.');
  const response = await fetch(`https://api.figma.com/v1/files/${match[2]}/nodes?ids=${encodeURIComponent(node)}&depth=1`, { headers: { 'X-Figma-Token': token } });
  if (response.status === 403) throw new Error('Figma said no access. Check the token and that it can open this file.');
  if (!response.ok) throw new Error(`Figma request failed (${response.status}).`);
  const data = await response.json();
  const box = data.nodes?.[node]?.document?.absoluteBoundingBox;
  if (!box?.width || !box?.height) throw new Error('Figma did not return a frame size for that link.');
  return { w: Math.round(box.width), h: Math.round(box.height) };
}

const toHex = (color: string) => { const m = color.match(/\d+(\.\d+)?/g); if (!m || m.length < 3) return undefined; return m.slice(0, 3).map(v => Math.round(Number(v)).toString(16).padStart(2, '0')).join(''); };

export function PrototypeEmbed({ section, editorMode, onSetLink }: { section: CaseStudySection; editorMode: boolean; onSetLink?: (sectionId: string, link: string, extra?: Partial<Proto>) => void }) {
  const reduce = useReducedMotion();
  const link = section.prototype?.url || '';
  const device = section.prototype?.device || 'phone';
  const size = section.prototype?.size ?? defaultSize(device);
  const screenRef = useRef<HTMLDivElement>(null);
  const [bg, setBg] = useState<string>();
  const embed = link ? figmaEmbedUrl(link, section.prototype?.hideUi !== false, bg) : null;
  const isDesign = /figma\.com\/(design|file)\//.test(link);
  const [playing, setPlaying] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!figmaEmbedUrl(draft)) { setError('Paste a Figma prototype link. In Figma: Present → Share prototype → Copy link.'); return; }
    const url = draft.trim();
    setError(''); onSetLink?.(section.id, url); setDraft(''); setPlaying(false);
    // Match the device screen to the prototype's frame when Figma can tell us its size.
    if (getFigmaToken()) detectFrameSize(url).then(found => onSetLink?.(section.id, url, { size: found, device: found.w > found.h ? 'laptop' : 'phone' })).catch(() => undefined);
  };

  return <motion.div className={`csb-proto csb-proto-${device}`} style={{ '--proto-ar': `${size.w} / ${size.h}`, '--proto-arn': size.w / size.h } as React.CSSProperties} initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .8, ease: [0.22, 1, 0.36, 1] }}>
    <div className="csb-proto-device">
      {device === 'phone' && <span className="csb-proto-island" aria-hidden="true" />}
      {device === 'laptop' && <div className="csb-proto-bar" aria-hidden="true"><i /><i /><i /></div>}
      <div className="csb-proto-screen" ref={screenRef}>
        {embed && playing
          ? <iframe key={reloadKey} src={embed} title={`${section.title} — interactive Figma prototype`} allowFullScreen loading="lazy" style={{ transform: `scale(${section.prototype?.zoom ?? 1})` }} />
          : embed
            ? <button type="button" className="csb-proto-poster" onClick={event => { event.stopPropagation(); if (screenRef.current) setBg(toHex(getComputedStyle(screenRef.current).backgroundColor)); setPlaying(true); }}>
                <span className="csb-proto-play"><Play size={22} fill="currentColor" /></span>
                <strong>{isDesign ? 'View the design' : 'Try the prototype'}</strong>
                <small>{isDesign ? 'Opens the Figma file in place' : 'Click through the real flow'}</small>
              </button>
            : editorMode
              ? <form className="csb-proto-empty" onSubmit={submit} onClick={event => event.stopPropagation()}>
                  <MousePointerClick size={26} strokeWidth={1.4} />
                  <strong>Add a clickable Figma prototype</strong>
                  <span>In Figma: Present → Share prototype → Copy link</span>
                  <input value={draft} onChange={event => setDraft(event.target.value)} placeholder="https://www.figma.com/proto/…" aria-label="Figma prototype link" />
                  <button type="submit" className="csb-primary-button" disabled={!draft.trim()}>Embed prototype</button>
                  {error && <em role="alert">{error}</em>}
                  <small>Visitors need view access: Share → Anyone with the link can view.</small>
                </form>
              : <div className="csb-proto-empty" aria-hidden="true" />}
      </div>
    </div>
    {embed && <div className="csb-proto-tools">
      {playing && <button type="button" onClick={event => { event.stopPropagation(); setReloadKey(key => key + 1); }}><RotateCw size={13} /> Restart</button>}
      <a href={link} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>Open in Figma ↗</a>
      {editorMode && <button type="button" onClick={event => { event.stopPropagation(); onSetLink?.(section.id, ''); setPlaying(false); }}>Change link</button>}
    </div>}
    {(editorMode || section.items[0]?.detail) && <p className="csb-proto-caption"><EditableText field="items.0.detail" value={section.items[0]?.detail || ''} /></p>}
  </motion.div>;
}

/* Inspector controls: screen size (auto from Figma, a preset, or custom). */
export function PrototypeControls({ section, onChange }: { section: CaseStudySection; onChange: (next: Proto) => void }) {
  const proto: Proto = section.prototype ?? { url: '', device: 'phone', hideUi: true };
  const size = proto.size ?? defaultSize(proto.device);
  const [token, setToken] = useState(getFigmaToken());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const preset = SCREEN_PRESETS.find(([, w, h]) => w === size.w && h === size.h);
  const set = (patch: Partial<Proto>) => onChange({ ...proto, ...patch });
  const setSize = (w: number, h: number) => set({ size: { w, h }, device: w > h ? 'laptop' : proto.device === 'laptop' && h > w ? 'phone' : proto.device });
  const detect = async () => {
    if (token.trim()) setFigmaToken(token);
    setBusy(true); setNote(null);
    try { const found = await detectFrameSize(proto.url, token.trim()); set({ size: found, device: found.w > found.h ? 'laptop' : 'phone' }); setNote({ text: `Matched the frame: ${found.w} × ${found.h}` }); }
    catch (error) { setNote({ text: error instanceof Error ? error.message : 'Could not read the frame size.', error: true }); }
    finally { setBusy(false); }
  };
  return <>
    <div className="csb-field"><label htmlFor="csb-proto-device">Device frame</label><select id="csb-proto-device" value={proto.device} onChange={event => set({ device: event.target.value as Proto['device'] })}><option value="phone">Phone</option><option value="laptop">Laptop / browser</option></select></div>
    <div className="csb-field"><label htmlFor="csb-proto-size">Screen size</label>
      <select id="csb-proto-size" value={preset ? preset[0] : 'custom'} onChange={event => { const p = SCREEN_PRESETS.find(([name]) => name === event.target.value); if (p) setSize(p[1], p[2]); }}>
        {SCREEN_PRESETS.map(([name, w, h]) => <option key={name} value={name}>{name} · {w}×{h}</option>)}
        <option value="custom">Custom</option>
      </select>
      <div className="csb-proto-size-row">
        <input type="number" min={100} max={4000} aria-label="Frame width" value={size.w} onChange={event => setSize(Math.max(100, Number(event.target.value) || size.w), size.h)} /><span>×</span>
        <input type="number" min={100} max={6000} aria-label="Frame height" value={size.h} onChange={event => setSize(size.w, Math.max(100, Number(event.target.value) || size.h))} />
      </div>
      <span className="csb-field-note">Use your Figma frame's size so the prototype fills the screen with no empty bars.</span>
    </div>
    {proto.url && <div className="csb-field">
      {!getFigmaToken() && <input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="Figma access token (kept in this tab only)" aria-label="Figma access token" />}
      <button type="button" className="csb-quiet-button" disabled={busy || (!getFigmaToken() && !token.trim())} onClick={() => void detect()}>{busy ? 'Reading Figma…' : 'Match size from Figma'}</button>
      {note && <span className={`csb-field-note ${note.error ? 'is-error' : ''}`} role="status">{note.text}</span>}
    </div>}
    <div className="csb-layout-control"><div className="csb-layout-label"><span>Zoom to fill</span><output>{Math.round((proto.zoom ?? 1) * 100)}%</output></div><input type="range" min={100} max={220} step={1} value={Math.round((proto.zoom ?? 1) * 100)} onChange={e => set({ zoom: Number(e.target.value) / 100 })} aria-label="Zoom the prototype to fill the screen" /><span className="csb-field-note">Figma adds its own margin inside the embed. Press Try the prototype, then slide until your design touches the screen edges.</span></div>
    <label className="csb-check-field"><input type="checkbox" checked={proto.hideUi !== false} onChange={event => set({ hideUi: event.target.checked })} /> Hide Figma's toolbar</label>
    <p className="csb-field-note">Visitors need view access to the file: in Figma, Share → Anyone with the link can view. Paste or change the link on the page.</p>
  </>;
}
