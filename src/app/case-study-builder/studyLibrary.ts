import type { BuilderStudy } from './model';

/*
  Every case study you work on is kept in this browser's IndexedDB (room for
  images), so you can switch between them from Home. The open one is also
  mirrored to localStorage as before.
*/

const DB = 'csb-library'; const STORE = 'studies';
export type SavedStudy = BuilderStudy & { updatedAt: string };

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error ?? new Error('Browser storage is unavailable.'));
});
const tx = async <T,>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  return new Promise<T>((resolve, reject) => { const req = run(db.transaction(STORE, mode).objectStore(STORE)); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
};

// Every save also goes to the signed-in person's account (see cloud.ts).
const toCloud = (s: SavedStudy & { deletedAt?: string }) => { void import('./cloud').then(c => c.queueCloudSave(s)).catch(() => undefined); };
export const saveStudy = async (study: BuilderStudy) => { const rec = { ...study, updatedAt: new Date().toISOString() }; const r = await tx('readwrite', s => s.put(rec)); toCloud(rec); return r; };
/** Store a record exactly as given (used when bringing a newer copy down from the account). */
export const putRaw = (study: SavedStudy & { deletedAt?: string }) => tx('readwrite', s => s.put(study));
export const getStudy = (id: string) => tx<SavedStudy | undefined>('readonly', s => s.get(id));
/* Deleting moves a study to Recently deleted (kept 30 days) instead of removing it. */
export type Trashed = SavedStudy & { deletedAt?: string };
export const deleteStudy = async (id: string) => { const s = await getStudy(id); if (s) { const rec = { ...s, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await tx('readwrite', st => st.put(rec)); toCloud(rec); } };
export const restoreStudy = async (id: string) => { const s = await getStudy(id) as Trashed | undefined; if (s) { const { deletedAt: _d, ...rest } = s; void _d; const rec = { ...rest, updatedAt: new Date().toISOString() }; await tx('readwrite', st => st.put(rec)); toCloud(rec); } };
export const purgeStudy = async (id: string) => { await tx('readwrite', s => s.delete(id)); void import('./cloud').then(c => c.cloudPurge(id)).catch(() => undefined); };
/** Read every study one by one, so a single unreadable record never hides the others. */
export const readEverything = () => readAll();
async function readAll(): Promise<Trashed[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out: Trashed[] = []; const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => { const c = req.result; if (!c) { resolve(out); return; } try { const v = c.value as Trashed; if (v && typeof v === 'object' && typeof v.id === 'string') out.push(v); } catch { /* skip */ } c.continue(); };
    req.onerror = () => reject(req.error);
  });
}
export async function listStudies(): Promise<SavedStudy[]> {
  const all = await readAll();
  return all.filter(s => !s.deletedAt).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
export async function listTrash(): Promise<Trashed[]> {
  const all = await readAll(); const cutoff = Date.now() - 30 * 864e5;
  all.filter(s => s.deletedAt && Date.parse(s.deletedAt) < cutoff).forEach(s => void purgeStudy(s.id).catch(() => undefined));
  return all.filter(s => s.deletedAt && Date.parse(s.deletedAt) >= cutoff).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
}

export const newId = () => crypto.randomUUID();
export function freshCopy(study: BuilderStudy, title?: string): BuilderStudy {
  const id = newId();
  return { ...structuredClone(study), id, slug: `${(title || study.title || 'case-study').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'case-study'}-${id.slice(0, 4)}`, title: title ?? study.title, sections: study.sections.map(section => ({ ...structuredClone(section), id: crypto.randomUUID() })) };
}
