import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import type {PassengerLocale} from '../shared/i18n/passengerLocale';
import {travelRepository} from '../shared/data/repository';
import {localizedRouteTimeline,presentRoute,routeAttractionCardTimeline} from '../shared/routeLocalePresentation';
import {captureReferralAttribution,referralReturnTo} from '../shared/referralAttribution';
import {useApp} from './store';
import {routeInvitationCopy} from './routeInvitationCopy';
import './routeInvitation.css';

const locales:PassengerLocale[]=['zh-CN','zh-TW','ja','en','ko','es','vi','ne'];
const labels:Record<PassengerLocale,string>={'zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語',en:'English',ko:'한국어',es:'Español',vi:'Tiếng Việt',ne:'नेपाली'};
type ReferralState='verifying'|'valid'|'invalid'|'network_error'|'ineligible';

function LanguageSelect({locale,onChange,label}:Readonly<{locale:PassengerLocale;onChange:(locale:PassengerLocale)=>void;label:string}>){
  return <label className="route-invitation-language">
    <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/></svg>
    <span className="sr-only">{label}</span>
    <select aria-label={label} value={locale} onChange={event=>onChange(event.target.value as PassengerLocale)}>{locales.map(item=><option value={item} key={item}>{labels[item]}</option>)}</select>
  </label>;
}

