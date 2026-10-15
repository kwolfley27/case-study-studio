import { useContext, useEffect, useState } from 'react';
import { ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { EditableText, EditingContext } from './EditableText';
import { listStudies, type SavedStudy } from './studyLibrary';
import { publicPageUrl } from './Publish';
import type { BuilderStudy } from './model';

/*
  End of the page: "Thank you for reading", then previews of other case studies.
  study.moreStudies = [{ title, subtitle, image, url }]. In the editor, empty cards are placeholders
  you can fill from your other case studies; on the published page only filled cards show.
*/
export type MoreStudy = { title: string; subtitle?: string; image?: string; url?: string; accent?: string };
const BLANK: MoreStudy[] = [{ title: '' }, { title: '' }, { title: '' }];

export function EndMore({ study, editorMode, selected, onSelect }: { study: BuilderStudy; editorMode?: boolean; selected?: boolean; onSelect?: () => void }) {
  const { edit } = useContext(EditingContext);
  const cards = study.moreStudies ?? BLANK;
  const shown = study.showMore === false ? [] : editorMode ? cards : cards.filter(c => c.title.trim());
  const [library, setLibrary] = useState<SavedStudy[]>([]);
  useEffect(() => { if (editorMode) void listStudies().then(all => setLibrary(all.filter(s => s.id !== study.id))).catch(() => undefined); }, [editorMode, study.id]);
  const save = (next: MoreStudy[]) => edit?.('moreStudies', JSON.stringify(next));
  const fill = (k: number, id: string) => {
    const s = library.find(x => x.id === id); if (!s) return;
    const next = cards.map((c, i) => i === k ? { title: s.title, subtitle: [s.client, s.role].filter(Boolean).join(' · '), image: s.heroImage, url: s.publishedAt ? publicPageUrl(s.slug) : c.url, accent: s.accent } : c);
    save(next);
  };
  return <footer id="builder-section-__end" className={`csb-canvas-end ${selected ? 'is-selected' : ''}`} onClick={editorMode ? onSelect : undefined}>
    <span className="csb-end-thanks"><EditableText field="endThanks" value={study.endThanks || 'Thank you for reading.'} /></span>
    {shown.length > 0 && <div className="csb-more">
      <p className="csb-more-label">More case studies</p>
      <div className="csb-more-grid">
        {shown.map((c, k) => { const empty = !c.title.trim(); const body = <>
          <div className="csb-more-img" data-image-slot={editorMode ? `more:${k}` : undefined} style={{ ['--more-accent' as string]: c.accent || study.accent }}>
            {c.image ? <img src={c.image} alt="" /> : <span>{editorMode ? 'Cover image' : ''}</span>}
          </div>
          <div className="csb-more-text">
            <strong><EditableText field={`more.${k}.title`} value={c.title || (editorMode ? 'Case study title' : '')} /></strong>
            <small><EditableText field={`more.${k}.subtitle`} value={c.subtitle || (editorMode ? 'Client · role' : '')} /></small>
          </div>
          {!editorMode && c.url && <ArrowUpRight className="csb-more-arrow" size={18} strokeWidth={1.6} aria-hidden="true" />}
        </>;
          return <div key={k} className={`csb-more-card ${empty ? 'is-empty' : ''}`}>
            {!editorMode && c.url ? <a href={c.url}>{body}</a> : body}
          </div>; })}
      </div>
    </div>}
    <div className="csb-end-line" />
    <span className="csb-end-meta">{study.client} / {study.timeframe}</span>
  </footer>;
}

/* Right panel for the ending: the thank-you line and the case study cards. */
export function EndControls({ study, update }: { study: BuilderStudy; update: (p: Partial<BuilderStudy>) => void }) {
  const cards = study.moreStudies ?? BLANK;
  const [library, setLibrary] = useState<SavedStudy[]>([]);
  useEffect(() => { void listStudies().then(all => setLibrary(all.filter(s => s.id !== study.id))).catch(() => undefined); }, [study.id]);
  const save = (next: MoreStudy[]) => update({ moreStudies: next });
  const set = (k: number, patch: Partial<MoreStudy>) => save(cards.map((c, i) => i === k ? { ...c, ...patch } : c));
  return <div className="csb-connection-section csb-fc-ctl">
    <label className="csb-field"><span>Closing line</span><input value={study.endThanks ?? 'Thank you for reading.'} onChange={e => update({ endThanks: e.target.value })} /></label>
    <label className="csb-check-field"><input type="checkbox" checked={study.showMore !== false} onChange={e => update({ showMore: e.target.checked })} /> Show “More case studies”</label>
    {study.showMore !== false && <>
      <p className="csb-panel-kicker">Case study cards</p>
      <p className="csb-field-note">Empty cards only show while editing. Click a card’s cover on the page to add an image.</p>
      {cards.map((c, k) => <div key={k} className="csb-ss-ctl">
        <div className="csb-fc-ctl-line" style={{ gridTemplateColumns: '1fr auto' }}>
          <input value={c.title} placeholder="Case study title" aria-label={`Card ${k + 1} title`} onChange={e => set(k, { title: e.target.value })} />
          <button type="button" className="csb-icon-button" aria-label={`Remove card ${k + 1}`} onClick={() => save(cards.filter((_, i) => i !== k))}><Trash2 size={13} /></button>
        </div>
        <input value={c.subtitle ?? ''} placeholder="Client · role" aria-label={`Card ${k + 1} subtitle`} onChange={e => set(k, { subtitle: e.target.value })} />
        <input value={c.url ?? ''} placeholder="Link (https://…)" aria-label={`Card ${k + 1} link`} onChange={e => set(k, { url: e.target.value })} />
        {library.length > 0 && <select value="" aria-label="Fill from one of your case studies" onChange={e => { const s = library.find(x => x.id === e.target.value); if (s) set(k, { title: s.title, subtitle: [s.client, s.role].filter(Boolean).join(' · '), image: s.heroImage, url: s.publishedAt ? publicPageUrl(s.slug) : c.url, accent: s.accent }); }}><option value="">Fill from one of your case studies…</option>{library.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>}
      </div>)}
      {cards.length < 3 && <button type="button" className="csb-quiet-button" onClick={() => save([...cards, { title: '' }])}><Plus size={13} /> Add card</button>}
    </>}
  </div>;
}
