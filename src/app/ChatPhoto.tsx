import {useEffect,useRef,useState} from 'react';
import type {SupabaseTripRoomRepository} from '../shared/integrations/supabaseProduction';
import type {PassengerLocale} from '../shared/i18n/passengerLocale';
import {chatPhotoCopy} from '../shared/i18n/chatPhoto';
type Props={repository:SupabaseTripRoomRepository;locale:PassengerLocale};
export function ChatPhoto({repository,locale,path}:Props&{path:string}){
 const c=chatPhotoCopy[locale], [url,setUrl]=useState(''),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let alive=true,objectUrl='';
  void repository.downloadPhoto(path).then(blob=>{
   if(!alive)return;if(!blob){setFailed(true);return}
   objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);setFailed(false);
  }).catch(()=>{if(alive)setFailed(true)});
  return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[repository,path,retry]);
 return failed?<button onClick={()=>setRetry(value=>value+1)}>{c.photo} · {c.retry}</button>:url?<img src={url} alt={c.photo} style={{maxWidth:'100%',maxHeight:300,objectFit:'contain'}} onError={()=>setFailed(true)}/>:<span role="status">{c.photo}…</span>;
}
export function ChatPhotoUpload({repository,locale,roomId,disabled,onSent}:Props&{roomId:string;disabled:boolean;onSent:()=>void}){
 const c=chatPhotoCopy[locale],input=useRef<HTMLInputElement>(null),lock=useRef(false);
 const [selected,setSelected]=useState<{file:File;id:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function send(){
  if(!selected||disabled||lock.current)return;lock.current=true;setBusy(true);setError('');
  try{if(!await repository.sendPhoto(roomId,selected.id,selected.file))throw Error('failed');setSelected(null);onSent()}
  catch{setError(c.failed)}finally{lock.current=false;setBusy(false)}
 }
 return <>
  <input ref={input} type="file" className="visually-hidden" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={c.add} disabled={disabled||busy} onChange={event=>{
   const file=event.target.files?.[0];event.target.value='';if(!file)return;
   if(file.size<1||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){setError(c.limits);return}
   setSelected({file,id:crypto.randomUUID()});setError('');
  }}/>
  <button type="button" aria-label={c.add} title={c.limits} disabled={disabled||busy} onClick={()=>input.current?.click()}>＋</button>
  {(selected||error)&&<div className="pc-modal-backdrop"><section className="pc-modal" role="dialog" aria-modal="true" aria-label={c.add}>
   <p>{c.limits}</p>{selected&&<p>{selected.file.name}</p>}
   {error&&<p role="alert">{error}</p>}
   {selected&&<button disabled={disabled||busy} onClick={()=>void send()}>{busy?c.busy:error?c.retry:c.send}</button>}
   <button disabled={busy} onClick={()=>{setSelected(null);setError('')}}>{c.remove}</button>
  </section></div>}
 </>;
}
