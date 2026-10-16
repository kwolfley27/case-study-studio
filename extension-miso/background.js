// Miso: takes a picture of what you circled in Figma and keeps it until you place it in the studio.
// Nothing leaves your computer: the picture is stored in the extension and handed only to Case Study Studio tabs.
const toDataUrl = async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return `data:${blob.type};base64,${btoa(s)}`; };

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'miso-capture' || !sender.tab) return;
  (async () => {
    try {
      const shot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
      const bmp = await createImageBitmap(await (await fetch(shot)).blob());
      const k = bmp.width / msg.viewport.w; // device pixels per CSS pixel
      const r = { x: Math.max(0, msg.rect.x * k), y: Math.max(0, msg.rect.y * k), w: Math.min(bmp.width, msg.rect.w * k), h: Math.min(bmp.height, msg.rect.h * k) };
      const scale = Math.min(1, 1600 / r.w);
      const c = new OffscreenCanvas(Math.round(r.w * scale), Math.round(r.h * scale));
      c.getContext('2d').drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
      const image = await toDataUrl(await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 }));
      const clip = { image, figmaUrl: msg.url, name: msg.name, at: Date.now() };
      await chrome.storage.local.set({ clip });
      reply({ ok: true });
    } catch (e) { reply({ ok: false, error: String(e?.message || e) }); }
  })();
  return true;
});
