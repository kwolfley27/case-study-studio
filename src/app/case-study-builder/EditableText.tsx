import { createContext, useContext, useLayoutEffect, useRef } from 'react';

/** Token-based text styles a designer can apply to any editable field. */
export type TextStyle = { tone?: 'ink' | 'muted' | 'accent' | 'accent2'; size?: 's' | 'l' | 'xl'; weight?: 'light' | 'regular' | 'bold' };
export const EditingContext = createContext<{ edit?: (field: string, value: string) => void; styles?: Record<string, TextStyle> }>({});

/** No orphans: the last two words of each line of text stay together (a non-breaking space between them),
    so a paragraph or heading never ends with one word alone. Skipped for short labels and very long word pairs. */
export function noOrphan(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.split('\n').map(line => {
    const m = line.match(/^(.*\S)[ \t]+(\S+)(\s*)$/);
    if (!m || line.trim().split(/\s+/).length < 4) return line;
    const prev = m[1].split(/\s/).pop() ?? '';
    return prev.length + m[2].length > 24 ? line : `${m[1]}\u00A0${m[2]}${m[3]}`;
  }).join('\n');
}

export function EditableText({ value, field, children }: { value: string; field: string; children?: React.ReactNode }) {
  const { edit, styles } = useContext(EditingContext);
  if (edit) installTextBoxFix();
  const ref = useRef<HTMLSpanElement>(null);
  const style = styles?.[field];
  const tokens = style ? { 'data-tone': style.tone, 'data-size': style.size, 'data-weight': style.weight } : {};
  useLayoutEffect(() => { if (ref.current && document.activeElement !== ref.current && ref.current.textContent !== value) ref.current.textContent = value; }, [value, !!edit]);
  if (!edit) { const shown = children ?? noOrphan(value); return style && (style.tone || style.size || style.weight) ? <span className="csb-ts" {...tokens}>{shown}</span> : <>{shown}</>; }
  return <span ref={ref} className="csb-editable-text csb-ts" data-field={field} {...tokens} contentEditable suppressContentEditableWarning role="textbox" aria-label={`Edit ${field.replace(/items\.\d+\./, 'item ')}`} aria-multiline="true" tabIndex={0}
    onInput={e => edit(field, e.currentTarget.textContent || '')}
    onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.blur(); } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
    onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text/plain'); const selection = window.getSelection(); if (!selection?.rangeCount) return; const range = selection.getRangeAt(0); range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); edit(field, e.currentTarget.textContent || ''); }} />;
}

/*
  Make editable text behave like a real text box. Browsers only edit when the selection starts inside the text,
  so a drag that begins just before the first word (or a click in the gap beside it) selected the page instead,
  and Delete and typing did nothing. Here, a press close to an editable field (inside the same heading or
  paragraph) starts the selection inside that field, and dragging extends it there.
*/
let installed = false;
const caretAt = (x: number, y: number): { node: Node; offset: number } | null => {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); return p ? { node: p.offsetNode, offset: p.offset } : null; }
  const r = document.caretRangeFromPoint?.(x, y); return r ? { node: r.startContainer, offset: r.startOffset } : null;
};
// The point clamped into the field: before its start → its start, after its end → its end.
const pointIn = (el: HTMLElement, x: number, y: number) => {
  const c = caretAt(x, y);
  if (c && el.contains(c.node)) return c;
  const r = el.getBoundingClientRect(); const text = el.firstChild ?? el;
  const len = text.nodeType === 3 ? (text.textContent?.length ?? 0) : el.childNodes.length;
  const before = y < r.top || (y <= r.bottom && x < r.left + 2);
  return { node: text, offset: before ? 0 : len };
};
const nearestField = (target: Element, x: number, y: number): HTMLElement | null => {
  if (target.closest('.csb-editable-text, input, textarea, select, button, a, [contenteditable="false"], [data-image-slot]')) return null;
  const block = target.closest('h1, h2, h3, h4, h5, p, li, small, strong, blockquote, figcaption, dt, dd, label');
  if (!block || !block.closest('.csb-canvas-editable')) return null;
  const fields = [...block.querySelectorAll<HTMLElement>('.csb-editable-text')];
  let best: HTMLElement | null = null, dist = 28;
  for (const f of fields) {
    const r = f.getBoundingClientRect(); const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = Math.hypot(dx, dy); if (d < dist) { dist = d; best = f; }
  }
  return best;
};
export function installTextBoxFix() {
  if (installed || typeof document === 'undefined') return; installed = true;
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.pointerType === 'touch' || !(e.target instanceof Element)) return;
    const field = nearestField(e.target, e.clientX, e.clientY); if (!field) return;
    e.preventDefault(); field.focus({ preventScroll: true });
    const start = pointIn(field, e.clientX, e.clientY); const sel = getSelection(); if (!sel) return;
    sel.collapse(start.node, start.offset);
    const move = (ev: PointerEvent) => { const end = pointIn(field, ev.clientX, ev.clientY); sel.setBaseAndExtent(start.node, start.offset, end.node, end.offset); };
    const up = () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
  }, true);
}
