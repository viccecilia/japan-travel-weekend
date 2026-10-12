import {isSeedEnabled} from '../config/businessRules';import {resolveAttractionId} from '../attractions';import {trips} from './trips';import {seedDepartures,seedGroups,seedTripRoom} from './seed';import type {Departure,Trip,TripRoomData,VehicleGroup} from '../types';
export type PublishedTripCatalogRow={id:string;slug:string;title:string;content:Record<string,unknown>;heroImageUrl:string|null;gallery:string[];revisionNumber:number;updatedAt:string};
const baselineTrips=structuredClone(trips);
const strings=(value:unknown,fallback:string[])=>Array.isArray(value)&&value.every(item=>typeof item==='string')?value:fallback;
const contentText=(content:Record<string,unknown>,key:string,fallback:string)=>key in content&&typeof content[key]==='string'?String(content[key]):fallback;
const video=(value:unknown):Trip['timeline'][number]['video']=>{if(!value||typeof value!=='object'||Array.isArray(value))return undefined;const row=value as Record<string,unknown>;return typeof row.url==='string'&&typeof row.storagePath==='string'&&row.mimeType==='video/mp4'&&Number.isFinite(row.sizeBytes)?{url:row.url,storagePath:row.storagePath,posterUrl:typeof row.posterUrl==='string'?row.posterUrl:undefined,durationSeconds:Number.isFinite(row.durationSeconds)?Number(row.durationSeconds):undefined,aspectRatio:typeof row.aspectRatio==='string'?row.aspectRatio:undefined,mimeType:'video/mp4',sizeBytes:Number(row.sizeBytes)}:undefined};
export const publishedTripTimeline=(value:unknown,fallback:Trip['timeline']):Trip['timeline']=>Array.isArray(value)?value.flatMap(item=>{if(!item||typeof item!=='object')return [];const row=item as Record<string,unknown>;const title=typeof row.title==='string'?row.title:typeof row.name==='string'?row.name:'';const attractionId=typeof row.attractionId==='string'?row.attractionId:undefined;if(!title&&!attractionId)return [];const rawTime=typeof row.time==='string'?row.time:typeof row.arrivalTime==='string'?row.arrivalTime:'';return [{id:typeof(row.id??row.stopId??row.placeId)==='string'?String(row.id??row.stopId??row.placeId):undefined,attractionId,selectedImageIds:strings(row.selectedImageIds,[]),selectedVideoIds:strings(row.selectedVideoIds,[]),time:rawTime.trim()||null,title,subtitle:typeof row.subtitle==='string'?row.subtitle:undefined,detail:typeof row.detail==='string'?row.detail:typeof row.shortDescription==='string'?row.shortDescription:typeof row.description==='string'?row.description:'',shortDescription:typeof row.shortDescription==='string'?row.shortDescription:undefined,longDescription:typeof row.longDescription==='string'?row.longDescription:undefined,videoLabel:typeof row.videoLabel==='string'?row.videoLabel:undefined,location:typeof row.location==='string'?row.location:title,stayMinutes:Number.isInteger(row.stayMinutes)?Number(row.stayMinutes):null,type:typeof row.type==='string'?row.type:undefined,tags:strings(row.tags,[]),imageUrl:typeof row.imageUrl==='string'?row.imageUrl:undefined,gallery:strings(row.gallery,[]),highlights:strings(row.highlights,[]),tip:typeof row.tip==='string'?row.tip:undefined,video:video(row.video)}] }):fallback;

