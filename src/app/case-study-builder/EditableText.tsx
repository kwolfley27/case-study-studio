import { createContext, useContext, useLayoutEffect, useRef } from 'react';
export const EditingContext = createContext<{edit?:(field:string,value:string)=>void}>({});
export function EditableText({value,field,children}:{value:string;field:string;children?:React.ReactNode}) {
 const {edit}=useContext(EditingContext); const ref=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{if(ref.current && document.activeElement!==ref.current && ref.current.textContent!==value) ref.current.textContent=value;},[value]);
 if(!edit) return <>{children ?? value}</>;
 return <span ref={ref} className="csb-editable-text" contentEditable suppressContentEditableWarning role="textbox" aria-label={`Edit ${field.replace(/items\.\d+\./,'item ')}`} aria-multiline="true" tabIndex={0} onInput={e=>edit(field,e.currentTarget.textContent||'')} onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.blur();} if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.currentTarget.blur();}}} onPaste={e=>{e.preventDefault();const text=e.clipboardData.getData('text/plain'); const selection=window.getSelection(); if(!selection?.rangeCount)return; const range=selection.getRangeAt(0);range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);edit(field,e.currentTarget.textContent||'');}} />;
}
