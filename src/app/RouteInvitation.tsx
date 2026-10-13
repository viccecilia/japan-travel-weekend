import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import type {PassengerLocale} from '../shared/i18n/passengerLocale';
import {travelRepository} from '../shared/data/repository';
import {localizedRouteTimeline,presentRoute,routeHeroPresentation} from '../shared/routeLocalePresentation';
import {captureReferralAttribution,referralReturnTo} from '../shared/referralAttribution';
import {useApp} from './store';
import {routeInvitationCopy} from './routeInvitationCopy';
import './routeInvitation.css';

const locales:PassengerLocale[]=['zh-CN','zh-TW','ja','en','ko','es','vi','ne'];
const labels:Record<PassengerLocale,string>={'zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語',en:'English',ko:'한국어',es:'Español',vi:'Tiếng Việt',ne:'नेपाली'};

export function RouteInvitation(){
  const {code='',slug}=useParams();const [params]=useSearchParams();const nav=useNavigate();
  const {services,departures,catalogRevision}=useApp();void catalogRevision;
  const initial=params.get('lang') as PassengerLocale;const [locale,setLocale]=useState<PassengerLocale>(locales.includes(initial)?initial:'zh-CN');
  const trips=travelRepository.listTrips();const trip=slug?travelRepository.getTrip(slug):trips[0]??null;
  const routeDepartures=trip?departures.filter(item=>item.tripSlug===trip.slug&&item.departureTime&&item.price!==null&&item.availableSeats!==null&&item.availableSeats>0):[];
  const requested=params.get('departureId')??'';const [departureId,setDepartureId]=useState(requested);
  const departure=routeDepartures.find(item=>item.id===departureId)??routeDepartures[0]??null;
  const [valid,setValid]=useState<boolean|null>(()=>services?null:false);const [notice,setNotice]=useState('');const video=useRef<HTMLVideoElement>(null);
  const normalized=code.trim().toUpperCase();
  useEffect(()=>{let live=true;if(!services)return()=>{live=false};void services.resolvePublicReferralInvitation(normalized).then(result=>{if(!live)return;setValid(result.valid);if(result.valid&&trip)captureReferralAttribution({code:result.code,routeSlug:trip.slug,locale,departureId:departure?.id??''})});return()=>{live=false}},[services,normalized,trip,locale,departure?.id]);
  useEffect(()=>{const prior=document.documentElement.lang;let active=true;queueMicrotask(()=>{if(active)document.documentElement.lang=locale});return()=>{active=false;document.documentElement.lang=prior}},[locale]);
  useEffect(()=>{if(!trip)return;const metaPresentation=presentRoute(trip,locale);const metaDescription=metaPresentation.description||metaPresentation.availabilityMessage;const metaUrl=`${window.location.origin}/r/${encodeURIComponent(normalized)}/${encodeURIComponent(trip.slug)}?${new URLSearchParams({lang:locale,...(departure?.id?{departureId:departure.id}:{})})}`;const prior=document.title;document.title=`${metaPresentation.title} | Japan Travel Weekend`;const values:{property:string;content:string}[]=[{property:'og:title',content:metaPresentation.title},{property:'og:description',content:metaDescription},{property:'og:image',content:trip.heroImage},{property:'og:url',content:metaUrl},{property:'og:locale',content:locale.replace('-','_')}];const priorTags=values.map(({property,content})=>{let tag=document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);const created=!tag;if(!tag){tag=document.createElement('meta');tag.setAttribute('property',property);document.head.append(tag)}const priorContent=tag.content;tag.content=content;return {tag,created,priorContent}});const description=document.head.querySelector<HTMLMetaElement>('meta[name="description"]');const priorDescription=description?.content??'';if(description)description.content=metaDescription;return()=>{document.title=prior;if(description)description.content=priorDescription;priorTags.forEach(({tag,created,priorContent})=>{if(created)tag.remove();else tag.content=priorContent})}},[trip,locale,normalized,departure?.id]);
  const c=routeInvitationCopy[locale];
  if(!trip)return <main className="route-invitation"><p role="status">{c.noQuote}</p></main>;
  const presentation=presentRoute(trip,locale);const hero=routeHeroPresentation(trip,locale);const description=presentation.description||presentation.availabilityMessage;const heroSubtitle=hero.subtitle||presentation.summary;const showHeroSubtitle=Boolean(heroSubtitle&&heroSubtitle.trim()!==description.trim());const shareUrl=`${window.location.origin}/r/${encodeURIComponent(normalized)}/${encodeURIComponent(trip.slug)}?${new URLSearchParams({lang:locale,...(departure?{departureId:departure.id}:{})})}`;
  const returnTo=referralReturnTo({code:normalized,routeSlug:trip.slug,locale,departureId:departure?.id??''});
  const caption=`${presentation.title}\n${c.giftBody}\n${shareUrl}`;
  const copy=async()=>{try{await navigator.clipboard.writeText(caption);setNotice(c.copied)}catch{setNotice(shareUrl)}};
  const share=async()=>{if(!navigator.share){await copy();return}try{await navigator.share({title:presentation.title,text:c.giftBody,url:shareUrl})}catch(error){if((error as DOMException)?.name==='AbortError')setNotice(c.cancelled);else setNotice('')}};
  const stops=localizedRouteTimeline(trip,locale).map(item=>item.title).filter(Boolean).slice(0,4);
  const price=routeDepartures.reduce<number|null>((lowest,item)=>item.price===null?lowest:lowest===null?item.price:Math.min(lowest,item.price),null);
  const changeLocale=(next:PassengerLocale)=>{const time=video.current?.currentTime??0;const playing=video.current?!video.current.paused:false;setLocale(next);requestAnimationFrame(()=>{if(video.current){video.current.currentTime=time;if(playing)void video.current.play().catch(()=>undefined)}})};
  return <main className="route-invitation" lang={locale}><header className="route-invitation-brand"><b>Japan Travel Weekend</b><label>{c.language}<select value={locale} onChange={event=>changeLocale(event.target.value as PassengerLocale)}>{locales.map(item=><option value={item} key={item}>{labels[item]}</option>)}</select></label></header>
    <section className="route-invitation-card">
      <div className="route-invitation-media">{trip.heroVideo?.url?<video ref={video} controls playsInline poster={trip.heroVideo.posterUrl??trip.heroImage} src={trip.heroVideo.url}/>:<img src={trip.heroImage} alt=""/>}<div><small>{c.eyebrow}</small><h1>{hero.title||presentation.title}</h1>{showHeroSubtitle&&<p>{heroSubtitle}</p>}</div></div>
      <div className="route-invitation-body"><p className="route-invitation-description">{description}</p>{valid===false&&<p className="route-invitation-warning" role="status">{c.invalid}</p>}<section className="route-invitation-gift"><h2>{c.gift}</h2><p>{c.giftBody}</p><small>{c.giftRule}</small></section>
      <div className="route-invitation-facts"><span><small>{c.from}</small><b>{price===null?c.noQuote:`¥${price.toLocaleString(locale)}`}</b></span><span><small>{c.meeting}</small><b>{departure?.meetingPointName??'—'}</b></span></div>
      {routeDepartures.length>1&&<label className="route-invitation-departure">{c.selectRoute}<select value={departure?.id??''} onChange={event=>setDepartureId(event.target.value)}>{routeDepartures.map(item=><option key={item.id} value={item.id}>{new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(item.departureTime!))}</option>)}</select></label>}
      <section className="route-invitation-stops"><h2>{c.stops}</h2>{stops.map((item,index)=><article key={`${item}-${index}`}><span>{index+1}</span><b>{item}</b></article>)}</section>
      <div className="route-invitation-actions"><Link className="button full" to={`/app/trips/${encodeURIComponent(trip.slug)}?${new URLSearchParams({ref:normalized,lang:locale,...(departure?{departureId:departure.id}:{})})}`}>{c.details}</Link>{valid&&<Link className="button secondary full" to={`/app/create-account?ref=${encodeURIComponent(normalized)}&returnTo=${encodeURIComponent(returnTo)}`}>{c.register}</Link>}<button type="button" onClick={()=>void share()}>{c.share}</button><button type="button" onClick={()=>void copy()}>{c.copy}</button></div>{notice&&<p role="status">{notice}</p>}</div>
    </section>
    {trips.length>1&&<nav className="route-invitation-route-list" aria-label={c.selectRoute}>{trips.map(item=><button type="button" className={item.slug===trip.slug?'active':''} onClick={()=>nav(`/r/${encodeURIComponent(normalized)}/${encodeURIComponent(item.slug)}?lang=${locale}`)} key={item.slug}>{presentRoute(item,locale).title}</button>)}</nav>}
  </main>;
}
