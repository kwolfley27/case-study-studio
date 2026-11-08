import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';

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

/** Paragraph-like fields take new lines with Enter; short fields (titles, labels, numbers) finish with Enter. */
const MULTILINE = /(^|\.)(body|detail|freeText|quote|quoteNote|finding|findingNote|thoughts|actions|pains|opportunities|touchpoints|caption|summary|notes?|description|text)$/i;
/** The text a person sees in the box, line breaks included (whatever the browser put in for them). */
const readText = (el: HTMLElement) => (el.childElementCount ? el.innerText : el.textContent || '').replace(/\u00A0/g, ' ');

export function EditableText({ value, field, children }: { value: string; field: string; children?: React.ReactNode }) {
  const { edit, styles } = useContext(EditingContext);
  if (edit) installTextBoxFix();
  const ref = useRef<HTMLSpanElement>(null);
  const [block, setBlock] = useState(false);
  const style = styles?.[field];
  const tokens = style ? { 'data-tone': style.tone, 'data-size': style.size, 'data-weight': style.weight } : {};
  const multiline = MULTILINE.test(field);
  useLayoutEffect(() => { if (ref.current && document.activeElement !== ref.current && readText(ref.current) !== value) ref.current.textContent = value; }, [value, !!edit]);
  // A field that is the only thing in its heading or paragraph becomes a full-width box, so the whole line is clickable.
  useLayoutEffect(() => { const el = ref.current; if (!el?.parentElement) return; const parent = el.parentElement; const inline = /^inline/.test(getComputedStyle(parent).display) || parent.matches('mark, a, em, strong, b, i, span'); const alone = !inline && [...parent.childNodes].every(n => n === el || (n.nodeType === 3 && !n.textContent?.trim())); setBlock(alone); }, [!!edit]);
  if (!edit) { const shown = children ?? noOrphan(value); return style && (style.tone || style.size || style.weight) ? <span className="csb-ts" {...tokens}>{shown}</span> : <>{shown}</>; }
  const commit = (el: HTMLElement) => edit(field, readText(el));
  return <span ref={ref} className="csb-editable-text csb-ts" data-field={field} data-block={block ? '' : undefined} data-multiline={multiline ? '' : undefined} {...tokens} contentEditable suppressContentEditableWarning role="textbox" aria-label={`Edit ${field.replace(/items\.\d+\./, 'item ')}`} aria-multiline={multiline} tabIndex={0} spellCheck
    onInput={e => commit(e.currentTarget)}
    onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); return; }
      if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
      e.preventDefault();
      // Cmd/Ctrl+Enter always finishes. In a paragraph, Enter (or Shift+Enter anywhere) starts a new line.
      if (e.metaKey || e.ctrlKey || (!multiline && !e.shiftKey)) { e.currentTarget.blur(); return; }
      const el = e.currentTarget; const sel = getSelection();
      const atEnd = !!sel?.rangeCount && (() => { const r = sel.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset); return !r.toString().length; })();
      // A line break at the very end needs a second one to show the caret on the new line;
      // the caret then sits between them, and the spare one is trimmed when you finish.
      if (atEnd && !readText(el).endsWith('\n')) { document.execCommand('insertText', false, '\n\n'); (getSelection() as Selection & { modify?: (a: string, d: string, g: string) => void })?.modify?.('move', 'backward', 'character'); }
      else document.execCommand('insertText', false, '\n');
      commit(el);
    }}
    onBlur={e => { const el = e.currentTarget; const t = readText(el); const trimmed = t.replace(/\n+$/, ''); if (trimmed !== t) { el.textContent = trimmed; edit(field, trimmed); } }}
    onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'); document.execCommand('insertText', false, multiline ? text : text.replace(/\s*\n\s*/g, ' ')); commit(e.currentTarget); }}
    onDrop={e => { e.preventDefault(); const text = e.dataTransfer.getData('text/plain'); if (text) { document.execCommand('insertText', false, text); commit(e.currentTarget); } }} />;
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
