// Miso: takes a picture of what you circled in Figma, carries your spoken request to the Case Study Studio tab
// (it can stay in the background), and brings the answer back. Nothing is uploaded by the extension itself.
const STUDIO = ['https://kwolfley27.github.io/case-study-studio/*', 'http://localhost:5173/*', 'http://127.0.0.1:5173/*'];
const toDataUrl = async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return `data:${blob.type};base64,${btoa(s)}`; };
let askedFrom = null; // the Figma tab waiting for an answer

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'miso-capture' && sender.tab) {
    (async () => {
      try {
        const shot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
        const bmp = await createImageBitmap(await (await fetch(shot)).blob());
        const k = bmp.width / msg.viewport.w;
        const r = { x: Math.max(0, msg.rect.x * k), y: Math.max(0, msg.rect.y * k), w: Math.min(bmp.width, msg.rect.w * k), h: Math.min(bmp.height, msg.rect.h * k) };
        const scale = Math.min(1, 1600 / r.w);
        const c = new OffscreenCanvas(Math.round(r.w * scale), Math.round(r.h * scale));
        c.getContext('2d').drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
        const image = await toDataUrl(await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 }));
        await chrome.storage.local.set({ clip: { image, figmaUrl: msg.url, name: msg.name, at: Date.now() } });
        reply({ ok: true });
      } catch (e) { reply({ ok: false, error: String(e?.message || e) }); }
    })();
    return true;
  }
  if (msg?.type === 'miso-command' && sender.tab) {
    (async () => {
      const tabs = await chrome.tabs.query({ url: STUDIO });
      if (!tabs.length) { reply({ ok: false, error: 'Open Case Study Studio in another tab first (it can stay in the background).' }); return; }
      const { clip } = await chrome.storage.local.get('clip');
      askedFrom = sender.tab.id;
      for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'miso-command', said: msg.said, clip: clip || null }).catch(() => {});
      reply({ ok: true });
    })();
    return true;
  }
  if (msg?.type === 'miso-reply' && askedFrom != null) {
    chrome.tabs.sendMessage(askedFrom, { type: 'miso-reply', text: msg.text, tone: msg.tone }).catch(() => {});
  }
});
