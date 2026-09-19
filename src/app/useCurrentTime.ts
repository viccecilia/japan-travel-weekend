import {useEffect,useState} from 'react';

/** Resample on foreground/online and across midnight without impure render calculations. */
export function useCurrentTime(intervalMs=30_000){
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    const update=()=>setNow(Date.now());
    const timer=window.setInterval(update,intervalMs);
    window.addEventListener('focus',update);window.addEventListener('online',update);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('online',update)};
  },[intervalMs]);
  return now;
}
