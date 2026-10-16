import { useEffect, useState } from 'react';
import { Copy, FileText, Figma, Plus, Trash2 } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { deleteStudy, freshCopy, listStudies, listTrash, purgeStudy, restoreStudy, saveStudy, type SavedStudy, type Trashed } from './studyLibrary';
import { publishedJsonUrl } from './Publish';
import { migrateStudy } from './model';
import { isBuilderStudy, type BuilderStudy } from './model';
import { call, readDrafts, type Study } from './research/research';

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

export function HomeGallery({ current, onOpen, onNew, onOpenResearch, owner = false }: { current: BuilderStudy; onOpen: (study: BuilderStudy) => void; onNew: () => void; onOpenResearch?: (id?: string) => void; owner?: boolean }) {
  // Bring the case studies from katelynwolfley.design in as drafts (owner only, once each).
  const [importing, setImporting] = useState('');
  const [toImport, setToImport] = useState(0);
  const [research, setResearch] = useState<Study[]>(() => readDrafts());
  useEffect(() => { call<{ studies: Study[] }>('list', {}, true).then(d => setResearch(list => { const byId = new Map(list.map(s => [s.id, s])); for (const s of d?.studies ?? []) byId.set(s.id, { ...s, ...byId.get(s.id), responses: s.responses, published: true }); return [...byId.values()]; })).catch(() => undefined); }, []);
  const [studies, setStudies] = useState<SavedStudy[] | null>(null);
  const [published, setPublished] = useState<BuilderStudy[]>([]);
  const [trash, setTrash] = useState<Trashed[]>([]);
  const [loadError, setLoadError] = useState('');
  const [restoring, setRestoring] = useState('');
  useEffect(() => { if (!owner || studies === null) return; void import('./portfolioImport').then(async m => { setToImport(m.pending(await m.loadPortfolioPlans(), studies).length); }).catch(() => undefined); }, [owner, studies]);
  const refresh = () => { listStudies().then(s => { setStudies(s); setLoadError(''); }).catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not read your saved case studies.'); setStudies(prev => prev ?? []); }); listTrash().then(setTrash).catch(() => undefined); };
  // The Steinway project can always be brought back: the published copy first (it has your frames), else rebuilt from the starter.
  const steinwayMissing = studies !== null && !loadError && current.id !== 'starter-steinway-pdp' && !studies.some(s => s.id === 'starter-steinway-pdp') && !trash.some(s => s.id === 'starter-steinway-pdp');
  const restoreSteinway = async () => {
    setRestoring('Restoring…');
    try {
      let restored: BuilderStudy | null = null;
      try { const r = await fetch(publishedJsonUrl('steinway'), { cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (isBuilderStudy(d)) restored = { ...d, id: 'starter-steinway-pdp' }; } } catch { /* not published */ }
      if (!restored) { const { buildSteinway } = await import('./starters/steinway'); restored = migrateStudy(buildSteinway()); }
      await saveStudy(restored); refresh(); setRestoring('');
      onOpen(restored);
    } catch { setRestoring('Could not restore. Try again.'); }
  };
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
        {owner && toImport > 0 && <button type="button" className="csb-home-new is-restore" disabled={!!importing} onClick={() => { setImporting('Starting…'); void import('./portfolioImport').then(m => m.importPortfolio(t => setImporting(t))).then(() => { setImporting(''); setToImport(0); refresh(); }).catch(() => setImporting('')); }}><strong>{importing || `Bring in ${toImport} ${toImport === 1 ? 'project' : 'projects'} from your website`}</strong><small>Each comes in as a draft, with its words in sections and every picture in its gallery</small></button>}
        {steinwayMissing && <button type="button" className="csb-home-new is-restore" onClick={() => void restoreSteinway()}><strong>{restoring || 'Restore Steinway PDP Redesign'}</strong><small>Brings it back from your published page, or rebuilds it from your Figma links and words</small></button>}
        {studies === null ? <div className="csb-home-loading">Loading…</div> : studies.map(study => <Card key={study.id} study={study} current={study.id === current.id} note={ago(study.updatedAt)} onOpen={() => onOpen(study)}
          actions={<>
            <button type="button" aria-label={`Duplicate ${study.title}`} title="Duplicate" onClick={async () => { await saveStudy(freshCopy(study, `${study.title} (copy)`)); refresh(); }}><Copy size={14} /></button>
            {study.id !== current.id && <button type="button" aria-label={`Delete ${study.title}`} title="Delete" onClick={async () => { if (window.confirm(`Move “${study.title}” to Recently deleted? You can restore it for 30 days.`)) { await deleteStudy(study.id); refresh(); } }}><Trash2 size={14} /></button>}
          </>} />)}
      </div>
      {loadError && <p className="csb-home-error" role="alert">Couldn’t read every saved case study ({loadError}). Nothing has been removed. <button type="button" onClick={refresh}>Try again</button></p>}
    </section>
    {trash.length > 0 && <section className="csb-home-section">
      <div className="csb-home-title"><h2>Recently deleted</h2><p>Kept for 30 days, then removed for good.</p></div>
      <div className="csb-home-trash">{trash.map(t => <div key={t.id} className="csb-home-trash-row"><strong>{t.title}</strong><small>Deleted {new Date(t.deletedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
        <button type="button" onClick={async () => { await restoreStudy(t.id); refresh(); }}>Restore</button>
        <button type="button" className="is-quiet" onClick={async () => { if (window.confirm(`Delete “${t.title}” for good?`)) { await purgeStudy(t.id); refresh(); } }}>Delete now</button></div>)}</div>
    </section>}
    {onOpenResearch && <section className="csb-home-section">
      <div className="csb-home-title"><h2>Research</h2><p>Surveys and usability tests. Results save to your server and Notion, and connect to charts in any case study.</p></div>
      <div className="csb-home-research">
        <button type="button" className="csb-home-study is-new" onClick={() => onOpenResearch()}><Plus size={16} /><strong>New study</strong></button>
        {research.map(s => <button key={s.id} type="button" className="csb-home-study" onClick={() => onOpenResearch(s.id)}>
          <span className={`csb-home-dot is-${s.published ? s.status : 'draft'}`} aria-hidden="true" />
          <strong>{s.title}</strong>
          <small>{s.kind === 'usability' ? 'Usability test' : 'Survey'} · {s.published ? (s.kind === 'usability' ? 'Saved' : s.status === 'open' ? 'Live' : 'Closed') : 'Draft'}{typeof s.responses === 'number' ? ` · ${s.responses} ${s.kind === 'usability' ? 'session' : 'response'}${s.responses === 1 ? '' : 's'}` : ''}</small>
          {s.projectTitle && <small className="csb-home-study-project">{s.projectTitle}</small>}
        </button>)}
      </div>
    </section>}
    {published.length > 0 && <section className="csb-home-section">
      <div className="csb-home-title"><h2>From Notion</h2><p>Case studies published from your Notion workspace. Open a copy to edit it here.</p></div>
      <div className="csb-home-grid">{published.map(study => <Card key={study.slug} study={study} note="Published" onOpen={async () => { const copy = freshCopy(study); await saveStudy(copy); onOpen(copy); }} />)}</div>
    </section>}
  </main>;
}
