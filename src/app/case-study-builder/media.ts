/*
  Large media (screen recordings, uploaded videos) can't live in the browser
  draft, so they are kept in this browser's IndexedDB and referenced as
  "idb:<id>". For the published site, a hosted video link is used instead.
*/

const DB = 'csb-media'; const STORE = 'files';
const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error ?? new Error('Browser storage is unavailable.'));
});

export async function putMedia(blob: Blob): Promise<string> {
  const db = await open(); const id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  return `idb:${id}`;
}

const urls = new Map<string, string>();
export async function mediaUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (!src.startsWith('idb:')) return src;
  if (urls.has(src)) return urls.get(src)!;
  try {
    const db = await open();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => { const req = db.transaction(STORE).objectStore(STORE).get(src.slice(4)); req.onsuccess = () => resolve(req.result as Blob | undefined); req.onerror = () => reject(req.error); });
    if (!blob) return null;
    const url = URL.createObjectURL(blob); urls.set(src, url); return url;
  } catch { return null; }
}

/* Record a screen, window or tab. The system cursor is hidden where the
   browser supports it, so the smooth cursor can replace it. */
export async function recordScreen(onDone: (blob: Blob) => void, onStateChange: (recording: boolean) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This browser cannot record the screen. Try Chrome, Edge or Safari on a computer.');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60, cursor: 'never' } as MediaTrackConstraints, audio: false });
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  const recorder = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); onStateChange(false); onDone(new Blob(chunks, { type: recorder.mimeType || 'video/webm' })); };
  stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (recorder.state !== 'inactive') recorder.stop(); });
  recorder.start(250); onStateChange(true);
  return () => { if (recorder.state !== 'inactive') recorder.stop(); };
}
