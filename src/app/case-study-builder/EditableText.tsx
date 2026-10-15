import { createContext, useContext, useLayoutEffect, useRef } from 'react';

/** Token-based text styles a designer can apply to any editable field. */
export type TextStyle = { tone?: 'ink' | 'muted' | 'accent' | 'accent2'; size?: 's' | 'l' | 'xl'; weight?: 'light' | 'regular' | 'bold' };
export const EditingContext = createContext<{ edit?: (field: string, value: string) => void; styles?: Record<string, TextStyle> }>({});

export function EditableText({ value, field, children }: { value: string; field: string; children?: React.ReactNode }) {
  const { edit, styles } = useContext(EditingContext);
  const ref = useRef<HTMLSpanElement>(null);
  const style = styles?.[field];
  const tokens = style ? { 'data-tone': style.tone, 'data-size': style.size, 'data-weight': style.weight } : {};
  useLayoutEffect(() => { if (ref.current && document.activeElement !== ref.current && ref.current.textContent !== value) ref.current.textContent = value; }, [value, !!edit]);
  if (!edit) return style && (style.tone || style.size || style.weight) ? <span className="csb-ts" {...tokens}>{children ?? value}</span> : <>{children ?? value}</>;
  return <span ref={ref} className="csb-editable-text csb-ts" data-field={field} {...tokens} contentEditable suppressContentEditableWarning role="textbox" aria-label={`Edit ${field.replace(/items\.\d+\./, 'item ')}`} aria-multiline="true" tabIndex={0}
    onInput={e => edit(field, e.currentTarget.textContent || '')}
    onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.blur(); } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
    onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text/plain'); const selection = window.getSelection(); if (!selection?.rangeCount) return; const range = selection.getRangeAt(0); range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); edit(field, e.currentTarget.textContent || ''); }} />;
}
