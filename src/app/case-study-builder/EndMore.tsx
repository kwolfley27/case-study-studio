import { useContext, useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
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

export function EndMore({ study, editorMode }: { study: BuilderStudy; editorMode?: boolean }) {
  const { edit } = useContext(EditingContext);
  const cards = study.moreStudies?.length ? study.moreStudies : BLANK;
  const shown = editorMode ? cards : cards.filter(c => c.title.trim());
  const [library, setLibrary] = useState<SavedStudy[]>([]);
  useEffect(() => { if (editorMode) void listStudies().then(all => setLibrary(all.filter(s => s.id !== study.id))).catch(() => undefined); }, [editorMode, study.id]);
  const save = (next: MoreStudy[]) => edit?.('moreStudies', JSON.stringify(next));
  const fill = (k: number, id: string) => {
    const s = library.find(x => x.id === id); if (!s) return;
    const next = cards.map((c, i) => i === k ? { title: s.title, subtitle: [s.client, s.role].filter(Boolean).join(' · '), image: s.heroImage, url: s.publishedAt ? publicPageUrl(s.slug) : c.url, accent: s.accent } : c);
    save(next);
  };
  return <footer className="csb-canvas-end">
    <span className="csb-end-thanks">Thank you for reading.</span>
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
            {editorMode && <div className="csb-more-tools">
              {library.length > 0 && <select value="" aria-label="Use one of your case studies" onChange={e => fill(k, e.target.value)}><option value="">Use one of your case studies…</option>{library.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>}
              <input placeholder="Link (https://…)" value={c.url ?? ''} onChange={e => save(cards.map((x, i) => i === k ? { ...x, url: e.target.value } : x))} />
            </div>}
          </div>; })}
      </div>
    </div>}
    <div className="csb-end-line" />
    <span className="csb-end-meta">{study.client} / {study.timeframe}</span>
  </footer>;
}
