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

export const saveStudy = (study: BuilderStudy) => tx('readwrite', s => s.put({ ...study, updatedAt: new Date().toISOString() }));
export const getStudy = (id: string) => tx<SavedStudy | undefined>('readonly', s => s.get(id));
export const deleteStudy = (id: string) => tx('readwrite', s => s.delete(id));
export async function listStudies(): Promise<SavedStudy[]> {
  const all = await tx<SavedStudy[]>('readonly', s => s.getAll());
  return all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export const newId = () => crypto.randomUUID();
export function freshCopy(study: BuilderStudy, title?: string): BuilderStudy {
  const id = newId();
  return { ...structuredClone(study), id, slug: `${(title || study.title || 'case-study').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'case-study'}-${id.slice(0, 4)}`, title: title ?? study.title, sections: study.sections.map(section => ({ ...structuredClone(section), id: crypto.randomUUID() })) };
}
