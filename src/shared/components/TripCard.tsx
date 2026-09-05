import { Link } from "react-router-dom";
import type { Trip } from "../types";
import type {PassengerLocale} from '../i18n/passengerLocale';
const appCardCopy:Record<PassengerLocale,{route:string;view:string}>={
  'zh-CN':{route:'简要路线',view:'查看路线'},'zh-TW':{route:'簡要路線',view:'查看路線'},ja:{route:'主なルート',view:'ツアーを見る'},en:{route:'Route summary',view:'View trip'},vi:{route:'Tuyến tóm tắt',view:'Xem chuyến'},ne:{route:'रुट सारांश',view:'यात्रा हेर्नुहोस्'},ko:{route:'간단 노선',view:'여행 보기'}
};
export function TripCard({ trip, app = false, showcaseIndex,locale='zh-CN' }: { trip: Trip; app?: boolean; showcaseIndex?: number;locale?:PassengerLocale }) {
  const c=appCardCopy[locale];
  if(showcaseIndex!=null)return <article className="trip-card editorial-trip-card">
    <header className="editorial-trip-head"><span>0{showcaseIndex} · {trip.region} · {trip.duration}</span><h3>{trip.title}</h3><p>{trip.summary}</p></header>
    <div className="trip-card-media"><img src={trip.heroImage} alt={`${trip.shortTitle}路线风景`} />{showcaseIndex===1&&<b className="featured-badge">本期推荐</b>}</div>
    <footer className="editorial-trip-route"><div><span>简要路线</span><p>{trip.stops.slice(0,4).join(' → ')}</p></div><Link className="editorial-trip-link" to={`/trips/${trip.slug}`} aria-label={`查看${trip.shortTitle}完整路线`}>查看详情 <b>→</b></Link></footer>
  </article>;
  return (
    <article className="trip-card">
      <div className="trip-card-media"><img src={trip.heroImage} alt={`${trip.shortTitle}路线风景`} /></div>
      <div>
        <div className="eyebrow">
          {trip.region} · {trip.duration}
        </div>
        <h3>{trip.title}</h3>
        <p>{trip.summary}</p>
        {app ? <p className="app-card-route"><b>{c.route}</b>{trip.stops.slice(0,4).join(' → ')}</p> : <div className="chips">
          {trip.categories.map((c) => <span key={c}>{c}</span>)}
          <span>价格待公布</span><span>{trip.status==='标准路线'?'标准路线内容':'日期未开放'}</span>
        </div>}
        <Link
          className="text-link"
          to={`${app ? "/app/trips" : "/trips"}/${trip.slug}`}
        >
          {app?c.view:'查看路线'} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
