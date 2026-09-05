import {useEffect,useState} from 'react';
import type {GuidedTourNode} from '../types/guidedTour';
import {initialGuidedTourPhoto,loadGuidedTourPhoto} from '../services/guidedTourPhotos';

export function GuidedTourPhoto({node}:Readonly<{node:GuidedTourNode}>){
  const [loaded,setLoaded]=useState<{nodeId:string;photo:ReturnType<typeof initialGuidedTourPhoto>}|null>(null);
  const photo=loaded?.nodeId===node.id?loaded.photo:initialGuidedTourPhoto(node);
  useEffect(()=>{let active=true;void loadGuidedTourPhoto(node,import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY).then(value=>{if(active)setLoaded({nodeId:node.id,photo:value})});return()=>{active=false}},[node]);
  return <figure className="guided-node-photo"><img src={photo.url} alt={photo.alt} onError={()=>setLoaded({nodeId:node.id,photo:initialGuidedTourPhoto({...node,photos:{...node.photos,owned:null,google:null}})})}/><figcaption>{photo.source==='owned'?'平台实拍':photo.source==='google'?<>{photo.authorUri?<a href={photo.authorUri} target="_blank" rel="noreferrer">照片：{photo.authorName||'Google Maps 用户'}</a>:<span>照片：{photo.authorName||'Google Maps 用户'}</span>}{photo.googleMapsUri&&<a href={photo.googleMapsUri} target="_blank" rel="noreferrer">在 Google Maps 查看</a>}</>:<span>示意图 · 实拍照片待补充</span>}</figcaption></figure>
}
