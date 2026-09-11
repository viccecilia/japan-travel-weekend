import type {Departure} from '../shared/types';

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
