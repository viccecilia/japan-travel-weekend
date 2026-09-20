import {useEffect, useRef, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {useApp} from './store';
import {travelRepository} from '../shared/data/repository';
import {discoverLabels, discoverProduct, discoverText, initialDiscoverHeroes, visibleDiscoverHeroes, type DiscoverHero} from '../shared/discover';
import './discover.css';

export function Discover() {
 const {state,services}=useApp();
 const [heroes,setHeroes]=useState<DiscoverHero[]>(initialDiscoverHeroes);
 const [activeId,setActiveId]=useState(initialDiscoverHeroes[0].id);
 const navigate=useNavigate();
 const start=useRef<{x:number;y:number}|null>(null);
 const locale=state.ui.locale??'zh-CN';
 const c=discoverLabels[locale];
 useEffect(()=>{
   let alive=true;
   const refresh=()=>{void services?.operations.listDiscoverHeroes(false).then(result=>{if(alive&&!result.error)setHeroes(result.data)}).catch(()=>{/* Keep the last loaded/static public content on a network failure. */})};
   refresh();
   window.addEventListener('focus',refresh);
   return ()=>{alive=false;window.removeEventListener('focus',refresh)};
 },[services]);
 const trips=travelRepository.listTrips();
 const visible=visibleDiscoverHeroes(heroes,trips);
 const index=Math.max(0,visible.findIndex(hero=>hero.id===activeId));
 const hero=visible[index];
 const product=hero?discoverProduct(hero,trips):undefined;
 const change=(offset:number)=>{if(visible.length)setActiveId(visible[(index+offset+visible.length)%visible.length].id)};
 return <section className="discover-hero" aria-label={c.discover} onDragStart={event=>event.preventDefault()}
   onPointerDown={event=>{start.current={x:event.clientX,y:event.clientY};if(!(event.target as Element).closest('button,a'))event.currentTarget.setPointerCapture?.(event.pointerId)}}
   onPointerUp={event=>{
     if(!start.current)return;
     const dx=event.clientX-start.current.x,dy=event.clientY-start.current.y;start.current=null;
     if(dy < -65 && Math.abs(dy)>Math.abs(dx)){navigate('/app/trips');return}
     if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)){change(dx<0?1:-1);return}
   }} onPointerCancel={()=>{start.current=null}}>
   {hero ? <>
     <DiscoverFilm key={hero.video_url} hero={hero}/>
     <div className="discover-shade" aria-hidden="true"/>
     <div className="discover-title">
       <span className="discover-story-kind">{product?'ROUTE STORY':'SEASONAL VLOG'}</span>
       <h1>{discoverText(hero,locale,product).title}</h1>
       <p>{discoverText(hero,locale,product).subtitle}</p>
       <span className="discover-story-tag">{product?'Route Story':'Seasonal Vlog'}</span>
     </div>
     {visible.length>1&&<>
       <button className="discover-edge discover-previous discover-control" aria-label={c.previous} onClick={()=>change(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
       <button className="discover-edge discover-next discover-control" aria-label={c.next} onClick={()=>change(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button>
     </>}
     {product&&<Link className="discover-cta discover-control" to={'/app/trips/'+product.slug}>{c.view}</Link>}
     <div className="discover-dots discover-control" aria-label={c.discover}>
       {visible.map((item,i)=><button key={item.id} aria-label={String(i+1)} aria-current={i===index?'true':undefined} onClick={()=>setActiveId(item.id)}><span/></button>)}
     </div>
   </>:<p className="discover-empty">{c.empty}</p>}
   <Link className="discover-up discover-control" to="/app/trips" aria-label={c.trips}>
     <svg viewBox="0 0 24 34" aria-hidden="true"><path d="m5 14 7-7 7 7M5 26l7-7 7 7"/></svg>
   </Link>
 </section>;
}
function DiscoverFilm({hero}:{hero:DiscoverHero}) {
 const [failed,setFailed]=useState(false);
 return <div className="discover-film">
   <img src={hero.poster_url} alt="" fetchPriority="high" draggable={false}/>
   {!failed&&<video src={hero.video_url} poster={hero.poster_url} autoPlay muted loop playsInline preload="metadata" draggable={false} onError={()=>setFailed(true)}/>}
 </div>;
}
