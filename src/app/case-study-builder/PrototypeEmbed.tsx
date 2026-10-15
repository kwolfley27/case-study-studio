import { useState } from 'react';
import { MousePointerClick, Play, RotateCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
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

export function figmaEmbedUrl(link: string, hideUi = true): string | null {
  const match = link.trim().match(FIGMA_LINK);
  if (!match) return null;
  const [, type, key, name = 'Prototype', query = ''] = match;
  const source = new URLSearchParams(query);
  const params = new URLSearchParams();
  for (const name of ['node-id', 'starting-point-node-id', 'page-id', 'scaling', 'content-scaling']) { const value = source.get(name); if (value) params.set(name, value); }
  if (!params.has('scaling')) params.set('scaling', 'scale-down');
  if (!params.has('content-scaling')) params.set('content-scaling', 'fixed');
  params.set('embed-host', 'case-study-studio');
  if (hideUi) { params.set('hide-ui', '1'); params.set('footer', 'false'); }
  const kind = type === 'proto' ? 'proto' : 'design';
  return `https://embed.figma.com/${kind}/${key}/${encodeURIComponent(decodeURIComponent(name))}?${params.toString()}`;
}

export function PrototypeEmbed({ section, editorMode, onSetLink }: { section: CaseStudySection; editorMode: boolean; onSetLink?: (sectionId: string, link: string) => void }) {
  const reduce = useReducedMotion();
  const link = section.prototype?.url || '';
  const device = section.prototype?.device || 'phone';
  const embed = link ? figmaEmbedUrl(link, section.prototype?.hideUi !== false) : null;
  const isDesign = /figma\.com\/(design|file)\//.test(link);
  const [playing, setPlaying] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!figmaEmbedUrl(draft)) { setError('Paste a Figma prototype link. In Figma: Present → Share prototype → Copy link.'); return; }
    setError(''); onSetLink?.(section.id, draft.trim()); setDraft(''); setPlaying(false);
  };

  return <motion.div className={`csb-proto csb-proto-${device}`} initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .8, ease: [0.22, 1, 0.36, 1] }}>
    <div className="csb-proto-device">
      {device === 'phone' && <span className="csb-proto-island" aria-hidden="true" />}
      {device === 'laptop' && <div className="csb-proto-bar" aria-hidden="true"><i /><i /><i /></div>}
      <div className="csb-proto-screen">
        {embed && playing
          ? <iframe key={reloadKey} src={embed} title={`${section.title} — interactive Figma prototype`} allowFullScreen loading="lazy" />
          : embed
            ? <button type="button" className="csb-proto-poster" onClick={event => { event.stopPropagation(); setPlaying(true); }}>
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