/** Combine the complete legacy operating schedule with Route Studio's linked attraction rows. */
export function reconciledPublishedTripTimeline(itinerary:unknown,itineraryStops:unknown,fallback:Trip['timeline']):Trip['timeline']{
  const primary=publishedTripTimeline(itinerary,fallback);
  const operational=publishedTripTimeline(itineraryStops,[]);
  if(operational.length<2||!operational.some(item=>item.time))return primary;
  const used=new Set<number>();
  const matchedIndexes=primary.map(item=>{
    const attractionId=resolveAttractionId(item,'zh-CN');
    const index=operational.findIndex((candidate,candidateIndex)=>{
      if(used.has(candidateIndex))return false;
      if(item.id&&candidate.id===item.id)return true;
      const candidateAttractionId=resolveAttractionId(candidate,'zh-CN');
      return Boolean(attractionId&&candidateAttractionId===attractionId);
    });
    if(index>=0)used.add(index);
    return index;
  });
  const ranked=operational.map((item,index)=>{
    const primaryIndex=matchedIndexes.indexOf(index);
    if(primaryIndex<0)return {rank:index,item};
    const current=primary[primaryIndex];
    return {rank:index,item:{
      ...item,
      ...current,
      time:current.time??item.time,
      imageUrl:current.imageUrl||item.imageUrl,
      gallery:current.gallery?.length?current.gallery:item.gallery,
      selectedImageIds:current.selectedImageIds?.length?current.selectedImageIds:item.selectedImageIds,
      selectedVideoIds:current.selectedVideoIds?.length?current.selectedVideoIds:item.selectedVideoIds,
      video:current.video??item.video,
    }};
  });
  primary.forEach((item,index)=>{
    if(matchedIndexes[index]>=0)return;
    let previous=-1;
    for(let cursor=index-1;cursor>=0;cursor--){if(matchedIndexes[cursor]>=0){previous=matchedIndexes[cursor];break;}}
    const priorUnmatched=matchedIndexes.slice(0,index).filter(value=>value<0).length;
    ranked.push({rank:previous+(priorUnmatched+1)/100,item});
  });
  return ranked.sort((left,right)=>left.rank-right.rank).map(entry=>entry.item);
}
const emptyTrip=(row:PublishedTripCatalogRow):Trip=>({id:row.id,slug:row.slug,title:row.title,shortTitle:row.title,subtitle:'',summary:'',description:'',region:'',duration:'',walkingLevel:'',categories:[],heroImage:row.heroImageUrl??'',gallery:row.gallery,highlights:[],stops:[],timeline:[],meetingPoint:null,departureTime:null,returnTime:null,price:null,priceStatus:'待公布',minimumGuests:null,maximumGuests:null,availableSeats:null,seatStatus:'未开放',included:[],excluded:[],languages:[],mealOptions:'',childPolicy:'',luggagePolicy:'',suitableFor:[],notices:[],packingList:[],clothingAdvice:'',friendlyReminders:[],assistanceStatus:'',cancellationPolicy:'',weatherPolicy:'',sourceUrl:'',imageCredits:[],status:'标准路线'});
export function replacePublishedTripCatalog(rows:PublishedTripCatalogRow[]){
  const next=rows.map(row=>{const base=baselineTrips.find(item=>item.slug===row.slug)??emptyTrip(row);const content=row.content??{};const localizedContent=typeof content.locales==='object'&&content.locales!==null?content.locales as Record<string,Record<string,unknown>>:{};const publishedTimeline=reconciledPublishedTripTimeline(content.itinerary,content.itineraryStops,[]);const publishedStops='stops' in content?strings(content.stops,[]):publishedTimeline.map(item=>item.title);return {...base,id:row.id,slug:row.slug,title:row.title,shortTitle:contentText(content,'shortTitle',row.title),subtitle:contentText(content,'subtitle',''),tagline:contentText(content,'tagline',''),summary:contentText(content,'summary',''),description:contentText(content,'description',''),heroTitle:contentText(content,'heroTitle',''),heroSubtitle:contentText(content,'heroSubtitle',''),heroHighlightPhrase:contentText(content,'heroHighlightPhrase',''),heroVideo:video(content.heroVideo),heroAspectRatio:contentText(content,'heroAspectRatio','16:9'),departureCity:contentText(content,'departureCity',''),region:contentText(content,'region',''),duration:contentText(content,'duration',''),walkingLevel:contentText(content,'walkingLevel',''),heroImage:row.heroImageUrl??'',gallery:row.gallery,highlights:strings(content.highlights,[]),stops:publishedStops,timeline:publishedTimeline,included:strings(content.included,[]),excluded:strings(content.excluded,[]),preparation:strings(content.preparation,[]),languages:strings(content.languages,[]),mealOptions:contentText(content,'mealInfo',''),childPolicy:contentText(content,'childPolicy',''),luggagePolicy:contentText(content,'luggagePolicy',''),suitableFor:strings(content.suitableFor,[]),notices:strings(content.notices,[]),routeReminders:Array.isArray(content.routeReminders)?content.routeReminders:[],bookingNotice:contentText(content,'bookingNotice',''),participantRules:contentText(content,'participantRules',''),weatherNotice:contentText(content,'weatherNotice',''),baggageNotice:contentText(content,'baggageNotice',''),safetyNotice:contentText(content,'safetyNotice',''),translationListItems:typeof content.translationListItems==='object'&&content.translationListItems!==null?content.translationListItems as Record<string,Array<{id:string;source:string}>>:undefined,packingList:strings(content.packingList,[]),clothingAdvice:contentText(content,'clothingAdvice',''),friendlyReminders:strings(content.friendlyReminders,[]),assistanceStatus:contentText(content,'accessibilityInfo',''),cancellationPolicy:contentText(content,'cancellationPolicy',''),weatherPolicy:contentText(content,'weatherPolicy',''),catalogSource:'published',localizedContent} as Trip});
  trips.splice(0,trips.length,...next);
}
export interface TravelRepository{listTrips():Trip[];getTrip(slug:string):Trip|undefined;listDepartures():Departure[];getDeparture(id:string):Departure|undefined;getVehicleGroup(id:string):VehicleGroup|undefined;getTripRoomForGroup(id:string):TripRoomData|null}
export function createMemoryRepository(seedEnabled=isSeedEnabled):TravelRepository{const departures=seedEnabled?seedDepartures:[];const groups=seedEnabled?seedGroups:[];const room=seedEnabled?seedTripRoom:null;return {listTrips:()=>trips,getTrip:slug=>trips.find(t=>t.slug===slug),listDepartures:()=>departures,getDeparture:id=>departures.find(d=>d.id===id),getVehicleGroup:id=>groups.find(g=>g.id===id),getTripRoomForGroup:id=>room?.vehicleGroupId===id?structuredClone(room):null}}
export const travelRepository=createMemoryRepository();
