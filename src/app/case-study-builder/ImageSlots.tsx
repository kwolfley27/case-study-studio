import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Link2, Trash2, X } from 'lucide-react';

/*
  Direct image editing on the canvas.
  Any element marked data-image-slot="hero" or data-image-slot="<sectionId>:<itemIndex>"
  becomes an image spot in the editor:
    • click or right-click  → small menu: upload, paste a Figma frame / image link, remove
    • ⌘V / Ctrl+V while hovering a spot → pastes a copied image file or link
    • drag and drop an image onto a spot
  The Figma token is kept in memory only for this browser tab.
*/

let figmaToken = '';

const FIGMA_RE = /figma\.com\/(?:design|file|proto)\/([a-zA-Z0-9]+)[^?#]*\?[^#]*node-id=([0-9]+[-:][0-9]+)/;
export const isFigmaFrameLink = (text: string) => FIGMA_RE.test(text.trim());
const isImageLink = (text: string) => /^https:\/\/\S+$/i.test(text.trim()) && !isFigmaFrameLink(text);

async function figmaFrameImage(link: string): Promise<string> {
  const match = link.trim().match(FIGMA_RE);
  if (!match) throw new Error('That link needs a node-id. In Figma, right-click the frame → Copy link to selection.');
  if (!figmaToken) throw new Error('Add your Figma access token first.');
  const [, fileKey, rawId] = match;
  const id = rawId.replace('-', ':');
  const response = await fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(id)}&format=png&scale=2`, { headers: { 'X-Figma-Token': figmaToken } });
  if (response.status === 403) throw new Error('Figma said no access. Check the token and that it can read this file.');
  if (!response.ok) throw new Error(`Figma request failed (${response.status}).`);
  const data = await response.json();
  const url = data.images?.[id];
  if (!url) throw new Error('Figma could not render that frame.');
  return url as string;
}

/* Download a remote image and store it inside the draft as a compressed
   data URL, so it never depends on the original link (Figma render links
   expire after ~30 days). Resized to at most 2400px wide and re-encoded as
   WebP until it fits the browser-draft budget. */
const DRAFT_IMAGE_BUDGET = 1_400_000;
async function downloadIntoDraft(url: string): Promise<string> {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  const blob = await response.blob();
  if (blob.type === 'image/gif' && blob.size <= DRAFT_IMAGE_BUDGET) return blobToDataUrl(blob);
  const bitmap = await createImageBitmap(blob);
  let width = Math.min(2400, bitmap.width);
  for (let attempt = 0; attempt < 8; attempt++) {
    const height = Math.round(bitmap.height * width / bitmap.width);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) break;
    context.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.9, 0.82, 0.72]) {
      const encoded = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (encoded && encoded.size <= DRAFT_IMAGE_BUDGET) return blobToDataUrl(encoded);
    }
    width = Math.round(width * 0.8);
  }
  throw new Error('That image is too large to store in the draft.');
}
const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(blob); });

type Menu = { slot: string; x: number; y: number; hasImage: boolean; mode: 'menu' | 'link' };

export function ImageSlotLayer({ enabled, onFile, onUrl, onRemove, notify }: {
  enabled: boolean;
  onFile: (slot: string, file: File) => void;
  onUrl: (slot: string, url: string, note?: string) => void;
  onRemove: (slot: string) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [link, setLink] = useState('');
  const [token, setToken] = useState(figmaToken);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileSlot = useRef<string | null>(null);
  const hovered = useRef<HTMLElement | null>(null);

  const slotFrom = (target: EventTarget | null) => {
    const element = (target as HTMLElement | null)?.closest?.('[data-image-slot]') as HTMLElement | null;
    if (!element || !element.closest('.csb-preview-viewport')) return null;
    if ((target as HTMLElement).closest('.csb-editable-text, a, input, textarea, select')) return null;
    return element;
  };
  const slotHasImage = (element: HTMLElement) => !!element.querySelector('img');

  const applyLink = async (slot: string, text: string) => {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      if (isFigmaFrameLink(value)) {
        const url = await figmaFrameImage(value);
        try { onUrl(slot, await downloadIntoDraft(url), 'Figma frame downloaded into your case study.'); }
        catch { onUrl(slot, url, 'Figma frame added as a link (it could not be downloaded). Figma links expire after about 30 days; paste it again to refresh.'); }
      } else if (isImageLink(value)) {
        try { onUrl(slot, await downloadIntoDraft(value), 'Image downloaded into your case study.'); }
        catch { onUrl(slot, value, 'Image added as a link. That site did not allow downloading, so it will show as long as the link works.'); }
      }
      else throw new Error('Paste a Figma frame link or an https image link.');
      setMenu(null); setLink('');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not add that link.', true); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!enabled) { setMenu(null); return; }
    const open = (event: MouseEvent, element: HTMLElement) => {
      event.preventDefault(); event.stopPropagation();
      const slot = element.dataset.imageSlot!;
      setLink('');
      setMenu({ slot, x: Math.min(event.clientX, window.innerWidth - 300), y: Math.min(event.clientY, window.innerHeight - 260), hasImage: slotHasImage(element), mode: 'menu' });
    };
    const onClick = (event: MouseEvent) => { const element = slotFrom(event.target); if (element) open(event, element); };
    const onContext = (event: MouseEvent) => { const element = slotFrom(event.target); if (element) open(event, element); };
    const onOver = (event: MouseEvent) => { const element = slotFrom(event.target); hovered.current = element; document.querySelectorAll('.csb-slot-hover').forEach(node => node !== element && node.classList.remove('csb-slot-hover')); element?.classList.add('csb-slot-hover'); };
    const onDragOver = (event: DragEvent) => { const element = slotFrom(event.target); if (!element) return; event.preventDefault(); event.stopPropagation(); element.classList.add('csb-slot-drop'); };
    const onDragLeave = (event: DragEvent) => { slotFrom(event.target)?.classList.remove('csb-slot-drop'); };
    const onDrop = (event: DragEvent) => {
      const element = slotFrom(event.target); if (!element) return;
      event.preventDefault(); event.stopPropagation(); element.classList.remove('csb-slot-drop');
      const file = event.dataTransfer?.files?.[0];
      if (file) onFile(element.dataset.imageSlot!, file);
      else { const text = event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || ''; if (text) void applyLink(element.dataset.imageSlot!, text); }
    };
    const onPaste = (event: ClipboardEvent) => {
      const element = hovered.current;
      const active = document.activeElement as HTMLElement | null;
      if (!element || menu || (active && (active.isContentEditable || ['INPUT', 'TEXTAREA'].includes(active.tagName)))) return;
      const file = Array.from(event.clipboardData?.files ?? []).find(item => item.type.startsWith('image/'));
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!file && !text) return;
      event.preventDefault();
      if (file) onFile(element.dataset.imageSlot!, file);
      else if (isFigmaFrameLink(text) && !figmaToken) { const rect = element.getBoundingClientRect(); setLink(text); setMenu({ slot: element.dataset.imageSlot!, x: rect.left + 24, y: rect.top + 24, hasImage: slotHasImage(element), mode: 'link' }); }
      else void applyLink(element.dataset.imageSlot!, text);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContext, true);
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('dragleave', onDragLeave, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('contextmenu', onContext, true);
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('dragover', onDragOver, true);
      document.removeEventListener('dragleave', onDragLeave, true);
      document.removeEventListener('drop', onDrop, true);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', onKey);
      document.querySelectorAll('.csb-slot-hover').forEach(node => node.classList.remove('csb-slot-hover'));
    };
  }, [enabled, menu, onFile, onUrl]);

  return <>
    <input ref={fileRef} type="file" accept="image/*,.gif" hidden onChange={event => { const file = event.target.files?.[0]; if (file && fileSlot.current) onFile(fileSlot.current, file); event.target.value = ''; }} />
    {menu && <>
      <div className="csb-slot-scrim" onMouseDown={() => setMenu(null)} onContextMenu={event => { event.preventDefault(); setMenu(null); }} />
      <div className="csb-slot-menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>
        {menu.mode === 'menu' ? <>
          <button role="menuitem" onClick={() => { fileSlot.current = menu.slot; setMenu(null); fileRef.current?.click(); }}><ImagePlus size={15} /><span><strong>{menu.hasImage ? 'Replace from your files' : 'Upload from your files'}</strong><small>PNG, JPG or GIF up to 1.5 MB</small></span></button>
          <button role="menuitem" onClick={async () => { let clip = ''; try { clip = await navigator.clipboard.readText(); } catch { /* permission denied */ } setLink(isFigmaFrameLink(clip) || isImageLink(clip) ? clip : ''); setMenu({ ...menu, mode: 'link' }); }}><Link2 size={15} /><span><strong>Paste a Figma frame or image link</strong><small>Figma: right-click a frame → Copy link to selection</small></span></button>
          {menu.hasImage && <button role="menuitem" className="is-danger" onClick={() => { onRemove(menu.slot); setMenu(null); }}><Trash2 size={15} /><span><strong>Remove image</strong></span></button>}
        </> : <form className="csb-slot-link" onSubmit={event => { event.preventDefault(); void applyLink(menu.slot, link); }}>
          <div className="csb-slot-link-head"><strong>Add from a link</strong><button type="button" aria-label="Close" onClick={() => setMenu(null)}><X size={14} /></button></div>
          <input autoFocus value={link} onChange={event => setLink(event.target.value)} placeholder="https://www.figma.com/design/…?node-id=… or image URL" />
          {isFigmaFrameLink(link) && !figmaToken && <><input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="Figma personal access token" /><small>Kept in memory for this tab only. <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noreferrer">Create a token ↗</a></small></>}
          <button type="submit" className="csb-primary-button" disabled={busy || !link.trim() || (isFigmaFrameLink(link) && !figmaToken && !token.trim())} onClick={() => { if (token.trim()) figmaToken = token.trim(); }}>{busy ? 'Downloading…' : 'Add image'}</button>
        </form>}
      </div>
    </>}
  </>;
}
