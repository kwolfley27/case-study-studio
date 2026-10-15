import type { Segment } from './transcribe.worker';
export type { Segment };

/** Decode any recording to 16 kHz mono, which is what the speech models expect. */
async function decode(url: string): Promise<Float32Array> {
  const res = await fetch(url); if (!res.ok) throw new Error(`Could not load the recording (${res.status}).`);
  const buf = await res.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const probe = new Ctx(); const decoded = await probe.decodeAudioData(buf.slice(0)); void probe.close();
  const length = Math.ceil(decoded.duration * 16000);
  const offline = new OfflineAudioContext(1, length, 16000);
  const src = offline.createBufferSource(); src.buffer = decoded; src.connect(offline.destination); src.start();
  return (await offline.startRendering()).getChannelData(0);
}

export function transcribe(url: string, opts: { speakers: number; onProgress: (stage: string, pct: number) => void; onPartial?: (s: Segment[]) => void; onWarn?: (m: string) => void }) {
  let worker: Worker | null = null;
  const promise = (async () => {
    opts.onProgress('Preparing the recording', 0);
    const audio = await decode(url);
    worker = new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
    return await new Promise<Segment[]>((resolve, reject) => {
      worker!.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === 'progress') opts.onProgress(m.stage, m.pct);
        else if (m.type === 'partial') opts.onPartial?.(m.segments);
        else if (m.type === 'warn') opts.onWarn?.(m.message);
        else if (m.type === 'done') { resolve(m.segments); worker?.terminate(); }
        else if (m.type === 'error') { reject(new Error(m.message)); worker?.terminate(); }
      };
      worker!.onerror = e => { reject(new Error(e.message || 'Transcription failed.')); worker?.terminate(); };
      worker!.postMessage({ audio, speakers: opts.speakers }, [audio.buffer]);
    });
  })();
  return { promise, cancel: () => worker?.terminate() };
}
