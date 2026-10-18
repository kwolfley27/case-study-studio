import { GIFEncoder, applyPalette, quantize } from 'gifenc';

/* Turn a flow's screens into a real GIF file (with its numbered notes drawn on), for use anywhere. */
export async function screensToGif(screens: Array<{ src: string; pins?: Array<{ x: number; y: number }> }>, opts: { width?: number; delay?: number; color?: string } = {}): Promise<Blob> {
  const width = opts.width ?? 360, delay = opts.delay ?? 1400, color = opts.color ?? '#3a6ff0';
  const imgs = await Promise.all(screens.map(s => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('A screen couldn’t be read.')); i.src = s.src; })));
  const height = Math.round(width * (imgs[0].naturalHeight / imgs[0].naturalWidth)) & ~1;
  const c = document.createElement('canvas'); c.width = width; c.height = height; const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  imgs.forEach((img, k) => {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
    const s = Math.max(width / img.naturalWidth, height / img.naturalHeight); const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (width - w) / 2, 0, w, h);
    (screens[k].pins ?? []).forEach((p, n) => {
      const x = p.x / 100 * width, y = p.y / 100 * height, r = Math.max(9, width / 32);
      ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(r * 1.05)}px -apple-system, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n + 1), x, y + .5);
    });
    const { data } = ctx.getImageData(0, 0, width, height);
    const palette = quantize(data, 256); const index = applyPalette(data, palette);
    gif.writeFrame(index, width, height, { palette, delay: k === imgs.length - 1 ? delay * 2 : delay });
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
