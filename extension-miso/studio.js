// Miso bridge on Case Study Studio: hands the studio the frame you circled in Figma.
(() => {
  if (window.top !== window) return;
  const post = clip => window.postMessage({ source: 'miso-ext', type: 'clip', clip: clip || null }, location.origin);
  window.addEventListener('message', e => {
    if (e.source !== window || e.data?.source !== 'miso-page') return;
    if (e.data.type === 'hello') chrome.storage.local.get('clip').then(r => post(r.clip));
    if (e.data.type === 'clear') chrome.storage.local.remove('clip');
  });
  chrome.storage.onChanged.addListener(ch => { if (ch.clip) post(ch.clip.newValue); });
})();
