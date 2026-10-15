import { useContext, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { useReducedMotion } from './MotionKit';
import { downloadIntoDraft, getFigmaToken, setFigmaToken } from './ImageSlots';
import type { CaseStudySection } from './model';

/*
  Component showcase: a bento of soft panels, each holding one designed
  component at its real size (crisp, centred, lots of room).
  items: title (name), detail (optional caption), image, tileSize standard = half | wide = full,
         value "w,h" = the component's 1x size, so it shows at true size.
  Cards can be pulled straight from Figma frame or component links.
*/

type Item = CaseStudySection['items'][number];

function Card({ section, item, index, i }: { section: CaseStudySection; item: Item; index: number; i: number }) {
  const reduce = useReducedMotion();
  const { edit } = useContext(EditingContext);
  const [w] = (item.value || '').split(',').map(Number);
  const captions = section.options?.captions === true;
  return <motion.figure className={`csb-show-card is-${item.tileSize === 'wide' ? 'wide' : 'half'}`}
    initial={reduce ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ duration: .7, delay: (i % 2) * .08, ease: [0.22, 1, 0.36, 1] }}>
    <div className="csb-show-stage" data-image-slot={`${section.id}:${index}`}>
      {item.image
        ? <motion.img src={item.image} alt={item.title || 'Designed component'} style={w ? { width: `min(${w}px, 100%)` } : undefined} draggable={false}
            initial={reduce ? false : { scale: .97 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ duration: .9, ease: [0.22, 1, 0.36, 1] }} />
        : <div className="csb-show-empty"><strong>{edit ? 'Add a component' : ''}</strong>{edit && <span>Click to upload, or paste a Figma link</span>}</div>}
    </div>
    {(captions || (edit && captions)) && <figcaption><strong><EditableText field={`items.${index}.title`} value={item.title} /></strong>{(item.detail || edit) && <span><EditableText field={`items.${index}.detail`} value={item.detail} /></span>}</figcaption>}
  </motion.figure>;
}

export function ComponentShowcase({ section }: { section: CaseStudySection }) {
  return <div className="csb-show">{section.items.map((item, i) => <Card key={i} section={section} item={item} index={i} i={i} />)}</div>;
}

/* ---------- Figma import ---------- */
const LINK = /figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)[^?\s]*\?[^\s#]*?node-id=([0-9]+[-:][0-9]+)/;
async function fromFigma(link: string, token: string): Promise<Item> {
  const m = link.match(LINK); if (!m) throw new Error('Each link needs a node-id. In Figma, right-click the component → Copy link to selection.');
  const [, key, raw] = m; const id = raw.replace('-', ':');
  const get = async (path: string) => { const r = await fetch(`https://api.figma.com/v1/${path}`, { headers: { 'X-Figma-Token': token } }); if (r.status === 403) throw new Error('Figma said no access. Check the token and that it can open this file.'); if (!r.ok) throw new Error(`Figma request failed (${r.status}).`); return r.json(); };
  const [nodes, images] = await Promise.all([get(`files/${key}/nodes?ids=${encodeURIComponent(id)}&depth=1`), get(`images/${key}?ids=${encodeURIComponent(id)}&format=png&scale=2`)]);
  const doc = nodes.nodes?.[id]?.document; const box = doc?.absoluteBoundingBox;
  const url = images.images?.[id]; if (!url) throw new Error('Figma could not render that component.');
  let image = url as string; try { image = await downloadIntoDraft(url, 900_000, 2400); } catch { /* keep the link */ }
  return { title: doc?.name || 'Component', detail: '', image, frameId: id, tileSize: 'standard', value: box ? `${Math.round(box.width)},${Math.round(box.height)}` : '' };
}

export function ShowcaseControls({ section, onChange }: { section: CaseStudySection; onChange: (patch: Partial<CaseStudySection>) => void }) {
  const items = section.items;
  const setItems = (next: Item[]) => onChange({ items: next });
  const [links, setLinks] = useState('');
  const [token, setToken] = useState(getFigmaToken());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => { if (token) setFigmaToken(token); }, [token]);
  const importLinks = async () => {
    const list = links.split(/\s+/).map(l => l.trim()).filter(l => /figma\.com/.test(l));
    if (!list.length) { setNote({ text: 'Paste one or more Figma links, one per line.', error: true }); return; }
    if (!token.trim()) { setNote({ text: 'Add your Figma access token first.', error: true }); return; }
    const added: Item[] = []; const failed: string[] = [];
    for (let k = 0; k < list.length; k++) {
      setBusy(`Rendering ${k + 1} of ${list.length}…`);
      try { added.push(await fromFigma(list[k], token.trim())); } catch (error) { failed.push(error instanceof Error ? error.message : 'Failed'); }
    }
    setBusy(null);
    // Fill empty placeholder cards first, then add new ones.
    const next = [...items]; let a = 0;
    for (let k = 0; k < next.length && a < added.length; k++) if (!next[k].image) next[k] = { ...added[a++], tileSize: next[k].tileSize ?? 'standard' };
    while (a < added.length) next.push(added[a++]);
    setItems(next); setLinks('');
    setNote(failed.length ? { text: `Added ${added.length}. ${failed.length} failed: ${failed[0]}`, error: true } : { text: `Added ${added.length} component${added.length === 1 ? '' : 's'} at their real size.` });
  };
  const move = (i: number, j: number) => { const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; setItems(n); };
  return <div className="csb-items csb-sc-ctl">
    <p className="csb-panel-kicker">Add from Figma</p>
    <div className="csb-field">
      <textarea rows={3} value={links} onChange={e => setLinks(e.target.value)} placeholder={'Paste component links, one per line\nRight-click in Figma → Copy link to selection'} aria-label="Figma component links" />
      {!getFigmaToken() && <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Figma access token (kept in this tab only)" aria-label="Figma access token" />}
      <button type="button" className="csb-primary-button" disabled={!!busy} onClick={() => void importLinks()}>{busy ?? 'Add components'}</button>
      {note && <span className={`csb-field-note ${note.error ? 'is-error' : ''}`} role="status">{note.text}</span>}
    </div>
    <div className="csb-inspector-divider" />
    <p className="csb-panel-kicker">Cards · {items.length}</p>
    <ol>{items.map((it, i) => <li key={i} className="csb-sc-ctl-row">
      <span className="csb-sc-ctl-thumb is-wide">{it.image ? <img src={it.image} alt="" /> : null}</span>
      <span className="csb-sc-ctl-name"><strong>{it.title || `Card ${i + 1}`}</strong><span className="csb-show-size" role="group" aria-label="Card width">{(['standard', 'wide'] as const).map(sz => <button key={sz} type="button" aria-pressed={(it.tileSize ?? 'standard') === sz} onClick={() => setItems(items.map((x, n) => n === i ? { ...x, tileSize: sz } : x))}>{sz === 'wide' ? 'Full' : 'Half'}</button>)}</span></span>
      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></button>
      <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></button>
      <button type="button" aria-label={`Remove ${it.title || 'card'}`} onClick={() => setItems(items.filter((_, k) => k !== i))}><X size={13} /></button>
    </li>)}</ol>
    <button type="button" className="csb-items-add" onClick={() => setItems([...items, { title: 'Component', detail: '', image: '', tileSize: 'standard' }])}>+ Empty card</button>
    <label className="csb-check-field"><input type="checkbox" checked={section.options?.captions === true} onChange={e => onChange({ options: { ...(section.options ?? {}), captions: e.target.checked } })} /> Show names and captions</label>
    <p className="csb-field-note">You can also click any card on the page to upload an image or paste a single Figma link.</p>
  </div>;
}
