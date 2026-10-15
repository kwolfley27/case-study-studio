import { useEffect, useState } from 'react';
import { Copy, FileText, Figma, Plus, Trash2 } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { deleteStudy, freshCopy, listStudies, saveStudy, type SavedStudy } from './studyLibrary';
import { isBuilderStudy, type BuilderStudy } from './model';

/* Home: every case study you've worked on, plus case studies published from Notion. */

const ago = (iso?: string) => {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'Edited just now';
  if (s < 3600) return `Edited ${Math.round(s / 60)} min ago`;
  if (s < 86400) return `Edited ${Math.round(s / 3600)} h ago`;
  return `Edited ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};

function Card({ study, current, onOpen, actions, note }: { study: BuilderStudy; current?: boolean; onOpen: () => void; actions?: React.ReactNode; note?: string }) {
  return <article className={`csb-home-card ${current ? 'is-current' : ''}`}>
    <button type="button" className="csb-home-cover" onClick={onOpen} aria-label={`Open ${study.title}`} style={{ '--card-accent': study.accent || '#c8553d' } as React.CSSProperties}>
      {study.heroImage ? <img src={study.heroImage} alt="" /> : <span className="csb-home-cover-title">{study.title}</span>}
      {current && <em>Open now</em>}
    </button>
    <div className="csb-home-meta">
      <div><strong>{study.title}</strong><small>{[study.client, note].filter(Boolean).join(' · ')}</small></div>
      <div className="csb-home-badges">
        {study.sources?.notionUrl && <span title="Connected to Notion"><FileText size={12} /> Notion</span>}
        {study.sources?.figmaUrl && <span title="Connected to Figma"><Figma size={12} /> Figma</span>}
      </div>
      {actions && <div className="csb-home-actions">{actions}</div>}
    </div>
  </article>;
}

export function HomeGallery({ current, onOpen, onNew }: { current: BuilderStudy; onOpen: (study: BuilderStudy) => void; onNew: () => void }) {
  const [studies, setStudies] = useState<SavedStudy[] | null>(null);
  const [published, setPublished] = useState<BuilderStudy[]>([]);
  const refresh = () => listStudies().then(setStudies).catch(() => setStudies([]));
  useEffect(() => { void saveStudy(current).then(refresh, refresh); }, []);
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    fetch(`https://${projectId}.supabase.co/functions/v1/make-server-863fdde7/notion/case-studies`, { headers: { Authorization: `Bearer ${publicAnonKey}` }, signal: controller.signal })
      .then(r => r.ok ? r.json() : { caseStudies: [] }).then(data => setPublished((data.caseStudies ?? []).filter(isBuilderStudy))).catch(() => undefined);
    return () => controller.abort();
  }, []);

  return <main className="csb-app csb-home">
    <header className="csb-home-head">
      <div className="csb-wordmark"><span className="csb-wordmark-icon">✳</span>Case Study Studio</div>
    </header>
    <section className="csb-home-section">
      <div className="csb-home-title"><h1>Your case studies</h1><p>Everything saves automatically in this browser. Open one to keep working.</p></div>
      <div className="csb-home-grid">
        <button type="button" className="csb-home-new" onClick={onNew}><Plus size={22} /><strong>New case study</strong><small>Start from the starter layout</small></button>
        {studies === null ? <div className="csb-home-loading">Loading…</div> : studies.map(study => <Card key={study.id} study={study} current={study.id === current.id} note={ago(study.updatedAt)} onOpen={() => onOpen(study)}
          actions={<>
            <button type="button" aria-label={`Duplicate ${study.title}`} title="Duplicate" onClick={async () => { await saveStudy(freshCopy(study, `${study.title} (copy)`)); refresh(); }}><Copy size={14} /></button>
            {study.id !== current.id && <button type="button" aria-label={`Delete ${study.title}`} title="Delete" onClick={async () => { if (window.confirm(`Delete “${study.title}”? This can't be undone.`)) { await deleteStudy(study.id); refresh(); } }}><Trash2 size={14} /></button>}
          </>} />)}
      </div>
    </section>
    {published.length > 0 && <section className="csb-home-section">
      <div className="csb-home-title"><h2>From Notion</h2><p>Case studies published from your Notion workspace. Open a copy to edit it here.</p></div>
      <div className="csb-home-grid">{published.map(study => <Card key={study.slug} study={study} note="Published" onOpen={async () => { const copy = freshCopy(study); await saveStudy(copy); onOpen(copy); }} />)}</div>
    </section>}
  </main>;
}
