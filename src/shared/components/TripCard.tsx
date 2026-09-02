import { Link } from "react-router-dom";
import type { Trip } from "../types";
export function TripCard({ trip, app = false, showcaseIndex }: { trip: Trip; app?: boolean; showcaseIndex?: number }) {
  return (
    <article className={`trip-card${showcaseIndex===1?' featured-trip-card':''}`}>
      <div className="trip-card-media"><img src={trip.heroImage} alt={`${trip.shortTitle}路线风景`} />{showcaseIndex!=null&&<><span className="trip-number">0{showcaseIndex}</span>{showcaseIndex===1&&<b className="featured-badge">本期推荐</b>}</>}</div>
      <div>
        <div className="eyebrow">
          {trip.region} · {trip.duration}
        </div>
        <h3>{trip.title}</h3>
        <p>{trip.summary}</p>
        {showcaseIndex!=null&&<div className="trip-route-line" aria-label="主要停靠点">{trip.stops.slice(0,3).map((stop,index)=><span key={stop}>{index>0&&<i>→</i>}{stop}</span>)}</div>}
        <div className="chips">
          {trip.categories.map((c) => (
            <span key={c}>{c}</span>
          ))}
          <span>价格待公布</span>
          <span>{trip.status==='标准路线'?'标准路线内容':'日期未开放'}</span>
        </div>
        <Link
          className="text-link"
          to={`${app ? "/app/trips" : "/trips"}/${trip.slug}`}
        >
          查看完整路线 <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
