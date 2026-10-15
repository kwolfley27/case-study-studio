const $ = id => document.getElementById(id);
const send = msg => chrome.runtime.sendMessage(msg);
function render(rec) {
  $('status').classList.toggle('on', rec.recording);
  $('state').textContent = rec.recording ? `Recording · ${rec.steps.length} step${rec.steps.length === 1 ? '' : 's'}` : rec.steps.length ? `${rec.steps.length} steps recorded` : 'Not recording';
  $('toggle').textContent = rec.recording ? 'Stop recording' : rec.steps.length ? 'Start a new recording' : 'Start recording this tab';
  if (document.activeElement !== $('name')) $('name').value = rec.name || '';
  $('send').disabled = $('download').disabled = $('undo').disabled = !rec.steps.length;
  $('strip').innerHTML = '';
  for (const s of rec.steps.slice(-12)) { const f = document.createElement('figure'); const img = document.createElement('img'); img.src = s.image; const c = document.createElement('figcaption'); c.textContent = s.action ? `${s.action} → ${s.label}` : s.label; f.append(img, c); $('strip').append(f); }
  $('strip').scrollLeft = 1e6;
}
send({ type: 'get' }).then(render);
setInterval(() => send({ type: 'get' }).then(render), 1000);
$('toggle').onclick = async () => {
  const rec = await send({ type: 'get' });
  if (rec.recording) return render(await send({ type: 'stop' }));
  if (rec.steps.length && !confirm('Start over? The current recording will be cleared.')) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  render(await send({ type: 'start', tabId: tab.id }));
};
$('name').oninput = e => send({ type: 'rename', name: e.target.value });
$('undo').onclick = async () => render(await send({ type: 'undo' }));
$('clear').onclick = async () => { if (confirm('Clear this recording?')) render(await send({ type: 'clear' })); };
$('send').onclick = async () => { await send({ type: 'stop' }); await send({ type: 'send' }); window.close(); };
$('download').onclick = async () => {
  const rec = await send({ type: 'get' });
  const blob = new Blob([JSON.stringify({ source: 'csb-recorder', flow: { name: rec.name || 'Recorded flow', source: 'web', steps: rec.steps } })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(rec.name || 'recorded-flow').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.flow.json`; a.click();
};
