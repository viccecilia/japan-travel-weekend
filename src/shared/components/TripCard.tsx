import { Link } from "react-router-dom";
import type { Trip } from "../types";
export function TripCard({ trip, app = false }: { trip: Trip; app?: boolean }) {
  return (
    <article className="trip-card">
      <img src={trip.heroImage} alt={`${trip.shortTitle}路线风景`} />
      <div>
        <div className="eyebrow">
          {trip.region} · {trip.duration}
        </div>
        <h3>{trip.title}</h3>
        <p>{trip.summary}</p>
        <div className="chips">
          {trip.categories.map((c) => (
            <span key={c}>{c}</span>
          ))}
          <span>价格待公布</span>
          <span>日期未开放</span>
        </div>
        <Link
          className="text-link"
          to={`${app ? "/app/trips" : "/trips"}/${trip.slug}`}
        >
          查看详情 →
        </Link>
      </div>
    </article>
  );
}
