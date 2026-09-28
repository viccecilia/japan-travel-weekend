import {useEffect,useRef,useState} from 'react';
import {useLocation,useParams,useSearchParams} from 'react-router-dom';
import {useApp} from './store';
import {attractionGuideCorpus,type AttractionGuideLocale,type AttractionRecord} from '../shared/attractions/guideCorpus.generated';
import {isAttractionLocale,type AttractionLocale} from '../shared/attractions';
import './attractionGuide.css';

const copy:Record<AttractionLocale,{audio:string;description:string;pending:string;unavailable:string}>={
  'zh-CN':{audio:'语音导览',description:'景点介绍',pending:'',unavailable:'语音暂时无法播放'},
  ja:{audio:'音声ガイド',description:'スポット紹介',pending:'',unavailable:'音声を再生できません'},
  en:{audio:'Audio guide',description:'About this place',pending:'',unavailable:'Audio is temporarily unavailable'},
  ko:{audio:'오디오 가이드',description:'명소 소개',pending:'',unavailable:'오디오를 재생할 수 없습니다'},
  vi:{audio:'Hướng dẫn âm thanh',description:'Giới thiệu điểm đến',pending:'',unavailable:'Không thể phát âm thanh lúc này'},
  ne:{audio:'अडियो गाइड',description:'स्थान परिचय',pending:'',unavailable:'अडियो अहिले चलाउन सकिँदैन'},
  es:{audio:'Guía de audio',description:'Sobre este lugar',pending:'',unavailable:'El audio no está disponible temporalmente'},
};

function guideLocale(locale:string):AttractionLocale{return isAttractionLocale(locale)?locale:'zh-CN';}
function AudioGuide({src,label,unavailable}:{src:string;label:string;unavailable:string}){
  const audio=useRef<HTMLAudioElement>(null); const [playing,setPlaying]=useState(false);const [duration,setDuration]=useState(0);const [current,setCurrent]=useState(0);const [failed,setFailed]=useState(false);
  const toggle=()=>{const element=audio.current;if(!element)return;if(element.paused)void element.play();else element.pause();};
  const format=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  if(failed)return <p className="attraction-audio-error">{unavailable}</p>;
  return <section className="attraction-audio" aria-label={label}><b>🎧 {label}</b><audio ref={audio} preload="none" src={src} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onLoadedMetadata={event=>setDuration(event.currentTarget.duration||0)} onTimeUpdate={event=>setCurrent(event.currentTarget.currentTime)} onError={()=>setFailed(true)}/><div><button type="button" onClick={toggle} aria-label={playing?'Pause':'Play'}>{playing?'Ⅱ':'▶'}</button><input aria-label="Audio progress" type="range" min="0" max={duration||0} step="0.1" value={Math.min(current,duration||0)} onChange={event=>{const value=Number(event.target.value);if(audio.current)audio.current.currentTime=value;setCurrent(value);}}/><small>{format(current)} / {format(duration)}</small><span>1×</span></div></section>;
}

export function AttractionGuidePage(){
  const {attractionId=''}=useParams(); const location=useLocation(); const {state,services}=useApp(); const [params]=useSearchParams();const locale=guideLocale(state.ui.locale??'zh-CN'); const c=copy[locale];
  const staticGuide=(attractionGuideCorpus as AttractionRecord[]).find(item=>item.slug===attractionId)||null;
  const [remote,setRemote]=useState<{title:string;body:string;audioUrl:string|null}|null>(null);
  const [loading,setLoading]=useState(Boolean(services));
  useEffect(()=>{let live=true;setRemote(null);setLoading(Boolean(services));if(!services){setLoading(false);return;}void services.loadAttractionGuide(attractionId,locale).then(result=>{if(live){setRemote(result.data?{title:result.data.title,body:result.data.body,audioUrl:result.data.audioUrl}:null);setLoading(false);}}).catch(()=>{if(live)setLoading(false);});return()=>{live=false;};},[services,attractionId,locale]);
  const guide=remote??staticGuide?.guides[locale]??null;
  const audioUrl=remote?.audioUrl??staticGuide?.audio[locale]?.audioUrl??null;
  const image=(location.state as {image?:string}|null)?.image??params.get('image');
  if(loading&&!guide)return <main className="attraction-guide-page"><p>Loading guide…</p></main>;
  if(!guide)return <main className="attraction-guide-page"><h1>Guide unavailable</h1></main>;
  return <main className="attraction-guide-page"><header><span>ATTRACTION GUIDE</span><h1>{guide.title}</h1></header>{image&&<img className="attraction-guide-cover" src={image} alt="" loading="lazy"/>}{audioUrl&&<AudioGuide src={audioUrl} label={c.audio} unavailable={c.unavailable}/>}<section className="attraction-guide-body"><h2>{c.description}</h2>{guide.body.split(/\n{2,}/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section></main>;
}
