import type {GuidedTourNode} from '../types/guidedTour';

export type GuidedTourPhoto={url:string;alt:string;source:'owned'|'google'|'fallback';authorName?:string;authorUri?:string;googleMapsUri?:string};

const isOperationalNode=(node:GuidedTourNode)=>node.kind==='dropoff'||node.kind==='pickup'||node.kind==='walk';

export function initialGuidedTourPhoto(node:GuidedTourNode):GuidedTourPhoto{
  if(node.photos.owned)return {...node.photos.owned,source:'owned'};
  return {url:node.photos.fallbackUrl,alt:`${node.name}参考图片`,source:'fallback'};
}

export async function loadGuidedTourPhoto(node:GuidedTourNode,apiKey:string|undefined,fetcher:typeof fetch=fetch):Promise<GuidedTourPhoto>{
  const initial=initialGuidedTourPhoto(node);
  if(node.photos.owned||isOperationalNode(node)||!node.photos.google||!apiKey?.trim())return initial;
  try{
    const fields='places.id,places.displayName,places.googleMapsUri,places.photos.name,places.photos.authorAttributions';
    const response=await fetcher('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':apiKey.trim(),'X-Goog-FieldMask':fields},body:JSON.stringify({textQuery:node.photos.google.textQuery,languageCode:'zh-CN',regionCode:'JP',maxResultCount:1})});
    if(!response.ok)return initial;
    const body=await response.json() as {places?:Array<{displayName?:{text?:string};googleMapsUri?:string;photos?:Array<{name?:string;authorAttributions?:Array<{displayName?:string;uri?:string}>}>}>};
    const place=body.places?.[0],photo=place?.photos?.[0];if(!place||!photo?.name)return initial;
    const media=await fetcher(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=900&skipHttpRedirect=true&key=${encodeURIComponent(apiKey.trim())}`);
    if(!media.ok)return initial;const result=await media.json() as {photoUri?:string};if(!result.photoUri)return initial;
    const author=photo.authorAttributions?.[0];return {url:result.photoUri,alt:place.displayName?.text||node.name,source:'google',authorName:author?.displayName,authorUri:author?.uri,googleMapsUri:place.googleMapsUri};
  }catch{return initial}
}