export function RouteInvitation(){
  const {code='',slug}=useParams();const [params]=useSearchParams();const nav=useNavigate();
  const {services,departures,catalogRevision}=useApp();void catalogRevision;
  const initial=params.get('lang') as PassengerLocale;const [locale,setLocale]=useState<PassengerLocale>(locales.includes(initial)?initial:'zh-CN');
  const trips=travelRepository.listTrips();const trip=slug?travelRepository.getTrip(slug):null;
  const routeDepartures=trip?departures.filter(item=>item.tripSlug===trip.slug&&item.departureTime&&item.price!==null&&item.availableSeats!==null&&item.availableSeats>0):[];
  const requested=params.get('departureId')??'';const [departureId,setDepartureId]=useState(requested);
  const departure=routeDepartures.find(item=>item.id===departureId)??routeDepartures[0]??null;
  const [referralState,setReferralState]=useState<ReferralState>(()=>services?'verifying':'network_error');
  const [notice,setNotice]=useState('');const [videoPlaying,setVideoPlaying]=useState(false);const video=useRef<HTMLVideoElement>(null);
  const normalized=code.trim().toUpperCase();const c=routeInvitationCopy[locale];

  useEffect(()=>{let live=true;if(!services){queueMicrotask(()=>{if(live)setReferralState('network_error')});return()=>{live=false}}queueMicrotask(()=>{if(live)setReferralState('verifying')});void Promise.all([services.resolvePublicReferralInvitation(normalized),services.currentUser()]).then(([result,user])=>{if(!live)return;if(result.status==='network_error'){setReferralState('network_error');return}if(!result.valid){setReferralState('invalid');return}if(user){setReferralState('ineligible');return}setReferralState('valid');if(trip)captureReferralAttribution({code:result.code,routeSlug:trip.slug,locale,departureId:departure?.id??''})}).catch(()=>{if(live)setReferralState('network_error')});return()=>{live=false}},[services,normalized,trip,locale,departure?.id]);
  useEffect(()=>{const prior=document.documentElement.lang;let active=true;queueMicrotask(()=>{if(active)document.documentElement.lang=locale});return()=>{active=false;document.documentElement.lang=prior}},[locale]);
  useEffect(()=>{if(!trip)return;const metaPresentation=presentRoute(trip,locale);const metaDescription=metaPresentation.description||metaPresentation.availabilityMessage;const metaUrl=`${window.location.origin}/r/${encodeURIComponent(normalized)}/${encodeURIComponent(trip.slug)}?${new URLSearchParams({lang:locale,...(departure?.id?{departureId:departure.id}:{})})}`;const prior=document.title;document.title=`${metaPresentation.title} | Japan Travel Weekend`;const values:{property:string;content:string}[]=[{property:'og:title',content:metaPresentation.title},{property:'og:description',content:metaDescription},{property:'og:image',content:trip.heroImage},{property:'og:url',content:metaUrl},{property:'og:locale',content:locale.replace('-','_')}];const priorTags=values.map(({property,content})=>{let tag=document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);const created=!tag;if(!tag){tag=document.createElement('meta');tag.setAttribute('property',property);document.head.append(tag)}const priorContent=tag.content;tag.content=content;return {tag,created,priorContent}});const description=document.head.querySelector<HTMLMetaElement>('meta[name="description"]');const priorDescription=description?.content??'';if(description)description.content=metaDescription;return()=>{document.title=prior;if(description)description.content=priorDescription;priorTags.forEach(({tag,created,priorContent})=>{if(created)tag.remove();else tag.content=priorContent})}},[trip,locale,normalized,departure?.id]);

  const changeLocale=(next:PassengerLocale)=>{const time=video.current?.currentTime??0;const playing=video.current?!video.current.paused:false;setLocale(next);requestAnimationFrame(()=>{if(video.current){video.current.currentTime=time;if(playing)void video.current.play().catch(()=>undefined)}})};
  if(!slug)return <main className="route-invitation route-invitation-directory" lang={locale}>
    <header><div><b>Japan Travel Weekend</b><h1>{c.directory}</h1></div><LanguageSelect locale={locale} onChange={changeLocale} label={c.language}/></header>
    <nav aria-label={c.selectRoute}>{trips.map(item=><button type="button" onClick={()=>nav(`/r/${encodeURIComponent(normalized)}/${encodeURIComponent(item.slug)}?lang=${locale}`)} key={item.slug}><img src={item.heroImage} alt=""/><span>{presentRoute(item,locale).title}</span></button>)}</nav>
  </main>;
  if(!trip)return <main className="route-invitation"><p role="status">{c.noQuote}</p></main>;

  const presentation=presentRoute(trip,locale);const description=presentation.description||presentation.availabilityMessage;
  const shareUrl=`${window.location.origin}/r/${encodeURIComponent(normalized)}/${encodeURIComponent(trip.slug)}?${new URLSearchParams({lang:locale,...(departure?{departureId:departure.id}:{})})}`;
  const returnTo=referralReturnTo({code:normalized,routeSlug:trip.slug,locale,departureId:departure?.id??''});
  const caption=`${presentation.title}\n${description}\n${shareUrl}`;
  const copy=async()=>{try{await navigator.clipboard.writeText(caption);setNotice(c.copied)}catch{setNotice(shareUrl)}};
  const share=async()=>{if(!navigator.share){await copy();return}try{await navigator.share({title:presentation.title,text:description,url:shareUrl})}catch(error){if((error as DOMException)?.name==='AbortError')setNotice(c.cancelled);else setNotice('')}};
  const stops=routeAttractionCardTimeline(trip,localizedRouteTimeline(trip,locale),locale).map(item=>item.title).filter(Boolean).slice(0,4);
  const referralMessage=referralState==='verifying'?c.verifying:referralState==='valid'?c.valid:referralState==='invalid'?c.invalid:referralState==='network_error'?c.network:c.ineligible;
  const playVideo=()=>{if(video.current)void video.current.play().catch(()=>setVideoPlaying(false))};

  return <main className="route-invitation" lang={locale}>
    <section className="route-invitation-card">
      <div className="route-invitation-media">
        {trip.heroVideo?.url?<video ref={video} controls playsInline preload="metadata" poster={trip.heroVideo.posterUrl??trip.heroImage} src={trip.heroVideo.url} onPlay={()=>setVideoPlaying(true)} onPause={()=>setVideoPlaying(false)} onEnded={()=>setVideoPlaying(false)}/>:<img src={trip.heroImage} alt=""/>}
        <div className="route-invitation-media-brand"><span>JT</span><b>Japan Travel Weekend</b></div>
        <LanguageSelect locale={locale} onChange={changeLocale} label={c.language}/>
        {trip.heroVideo?.url&&!videoPlaying&&<button className="route-invitation-play" type="button" onClick={playVideo} aria-label={c.play}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 7 8 5-8 5z"/></svg></button>}
      </div>
      <div className="route-invitation-body">
        <small className="route-invitation-eyebrow">{c.eyebrow}</small>
        <h1>{presentation.title}</h1>
        {stops.length>0&&<p className="route-invitation-stop-summary">{stops.join(' · ')}</p>}
        <p className="route-invitation-description">{description}</p>
        <section className={`route-invitation-referral route-invitation-referral-${referralState}`} aria-live="polite"><b>{referralMessage}</b>{referralState==='valid'&&<><h2>{c.gift}</h2><p>{c.giftBody}</p><small>{c.giftRule}</small></>}</section>
        <div className="route-invitation-facts"><span><small>{c.from}</small><b>{departure?.price===null||departure?.price===undefined?c.noQuote:`¥${departure.price.toLocaleString(locale)}`}</b></span><span><small>{c.meeting}</small><b>{departure?.meetingPointName??'—'}</b></span></div>
        {routeDepartures.length>1&&<label className="route-invitation-departure">{c.selectRoute}<select value={departure?.id??''} onChange={event=>setDepartureId(event.target.value)}>{routeDepartures.map(item=><option key={item.id} value={item.id}>{new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(item.departureTime!))}</option>)}</select></label>}
        <section className="route-invitation-stops"><h2>{c.stops}</h2>{stops.map((item,index)=><article key={`${item}-${index}`}><span>{index+1}</span><b>{item}</b></article>)}</section>
        <div className="route-invitation-actions"><Link className="button full" to={`/app/trips/${encodeURIComponent(trip.slug)}?${new URLSearchParams({ref:normalized,lang:locale,...(departure?{departureId:departure.id}:{})})}`}>{c.details}</Link>{referralState==='valid'&&<Link className="button secondary full" to={`/app/create-account?ref=${encodeURIComponent(normalized)}&returnTo=${encodeURIComponent(returnTo)}`}>{c.register}</Link>}<button type="button" onClick={()=>void share()}>{c.share}</button><button type="button" onClick={()=>void copy()}>{c.copy}</button></div>
        {notice&&<p role="status" className="route-invitation-notice">{notice}</p>}
      </div>
    </section>
  </main>;
}
