import {useEffect,useRef,useState} from 'react';
import {useLocation,useParams,useSearchParams} from 'react-router-dom';
import {useApp} from './store';
import {attractionGuideCorpus,type AttractionGuideLocale,type AttractionRecord} from '../shared/attractions/guideCorpus.generated';
import {isAttractionLocale,type AttractionLocale} from '../shared/attractions';
import './attractionGuide.css';

const copy:Record<AttractionLocale,{audio:string;description:string;media:string;pending:string;unavailable:string}>={
  'zh-CN':{audio:'语音导览',description:'景点介绍',media:'图片与视频',pending:'',unavailable:'语音暂时无法播放'},
  ja:{audio:'音声ガイド',description:'スポット紹介',media:'写真と動画',pending:'',unavailable:'音声を再生できません'},
  en:{audio:'Audio guide',description:'About this place',media:'Photos and videos',pending:'',unavailable:'Audio is temporarily unavailable'},
  ko:{audio:'오디오 가이드',description:'명소 소개',media:'사진 및 동영상',pending:'',unavailable:'오디오를 재생할 수 없습니다'},
  vi:{audio:'Hướng dẫn âm thanh',description:'Giới thiệu điểm đến',media:'Ảnh và video',pending:'',unavailable:'Không thể phát âm thanh lúc này'},
  ne:{audio:'अडियो गाइड',description:'स्थान परिचय',media:'तस्बिर र भिडियो',pending:'',unavailable:'अडियो अहिले चलाउन सकिँदैन'},
  es:{audio:'Guía de audio',description:'Sobre este lugar',media:'Fotos y vídeos',pending:'',unavailable:'El audio no está disponible temporalmente'},
};

function guideLocale(locale:string):AttractionLocale|null{return isAttractionLocale(locale)?locale:null;}
function AudioGuide({src,label,unavailable}:{src:string;label:string;unavailable:string}){
  const audio=useRef<HTMLAudioElement>(null); const [playing,setPlaying]=useState(false);const [duration,setDuration]=useState(0);const [current,setCurrent]=useState(0);const [failed,setFailed]=useState(false);
  const toggle=()=>{const element=audio.current;if(!element)return;if(element.paused)void element.play();else element.pause();};
  const format=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  if(failed)return <p className="attraction-audio-error">{unavailable}</p>;
  return <section className="attraction-audio" aria-label={label}><b>🎧 {label}</b><audio ref={audio} preload="none" src={src} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onLoadedMetadata={event=>setDuration(event.currentTarget.duration||0)} onTimeUpdate={event=>setCurrent(event.currentTarget.currentTime)} onError={()=>setFailed(true)}/><div><button type="button" onClick={toggle} aria-label={playing?'Pause':'Play'}>{playing?'Ⅱ':'▶'}</button><input aria-label="Audio progress" type="range" min="0" max={duration||0} step="0.1" value={Math.min(current,duration||0)} onChange={event=>{const value=Number(event.target.value);if(audio.current)audio.current.currentTime=value;setCurrent(value);}}/><small>{format(current)} / {format(duration)}</small><span>1×</span></div></section>;
}

export function AttractionGuidePage(){
  const {attractionId=''}=useParams(); const location=useLocation(); const {state,services}=useApp(); const [params]=useSearchParams();const locale=guideLocale(state.ui.locale??'zh-CN'); const c=copy[locale??'zh-CN'];
  const staticGuide=(attractionGuideCorpus as AttractionRecord[]).find(item=>item.slug===attractionId)||null;
  const [remote,setRemote]=useState<{title:string;body:string;audioUrl:string|null}|null>(null);
  const [media,setMedia]=useState<{id:string;mediaType:'image'|'video';url:string;originalFilename:string}[]>([]);
  const [loading,setLoading]=useState(Boolean(services));
  useEffect(()=>{let live=true;setRemote(null);setMedia([]);setLoading(Boolean(services&&locale));if(!services||!locale){setLoading(false);return()=>{live=false};}void services.loadAttractionGuide(attractionId,locale).then(guideResult=>{if(live){setRemote(guideResult.data?{title:guideResult.data.title,body:guideResult.data.body,audioUrl:guideResult.data.audioUrl}:null);setLoading(false);}}).catch(()=>{if(live)setLoading(false)});void services.loadAttractionMedia(attractionId).then(mediaResult=>{if(live)setMedia(mediaResult.data)}).catch(()=>{if(live)setMedia([])});return()=>{live=false;};},[services,attractionId,locale]);
  const guide=remote??(!services&&locale?staticGuide?.guides[locale]:null)??null;
  const audioUrl=remote?.audioUrl??(!services&&locale?staticGuide?.audio[locale]?.audioUrl:null)??null;
  const image=(location.state as {image?:string}|null)?.image??params.get('image');
  if(loading&&!guide)return <main className="attraction-guide-page"><p>Loading guide…</p></main>;
  if(!guide)return <main className="attraction-guide-page"><h1>Guide unavailable</h1></main>;
  return <main className="attraction-guide-page"><header><span>ATTRACTION GUIDE</span><h1>{guide.title}</h1></header>{image&&<img className="attraction-guide-cover" src={image} alt="" loading="lazy"/>}{audioUrl&&<AudioGuide src={audioUrl} label={c.audio} unavailable={c.unavailable}/>}<section className="attraction-guide-body"><h2>{c.description}</h2>{guide.body.split(/\n{2,}/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>{media.length>0&&<section className="attraction-guide-media"><h2>{c.media}</h2><div>{media.map(item=>item.mediaType==='video'?<video key={item.id} controls preload="metadata" src={item.url} aria-label={item.originalFilename}/>:<img key={item.id} src={item.url} alt={item.originalFilename} loading="lazy"/>)}</div></section>}</main>;
}
