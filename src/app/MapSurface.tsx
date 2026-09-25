import {useEffect,useRef,useState} from 'react';
import type {MapMarker} from '../shared/services/mapSession';
import {mapMarkerGlyph} from '../shared/services/mapSession';
import './tripMap.css';

type Point={lat:number;lng:number};
type Props={markers:MapMarker[];activeMarkerId?:string|null;followMarkerId?:string|null;onMarkerClick?:(marker:MapMarker)=>void;onMapClick?:(point:Point)=>void;onUserMapInteraction?:()=>void;interactive:boolean;emptyLabel:string;unavailableLabel:string};
declare global {interface Window {google?:any;__jtwGoogleMapsPromise?:Promise<void>;__jtwGoogleMapsReady?:()=>void}}
const googleMapsKey=import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string|undefined;
const mapsScriptId='jtw-google-maps-script';
function loadGoogleMaps(){
  if(window.google?.maps)return Promise.resolve();
  if(!googleMapsKey?.trim())return Promise.reject(new Error('missing_google_maps_key'));
  if(!window.__jtwGoogleMapsPromise){
    let script=document.getElementById(mapsScriptId) as HTMLScriptElement|null;
    // A script created by an older HMR revision did not have our readiness
    // callback. It cannot resolve this loader, so replace it instead of
    // leaving the page waiting forever after a failed/partial load.
    if(script&&!script.src.includes('callback=__jtwGoogleMapsReady')){
      script.remove();
      script=null;
    }
    let promise:Promise<void>;
    promise=new Promise((resolve,reject)=>{
      const fail=()=>{
        script?.remove();
        if(window.__jtwGoogleMapsPromise===promise)delete window.__jtwGoogleMapsPromise;
        delete window.__jtwGoogleMapsReady;
        reject(new Error('google_maps_load_failed'));
      };
      window.__jtwGoogleMapsReady=()=>{
        if(window.google?.maps){
          delete window.__jtwGoogleMapsReady;
          resolve();
        }else fail();
      };
      if(!script){
        script=document.createElement('script');script.id=mapsScriptId;
        script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&v=weekly&loading=async&libraries=marker&callback=__jtwGoogleMapsReady`;
        script.async=true;script.defer=true;
        script.addEventListener('error',fail,{once:true});document.head.append(script);
      }else{
        script.addEventListener('error',fail,{once:true});
      }
    });
    window.__jtwGoogleMapsPromise=promise;
  }
  return window.__jtwGoogleMapsPromise;
}
export function MapSurface({markers,activeMarkerId,followMarkerId,onMarkerClick,onMapClick,onUserMapInteraction,interactive,emptyLabel,unavailableLabel}:Props){
 const host=useRef<HTMLDivElement>(null);const map=useRef<any>(null);const nativeMarkers=useRef<any[]>([]);const mapClickRef=useRef(onMapClick);const markerClickRef=useRef(onMarkerClick);const interactionRef=useRef(onUserMapInteraction);const [status,setStatus]=useState<'loading'|'ready'|'unavailable'>(interactive?'loading':'unavailable');
 mapClickRef.current=onMapClick;markerClickRef.current=onMarkerClick;interactionRef.current=onUserMapInteraction;
 useEffect(()=>{let cancelled=false;if(!interactive){setStatus('unavailable');return}void loadGoogleMaps().then(()=>{if(cancelled||!host.current)return;map.current=new window.google.maps.Map(host.current,{center:markers[0]?{lat:markers[0].lat,lng:markers[0].lng}:{lat:35.0116,lng:135.7681},zoom:markers.length?14:11,disableDefaultUI:true,zoomControl:true,gestureHandling:'greedy'});map.current.addListener('click',(event:any)=>mapClickRef.current?.({lat:event.latLng.lat(),lng:event.latLng.lng()}));map.current.addListener('dragstart',()=>interactionRef.current?.());setStatus('ready')}).catch(()=>!cancelled&&setStatus('unavailable'));return()=>{cancelled=true;nativeMarkers.current.forEach(marker=>marker.setMap(null));nativeMarkers.current=[]};},[interactive]);
 useEffect(()=>{if(status!=='ready'||!map.current)return;nativeMarkers.current.forEach(marker=>marker.setMap(null));nativeMarkers.current=markers.map(marker=>{const native=new window.google.maps.Marker({map:map.current,position:{lat:marker.lat,lng:marker.lng},title:marker.label,label:{text:mapMarkerGlyph[marker.type],color:'#17242c',fontWeight:'700'}});native.addListener('click',()=>markerClickRef.current?.(marker));return native});const target=markers.find(marker=>marker.id===activeMarkerId)??markers[0];if(target)map.current.panTo({lat:target.lat,lng:target.lng})},[markers,status,activeMarkerId]);
 useEffect(()=>{if(status!=='ready'||!map.current||!followMarkerId)return;const target=markers.find(marker=>marker.id===followMarkerId);if(target)map.current.panTo({lat:target.lat,lng:target.lng})},[markers,status,followMarkerId]);
 if(status==='unavailable')return <section className="trip-map-fallback" role="status"><b>{unavailableLabel}</b><p>{markers.length?markers.map(marker=>`${mapMarkerGlyph[marker.type]} ${marker.label}`).join(' · '):emptyLabel}</p></section>;
 return <div className="trip-map-canvas" aria-busy={status==='loading'}><div ref={host}/>{status==='loading'&&<p>{emptyLabel}</p>}</div>;
}
