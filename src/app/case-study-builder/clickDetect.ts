/*
  Finds the cursor and the clicks in a screen recording, in the browser.

  The video is played (muted, fast) into a small canvas. Between frames:
  - a small changed blob that moves is the cursor  → cursor track
  - a burst of change elsewhere on screen, right after the cursor has come to
    rest, is the interface reacting to a click     → click moment at the cursor
  Scrolling (change across many frames in a row) is ignored.
*/

export type TrackPoint = { t: number; x: number; y: number };
export type FoundClick = { t: number; x: number; y: number };

const W = 320;

export async function analyzeRecording(src: string, onProgress: (fraction: number) => void): Promise<{ clicks: FoundClick[]; track: TrackPoint[] }> {
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  if (/^https?:/.test(src)) video.crossOrigin = 'anonymous';
  video.src = src;
  await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('Could not read the video.')); });
  if (!Number.isFinite(video.duration)) { // recorded WebM: find the real length
    await new Promise<void>(resolve => { const done = () => { video.removeEventListener('durationchange', check); resolve(); }; const check = () => { if (Number.isFinite(video.duration)) done(); }; video.addEventListener('durationchange', check); video.currentTime = 1e101; window.setTimeout(done, 4000); });
    video.currentTime = 0; await new Promise(r => { video.onseeked = r; window.setTimeout(r, 1500); });
  }
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 60;
  const H = Math.max(40, Math.round(W * (video.videoHeight || 800) / (video.videoWidth || 1280)));
  const N = W * H;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  let prev: Uint8ClampedArray | null = null;
  const track: TrackPoint[] = []; const clicks: FoundClick[] = [];
  let cursor: { x: number; y: number } | null = null;
  let lastMoveT = 0; let lastClickT = -9; let bigRun = 0; let lastT = -1;
  let pending: (FoundClick & { run: number }) | null = null;
  const settle = () => { if (pending && pending.run <= 10) { clicks.push({ t: pending.t, x: pending.x, y: pending.y }); lastClickT = pending.t; } pending = null; };
  const mask = new Uint8Array(N); const seen = new Int32Array(N);
  let stamp = 0;

  const analyse = (t: number) => {
    ctx.drawImage(video, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const gray = new Uint8ClampedArray(N);
    for (let i = 0, p = 0; i < N; i++, p += 4) gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    if (prev) {
      let changed = 0;
      for (let i = 0; i < N; i++) { const d = Math.abs(gray[i] - prev[i]) > 12 ? 1 : 0; mask[i] = d; changed += d; }
      if (changed > 0) {
        // connected blobs of change
        stamp++;
        const blobs: Array<{ area: number; cx: number; cy: number; w: number; h: number; x0: number; y0: number }> = [];
        const stack: number[] = [];
        for (let i = 0; i < N; i++) {
          if (!mask[i] || seen[i] === stamp) continue;
          let area = 0, sx = 0, sy = 0, minX = W, maxX = 0, minY = H, maxY = 0;
          stack.push(i); seen[i] = stamp;
          while (stack.length) {
            const j = stack.pop()!; const x = j % W, y = (j / W) | 0;
            area++; sx += x; sy += y; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            for (const k of [j - 1, j + 1, j - W, j + W, j - W - 1, j - W + 1, j + W - 1, j + W + 1]) if (k >= 0 && k < N && mask[k] && seen[k] !== stamp && Math.abs((k % W) - x) <= 1) { seen[k] = stamp; stack.push(k); }
          }
          blobs.push({ area, cx: sx / area, cy: sy / area, w: maxX - minX + 1, h: maxY - minY + 1, x0: minX, y0: minY });
        }
        // a cursor is tiny and has both very dark and very light pixels (fill + outline)
        const cursorLike = (b: { x0: number; y0: number; w: number; h: number }) => { let lo = 255, hi = 0; for (let y = Math.max(0, b.y0 - 1); y < Math.min(H, b.y0 + b.h + 1); y++) for (let x = Math.max(0, b.x0 - 1); x < Math.min(W, b.x0 + b.w + 1); x++) { const g = gray[y * W + x]; if (g < lo) lo = g; if (g > hi) hi = g; } return hi - lo >= 110 && lo < 110; };
        const small = blobs.filter(b => b.area >= 2 && b.area <= N * .0015 && b.w <= W * .05 && b.h <= H * .07 && cursorLike(b));
        const big = blobs.filter(b => !small.includes(b) && b.area >= 2);
        // cursor: the small blob that is its new position
        if (small.length) {
          let pick = small[0];
          if (cursor && small.length > 1) pick = small.reduce((a, b) => Math.hypot(b.cx - cursor!.x, b.cy - cursor!.y) > Math.hypot(a.cx - cursor!.x, a.cy - cursor!.y) ? b : a);
          const moved = !cursor || Math.hypot(pick.cx - cursor.x, pick.cy - cursor.y) > 1.2;
          cursor = { x: pick.cx, y: pick.cy };
          if (moved) { lastMoveT = t; track.push({ t: +t.toFixed(2), x: +(pick.cx / W * 100).toFixed(1), y: +(pick.cy / H * 100).toFixed(1) }); }
        }
        const bigArea = big.reduce((a, b) => a + b.area, 0);
        const frac = bigArea / N;
        const local = cursor ? big.filter(b => Math.hypot((b.cx - cursor!.x) / W, (b.cy - cursor!.y) / H) < .22).reduce((a, b) => a + b.area, 0) / N : 0;
        if (frac > .0008) {
          bigRun++;
          if (pending) pending.run = bigRun;
          const still = t - lastMoveT >= .12;
          // start of a change burst while the cursor rests: a big change anywhere, or a small one near the cursor
          if (bigRun === 1 && still && cursor && t - lastClickT > .7 && (frac >= .02 || local >= .0008)) {
            pending = { t: +Math.max(0, t - .05).toFixed(2), x: +(cursor.x / W * 100).toFixed(1), y: +(cursor.y / H * 100).toFixed(1), run: 1 };
          }
        } else { bigRun = 0; settle(); }
      } else { bigRun = 0; settle(); }
    }
    prev = gray; lastT = t;
    onProgress(Math.min(.99, t / duration));
  };

  await new Promise<void>((resolve) => {
    const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number }).requestVideoFrameCallback?.bind(video);
    const onFrame = (_now: number, meta?: { mediaTime: number }) => {
      const t = meta?.mediaTime ?? video.currentTime;
      if (t > lastT + .001) analyse(t);
      if (!video.ended) { if (rvfc) rvfc(onFrame); else requestAnimationFrame(() => onFrame(0)); }
    };
    video.onended = () => { if (video.currentTime > lastT + .001) analyse(video.currentTime); resolve(); };
    window.setTimeout(resolve, (duration + 20) * 1000);
    video.playbackRate = 1;
    void video.play().then(() => { if (rvfc) rvfc(onFrame); else requestAnimationFrame(() => onFrame(0)); }).catch(() => resolve());
  });
  settle();
  video.pause(); video.removeAttribute('src'); video.load();
  onProgress(1);
  return { clicks, track };
}

/* Cursor position at time t from a track (linear between samples). */
export function trackAt(track: TrackPoint[], t: number): { x: number; y: number } | null {
  if (!track.length) return null;
  if (t <= track[0].t) return track[0];
  let lo = 0, hi = track.length - 1;
  if (t >= track[hi].t) return track[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (track[mid].t <= t) lo = mid; else hi = mid; }
  const a = track[lo], b = track[hi]; const k = (t - a.t) / Math.max(.001, b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}
