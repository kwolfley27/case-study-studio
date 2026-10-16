import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { BuilderStudy } from './model';

/*
  Everything brought in from this project's old version: pictures and videos to drag onto any image spot,
  and the words that lived inside its hand-built visuals (click a line to copy it).
*/
export function AssetsPanel({ study }: { study: BuilderStudy }) {
  const assets = study.assets ?? [];
  const notes = (study.notes ?? []).filter(n => n.text.length);
  const groups = useMemo(() => [...new Set(assets.map(a => a.from.split(':')[0].trim()))], [assets]);
  const [group, setGroup] = useState('All');
  const [tab, setTab] = useState<'pictures' | 'words'>('pictures');
  const [copied, setCopied] = useState('');
  if (!assets.length && !notes.length) return null;
  const shown = group === 'All' ? assets : assets.filter(a => a.from.startsWith(group));
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); setCopied(t); setTimeout(() => setCopied(c => (c === t ? '' : c)), 1400); };
  return <div className="csb-assets">
    <div className="csb-assets-tabs" role="tablist" aria-label="From your old case study">
      <button type="button" role="tab" aria-selected={tab === 'pictures'} onClick={() => setTab('pictures')}>Pictures <small>{assets.length}</small></button>
      {notes.length > 0 && <button type="button" role="tab" aria-selected={tab === 'words'} onClick={() => setTab('words')}>Old words <small>{notes.length}</small></button>}
    </div>
    {tab === 'pictures' ? <>
      {groups.length > 1 && <select className="csb-assets-filter" value={group} onChange={e => setGroup(e.target.value)} aria-label="Show pictures from">
        <option>All</option>{groups.map(g => <option key={g}>{g}</option>)}
      </select>}
      <p className="csb-field-note">Drag a picture onto any image spot in your case study.</p>
      <div className="csb-assets-grid">
        {shown.map(a => <figure key={a.src} title={a.from}>
          {a.kind === 'video'
            ? <video src={a.src} muted playsInline preload="metadata" draggable onDragStart={e => { e.dataTransfer.setData('text/uri-list', a.src); e.dataTransfer.setData('text/plain', a.src); }} />
            : <img src={a.src} alt={a.from} loading="lazy" draggable onDragStart={e => { e.dataTransfer.setData('text/uri-list', a.src); e.dataTransfer.setData('text/plain', a.src); }} />}
          <figcaption>{a.from.replace(/^[^:]+:\s*/, '')}</figcaption>
        </figure>)}
      </div>
    </> : <div className="csb-assets-words">
      <p className="csb-field-note">Words from the old page’s diagrams and visuals. Click a line to copy it.</p>
      {notes.map((n, i) => <details key={n.from + i}>
        <summary>{n.from}</summary>
        {n.text.map(t => <button key={t} type="button" onClick={() => copy(t)} className={copied === t ? 'is-copied' : ''}>{copied === t ? <Check size={12} /> : <Copy size={12} />}<span>{t}</span></button>)}
      </details>)}
    </div>}
  </div>;
}
