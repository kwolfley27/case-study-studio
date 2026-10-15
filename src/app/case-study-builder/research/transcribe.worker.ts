/// <reference lib="webworker" />
/*
  Free, private transcription that runs in the browser.
  1. Whisper (speech → text with timestamps)
  2. WeSpeaker (a "voiceprint" for each sentence) + clustering → who said it
  Models download once from Hugging Face and are cached by the browser.
*/
// Loaded from a CDN at run time so the 20 MB speech engine never ships with the site.
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = any;
let lib: Promise<T> | null = null;
const load = () => (lib ??= import(/* @vite-ignore */ LIB).then((m: T) => { m.env.allowLocalModels = false; return m; }));

type In = { audio: Float32Array; speakers: number; language?: string };
export type Segment = { s: number; e: number; spk: number; text: string };
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
const SR = 16000;

self.onmessage = async (ev: MessageEvent<In>) => {
  const { audio, speakers } = ev.data;
  try {
    const { AutoModel, AutoProcessor, pipeline } = await load();
    const gpu = !!(navigator as Navigator & { gpu?: unknown }).gpu;
    const progress = (stage: string) => (p: { status: string; progress?: number; file?: string }) => { if (p.status === 'progress' && p.file?.endsWith('.onnx')) post({ type: 'progress', stage, pct: Math.round(p.progress ?? 0) }); };

    post({ type: 'progress', stage: 'Downloading the speech model', pct: 0 });
    let asr;
    try {
      asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', { device: gpu ? 'webgpu' : 'wasm', dtype: gpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8', progress_callback: progress('Downloading the speech model') });
    } catch {
      asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', { device: 'wasm', dtype: 'q8', progress_callback: progress('Downloading the speech model') });
    }

    // Whisper works on 30 s windows; do them one by one so we can show progress.
    const WIN = 30 * SR; const chunks: Array<{ s: number; e: number; text: string }> = [];
    for (let off = 0; off < audio.length; off += WIN) {
      post({ type: 'progress', stage: 'Transcribing', pct: Math.round(off / audio.length * 100) });
      const slice = audio.subarray(off, Math.min(audio.length, off + WIN));
      if (slice.length < SR / 2) break;
      const out = await asr(slice, { return_timestamps: true, language: ev.data.language || 'english', task: 'transcribe' }) as { chunks?: Array<{ text: string; timestamp: [number, number | null] }>; text: string };
      const base = off / SR; const end = Math.min(audio.length, off + WIN) / SR;
      for (const c of out.chunks ?? [{ text: out.text, timestamp: [0, null] }]) {
        const t = c.text.trim(); if (!t || /^\[.*\]$|^\(.*\)$/.test(t)) continue;
        chunks.push({ s: base + (c.timestamp[0] ?? 0), e: Math.min(end, base + (c.timestamp[1] ?? (end - base))), text: t });
      }
      post({ type: 'partial', segments: chunks.map(c => ({ ...c, spk: 0 })) });
    }

    // Who's speaking: a voiceprint per sentence, then group similar voices.
    let labels = chunks.map(() => 0);
    if (speakers > 1 && chunks.length > 1) {
      try {
        post({ type: 'progress', stage: 'Downloading the voice model', pct: 0 });
        const id = 'onnx-community/wespeaker-voxceleb-resnet34-LM';
        const processor = await AutoProcessor.from_pretrained(id);
        const model = await AutoModel.from_pretrained(id, { device: 'wasm', dtype: 'fp32', progress_callback: progress('Downloading the voice model') });
        const embs: Array<Float32Array | null> = [];
        for (let i = 0; i < chunks.length; i++) {
          if (i % 5 === 0) post({ type: 'progress', stage: 'Telling voices apart', pct: Math.round(i / chunks.length * 100) });
          const c = chunks[i]; const a = Math.floor(c.s * SR), b = Math.min(audio.length, Math.ceil(c.e * SR));
          if (b - a < SR * 0.8) { embs.push(null); continue; }
          const inputs = await processor(audio.slice(a, Math.min(b, a + SR * 12)));
          const out = await model(inputs) as Record<string, { data: Float32Array }>;
          embs.push(normalize(Float32Array.from(Object.values(out)[0].data)));
        }
        labels = cluster(embs, speakers);
      } catch (e) { post({ type: 'warn', message: `Speaker labels skipped: ${e instanceof Error ? e.message : 'voice model failed'}` }); }
    }
    // Renumber so whoever speaks first is speaker 0.
    const order: number[] = []; labels.forEach(l => { if (!order.includes(l)) order.push(l); });
    const segments: Segment[] = chunks.map((c, i) => ({ s: round(c.s), e: round(c.e), spk: order.indexOf(labels[i]), text: c.text }));
    post({ type: 'done', segments });
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : 'Transcription failed.' });
  }
};

const round = (n: number) => Math.round(n * 10) / 10;
function normalize(v: Float32Array) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => x / n); }
const cos = (a: Float32Array, b: Float32Array) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };

/* k-means on the unit sphere (cosine), seeded with the most different voices. Short sentences inherit their neighbour's speaker. */
function cluster(embs: Array<Float32Array | null>, k: number): number[] {
  const idx = embs.map((e, i) => e ? i : -1).filter(i => i >= 0);
  if (idx.length < k) return embs.map(() => 0);
  const centers: Float32Array[] = [embs[idx[0]]!];
  while (centers.length < k) { let best = idx[0], bestD = Infinity; for (const i of idx) { const d = Math.max(...centers.map(c => cos(c, embs[i]!))); if (d < bestD) { bestD = d; best = i; } } centers.push(embs[best]!); }
  const lab = new Array(embs.length).fill(-1);
  for (let it = 0; it < 20; it++) {
    let moved = false;
    for (const i of idx) { let b = 0, bd = -Infinity; centers.forEach((c, j) => { const d = cos(c, embs[i]!); if (d > bd) { bd = d; b = j; } }); if (lab[i] !== b) { lab[i] = b; moved = true; } }
    centers.forEach((_, j) => { const members = idx.filter(i => lab[i] === j); if (!members.length) return; const m = new Float32Array(centers[j].length); for (const i of members) embs[i]!.forEach((x, n) => { m[n] += x; }); centers[j] = normalize(m); });
    if (!moved) break;
  }
  for (let i = 0; i < lab.length; i++) if (lab[i] < 0) lab[i] = i > 0 ? lab[i - 1] : (lab.find(l => l >= 0) ?? 0);
  return lab;
}
