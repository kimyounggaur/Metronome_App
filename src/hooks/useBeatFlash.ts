import { useEffect, useRef, useState } from "react";
import type { BeatEvent } from "../domain/types";

export function useBeatFlash(enabled:boolean,event:BeatEvent|null,isPlaying:boolean):boolean {
  const [on,setOn]=useState(false);
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const last=useRef(-Infinity);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setReduced(media.matches);media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    if(!enabled||!isPlaying||reduced){if(timer.current!==null)clearTimeout(timer.current);timer.current=null;setOn(false);last.current=-Infinity;}
  },[enabled,isPlaying,reduced]);
  useEffect(()=>{
    if(event?.showVisual===false){if(timer.current!==null)clearTimeout(timer.current);timer.current=null;setOn(false);return;}
    if(!enabled||!isPlaying||reduced||!event||event.subIndex!==0)return;
    const now=performance.now();if(now-last.current<500)return;
    last.current=now;setOn(true);
    if(timer.current!==null)clearTimeout(timer.current);
    timer.current=setTimeout(()=>{setOn(false);timer.current=null;},100);
  },[enabled,event,isPlaying,reduced]);
  useEffect(()=>()=>{if(timer.current!==null)clearTimeout(timer.current);},[]);
  return on;
}
