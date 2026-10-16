// Miso: takes a picture of what you circled in Figma, carries your spoken request to the Case Study Studio tab
// (it can stay in the background), and brings the answer back. Nothing is uploaded by the extension itself.
const STUDIO = ['https://kwolfley27.github.io/case-study-studio/*', 'http://localhost:5173/*', 'http://127.0.0.1:5173/*'];
const toDataUrl = async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return `data:${blob.type};base64,${btoa(s)}`; };
// Figma draws the selected frame with a blue outline. Find it: the rows and columns where blue runs a long way.
const findSelection = (bmp, area) => {
  const c = new OffscreenCanvas(area.w, area.h); const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, area.x, area.y, area.w, area.h, 0, 0, area.w, area.h);
  const d = g.getImageData(0, 0, area.w, area.h).data;
  const blue = i => { const r = d[i], gg = d[i + 1], b = d[i + 2]; return b > 200 && r < 80 && gg > 120 && gg < 190; };
  const rows = new Uint32Array(area.h), cols = new Uint32Array(area.w);
  for (let y = 0; y < area.h; y++) for (let x = 0; x < area.w; x++) if (blue((y * area.w + x) * 4)) { rows[y]++; cols[x]++; }
  const edges = (arr, min) => { const hits = []; arr.forEach((v, i) => { if (v >= min) hits.push(i); }); return hits.length >= 2 ? [hits[0], hits[hits.length - 1]] : null; };
  const ys = edges(rows, 60), xs = edges(cols, 60);
  if (!ys || !xs || xs[1] - xs[0] < 40 || ys[1] - ys[0] < 40) return null;
  const pad = 2; return { x: area.x + xs[0] + pad, y: area.y + ys[0] + pad, w: xs[1] - xs[0] - pad * 2, h: ys[1] - ys[0] - pad * 2 };
};
let askedFrom = null; // the Figma tab waiting for an answer

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'miso-capture' && sender.tab) {
    (async () => {
      try {
        const shot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
        const bmp = await createImageBitmap(await (await fetch(shot)).blob());
        const k = bmp.width / msg.viewport.w;
        let r = { x: Math.max(0, Math.round(msg.rect.x * k)), y: Math.max(0, Math.round(msg.rect.y * k)), w: Math.min(bmp.width, Math.round(msg.rect.w * k)), h: Math.min(bmp.height, Math.round(msg.rect.h * k)) };
        if (msg.selection) { const f = findSelection(bmp, r); if (!f) { reply({ ok: false, error: 'no-outline' }); return; } r = f; }
        const scale = Math.min(1, 1600 / r.w);
        const c = new OffscreenCanvas(Math.round(r.w * scale), Math.round(r.h * scale));
        c.getContext('2d').drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
        const image = await toDataUrl(await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 }));
        await chrome.storage.local.set({ clip: { image, figmaUrl: msg.url, name: msg.name, at: Date.now(), picked: !!msg.selection } });
        reply({ ok: true });
      } catch (e) { reply({ ok: false, error: String(e?.message || e) }); }
    })();
    return true;
  }
  // Press Figma's own Copy as PNG (⌘⇧C) for you. Only real key presses work, so this goes through Chrome's debugger
  // for a moment (Chrome shows a "started debugging" bar while it's attached).
  if (msg?.type === 'miso-copy-png' && sender.tab) {
    (async () => {
      const target = { tabId: sender.tab.id };
      try {
        await chrome.debugger.attach(target, '1.3');
        const mac = msg.mac !== false; const mods = (mac ? 4 : 2) | 8; // ⌘ or Ctrl, plus Shift
        const key = { modifiers: mods, key: 'C', code: 'KeyC', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67 };
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', ...key });
        reply({ ok: true });
      } catch (e) { reply({ ok: false, error: String(e?.message || e) }); }
      setTimeout(() => chrome.debugger.detach(target).catch(() => {}), 1200);
    })();
    return true;
  }
  if (msg?.type === 'miso-command' && sender.tab) {
    (async () => {
      const tabs = await chrome.tabs.query({ url: STUDIO });
      if (!tabs.length) { reply({ ok: false, error: 'Open Case Study Studio in another tab first (it can stay in the background).' }); return; }
      const { clip } = await chrome.storage.local.get('clip');
      askedFrom = sender.tab.id;
      for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'miso-command', said: msg.said, ambient: !!msg.ambient, clip: clip || null }).catch(() => {});
      reply({ ok: true });
    })();
    return true;
  }
  if (msg?.type === 'miso-reply' && askedFrom != null) {
    chrome.tabs.sendMessage(askedFrom, { type: 'miso-reply', text: msg.text, tone: msg.tone, kind: msg.kind || '' }).catch(() => {});
  }
});

// ⌃M anywhere in Chrome: turn Miso's listening on or off (the studio and Figma tabs follow).
chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== 'toggle-listening') return;
  const { misoAwake } = await chrome.storage.local.get('misoAwake');
  await chrome.storage.local.set({ misoAwake: !misoAwake });
});
