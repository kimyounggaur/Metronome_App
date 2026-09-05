import { useRef, useState } from "react";
export function NumberField({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(value:number)=>void}) {
  const [draft,setDraft]=useState(String(value));
  const [editing,setEditing]=useState(false);
  const canceled=useRef(false);
  return <label className="block min-w-0 rounded-2xl p-3 surface-2">
    <span className="block text-sm font-semibold text-[color:var(--muted)]">{label}</span>
    <input className="mt-1 min-h-11 w-full min-w-0 border-0 bg-transparent text-lg font-bold"
      type="number" inputMode="numeric" min={min} max={max} step={1} value={editing ? draft : value}
      onFocus={()=>{canceled.current=false;setDraft(String(value));setEditing(true);}}
      onChange={event=>setDraft(event.target.value)}
      onBlur={()=>{setEditing(false);if(canceled.current)return;const n=Number(draft);if(draft.trim()&&Number.isFinite(n))onChange(Math.max(min,Math.min(max,Math.round(n))));}}
      onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();canceled.current=true;event.currentTarget.blur();}if(event.key==='Enter')event.currentTarget.blur();}} />
  </label>;
}
