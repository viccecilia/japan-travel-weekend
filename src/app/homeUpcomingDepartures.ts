import type {Departure} from '../shared/types';

export function tokyoDateKey(value: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}

export function nextTokyoDays(now = new Date(), count = 7): string[] {
  const start = new Date(`${tokyoDateKey(now)}T00:00:00+09:00`).getTime();
  return Array.from({length:count}, (_, index) => tokyoDateKey(new Date(start + index * 86_400_000)));
}

export function selectDeparturesForTokyoDate(departures:Departure[], slugs:string[], date:string, now=new Date()) {
  return selectUpcomingDepartures(departures.filter(item => item.departureTime && tokyoDateKey(item.departureTime) === date), slugs, now);
}

export const isHomeSellableDeparture=(departure:Departure)=>
  !departure.dateLabel.includes('TEST-')&&
  !departure.isSeed&&
  departure.inventoryStatus==='权威库存'&&
  departure.departureTime!==null&&
  departure.meetingPointName!==null&&
  departure.price!==null&&
  departure.availableSeats!==null&&
  departure.availableSeats>0;

export function selectUpcomingDepartures(departures:Departure[],orderedTripSlugs:string[],now=new Date()){
  const nearestByTrip=new Map<string,Departure>();
  departures.filter(isHomeSellableDeparture)
    .filter(item=>new Date(item.departureTime as string).getTime()>=now.getTime())
    .sort((a,b)=>new Date(a.departureTime as string).getTime()-new Date(b.departureTime as string).getTime())
    .forEach(item=>{if(!nearestByTrip.has(item.tripSlug))nearestByTrip.set(item.tripSlug,item)});
  return orderedTripSlugs.map(slug=>nearestByTrip.get(slug)).filter((item):item is Departure=>Boolean(item));
}
