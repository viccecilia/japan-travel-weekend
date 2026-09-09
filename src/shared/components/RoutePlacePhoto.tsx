import {useEffect,useMemo,useState} from 'react';
import type {PassengerLocale} from '../i18n/passengerLocale';
import {initialGuidedTourPhoto,loadGuidedTourPhoto,type GuidedTourPhoto} from '../services/guidedTourPhotos';
import type {GuidedTourNode} from '../types/guidedTour';

const captions={
  'zh-CN':{photo:'照片',maps:'在 Google Maps 查看',fallback:'地点照片配置中'},'zh-TW':{photo:'照片',maps:'在 Google Maps 查看',fallback:'地點照片設定中'},ja:{photo:'写真',maps:'Google マップで見る',fallback:'スポット写真を準備中'},en:{photo:'Photo',maps:'View on Google Maps',fallback:'Place photo being prepared'},es:{photo:'Foto',maps:'Ver en Google Maps',fallback:'Preparando la foto del lugar'},vi:{photo:'Ảnh',maps:'Xem trên Google Maps',fallback:'Đang chuẩn bị ảnh địa điểm'},ne:{photo:'तस्बिर',maps:'Google Maps मा हेर्नुहोस्',fallback:'स्थानको तस्बिर तयार हुँदैछ'},ko:{photo:'사진',maps:'Google 지도에서 보기',fallback:'장소 사진 준비 중'},
} as const;

export function RoutePlacePhoto({id,name,query,fallbackUrl,url,creditUrl,creditLabel,locale}:Readonly<{id:string;name:string;query:string;fallbackUrl:string;url?:string;creditUrl?:string;creditLabel?:string;locale:PassengerLocale}>){
  const node=useMemo<GuidedTourNode>(()=>({id,area:'kiyomizu',name,shortInstruction:'',latitude:0,longitude:0,trigger:{enterRadiusMeters:1,notifyOnce:true},estimatedMinutes:0,kind:'landmark',branches:['default'],verificationStatus:'map-checked',photos:{owned:null,google:{textQuery:query},fallbackUrl}}),[id,name,query,fallbackUrl]);
  const [photo,setPhoto]=useState<GuidedTourPhoto>(()=>initialGuidedTourPhoto(node));
  useEffect(()=>{if(url)return;let active=true;setPhoto(initialGuidedTourPhoto(node));void loadGuidedTourPhoto(node,import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY).then(value=>{if(active)setPhoto(value)});return()=>{active=false}},[node,url]);
  const c=captions[locale];
  const mapsSearch=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  if(url)return <figure className="guided-node-photo route-place-photo"><img src={url} alt={name} loading="lazy"/><figcaption>{creditUrl?<a href={creditUrl} target="_blank" rel="noreferrer">{c.photo}: {creditLabel||'Wikimedia Commons'}</a>:<span>{c.photo}: {creditLabel||'Japan Travel Weekend'}</span>}<a href={mapsSearch} target="_blank" rel="noreferrer">{c.maps}</a></figcaption></figure>;
  if(photo.source==='fallback')return <figure className="guided-node-photo route-place-photo route-place-photo-pending"><a href={mapsSearch} target="_blank" rel="noreferrer"><span aria-hidden="true">⌖</span><b>{name}</b><small>{c.fallback}</small></a><figcaption><a href={mapsSearch} target="_blank" rel="noreferrer">{c.maps}</a></figcaption></figure>;
  return <figure className="guided-node-photo route-place-photo"><img src={photo.url} alt={photo.alt} loading="lazy" onError={()=>setPhoto(initialGuidedTourPhoto({...node,photos:{...node.photos,google:null}}))}/><figcaption>{photo.authorUri?<a href={photo.authorUri} target="_blank" rel="noreferrer">{c.photo}: {photo.authorName||'Google Maps'}</a>:<span>{c.photo}: {photo.authorName||'Google Maps'}</span>}{photo.googleMapsUri&&<a href={photo.googleMapsUri} target="_blank" rel="noreferrer">{c.maps}</a>}</figcaption></figure>;
}
