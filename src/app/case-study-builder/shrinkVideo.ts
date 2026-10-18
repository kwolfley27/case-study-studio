/*
  Shrink a screen recording in the browser before it's uploaded.
  Phone recordings are huge (an iPhone screen at full resolution and a high bitrate), often in HEVC, which many
  visitors' browsers can't play. This re-encodes them to a web-sized H.264 MP4 (up to 900 × 1600, ~2–3 Mbps):
  usually a fifth of the size or less, still crisp for text and UI, and it plays everywhere.
  Uses WebCodecs (Chrome, Edge, Safari 16.4+, Firefox 130+) with the video playing at 2× speed; frames keep their
  real timestamps, so the result has the original timing. Falls back to real-time MediaRecorder elsewhere.
*/
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export const SHRINK_OVER = 12e6; // bytes: anything bigger is shrunk for the web

async function load(file: Blob) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('This browser can’t read that video. On iPhone, set Settings → Camera → Formats → Most Compatible, or try Safari.')); });
  return v;
}

export async function shrinkVideo(file: Blob, onProgress: (fraction: number) => void): Promise<File> {
  const v = await load(file);
  const dur = v.duration;
  const scale = Math.min(1, 1600 / v.videoHeight, 900 / v.videoWidth);
  const w = Math.max(2, Math.round(v.videoWidth * scale / 2) * 2), h = Math.max(2, Math.round(v.videoHeight * scale / 2) * 2);
  // Aim for at most ~35 MB however long the clip is; screen UI stays sharp down to ~1 Mbps at this size.
  const bitrate = Math.round(Math.max(900_000, Math.min(3_000_000, isFinite(dur) && dur > 0 ? 35e6 * 8 / dur * .9 : 2_500_000)));
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  try {
    if (typeof VideoEncoder !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype) return await viaWebCodecs(v, ctx, canvas, w, h, bitrate, dur, onProgress);
    return await viaRecorder(v, ctx, canvas, w, h, bitrate, dur, onProgress);
  } finally { v.pause(); URL.revokeObjectURL(v.src); }
}

async function viaWebCodecs(v: HTMLVideoElement, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, w: number, h: number, bitrate: number, dur: number, onProgress: (f: number) => void): Promise<File> {
  // H.264 plays everywhere; VP9 (in MP4) is the backup where H.264 encoding isn't available.
  let codec = '', kind: 'avc' | 'vp9' = 'avc';
  for (const [c, k] of [['avc1.640028', 'avc'], ['avc1.4D0028', 'avc'], ['avc1.42E028', 'avc'], ['vp09.00.40.08', 'vp9']] as const) { const s = await VideoEncoder.isConfigSupported({ codec: c, width: w, height: h, bitrate, framerate: 30 }).catch(() => null); if (s?.supported) { codec = c; kind = k; break; } }
  if (!codec) return viaRecorder(v, ctx, canvas, w, h, bitrate, dur, onProgress);
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: kind, width: w, height: h }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e as Error; } });
  encoder.configure({ codec, width: w, height: h, bitrate, framerate: 30, latencyMode: 'quality' });
  let last = -1, n = 0, finished = false;
  await new Promise<void>((resolve, reject) => {
    const frame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (finished) return;
      if (failure) { reject(failure); return; }
      const t = meta.mediaTime;
      if (t > last + 1 / 40) {
        ctx.drawImage(v, 0, 0, w, h);
        const vf = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6) });
        encoder.encode(vf, { keyFrame: n % 90 === 0 }); vf.close(); n++; last = t;
        onProgress(Math.min(.99, t / dur));
        // Let the encoder catch up instead of dropping frames.
        if (encoder.encodeQueueSize > 12) { v.pause(); const wait = () => encoder.encodeQueueSize > 2 ? setTimeout(wait, 15) : void v.play(); wait(); }
      }
      if (!v.ended) v.requestVideoFrameCallback(frame);
    };
    v.onended = () => { finished = true; resolve(); };
    v.requestVideoFrameCallback(frame);
    v.playbackRate = 2; v.currentTime = 0;
    v.play().catch(reject);
  });
  await encoder.flush(); encoder.close(); muxer.finalize();
  if (failure) throw failure;
  onProgress(1);
  return new File([target.buffer], 'recording.mp4', { type: 'video/mp4' });
}

/* Older browsers: record a canvas while the video plays in real time. */
async function viaRecorder(v: HTMLVideoElement, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, w: number, h: number, bitrate: number, dur: number, onProgress: (f: number) => void): Promise<File> {
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error('This browser can’t shrink videos. Try Chrome or Safari.');
  const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>(res => { rec.onstop = () => res(); });
  let raf = 0; const draw = () => { ctx.drawImage(v, 0, 0, w, h); onProgress(Math.min(.99, v.currentTime / dur)); raf = requestAnimationFrame(draw); };
  rec.start(1000); v.currentTime = 0; await v.play(); draw();
  await new Promise<void>(res => { v.onended = () => res(); });
  cancelAnimationFrame(raf); rec.stop(); await stopped;
  const mp4 = type.startsWith('video/mp4');
  return new File(chunks, mp4 ? 'recording.mp4' : 'recording.webm', { type: mp4 ? 'video/mp4' : 'video/webm' });
}
