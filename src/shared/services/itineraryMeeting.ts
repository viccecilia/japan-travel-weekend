export type ItineraryStopStatus='upcoming'|'current'|'completed'|'changed';
export type ItineraryStop={
  id:string;name:string;arrivalTime?:string;meetingTime:string;meetingPointName:string;
  meetingPointDescription?:string;meetingPointPhoto?:string;latitude:number;longitude:number;
  status:ItineraryStopStatus;
};

export type MeetingUrgency={minutesRemaining:number;progress:number;tone:'blue'|'orange'|'red';late:boolean};

function minutesOf(value:string){const [hours,minutes]=value.split(':').map(Number);return hours*60+minutes}
export function currentMeetingStop(stops:readonly ItineraryStop[]){
  return stops.find(stop=>stop.status==='changed')??stops.find(stop=>stop.status==='current')??stops.find(stop=>stop.status==='upcoming')??stops.at(-1)??null;
}
export function meetingUrgency(stop:ItineraryStop,now=new Date()):MeetingUrgency{
  const nowMinutes=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
  const meeting=minutesOf(stop.meetingTime);
  const arrival=stop.arrivalTime?minutesOf(stop.arrivalTime):Math.max(0,meeting-60);
  const duration=Math.max(1,meeting-arrival);
  const remaining=meeting-nowMinutes;
  return {minutesRemaining:Math.ceil(remaining),progress:Math.max(0,Math.min(100,((nowMinutes-arrival)/duration)*100)),tone:remaining<5?'red':remaining<15?'orange':'blue',late:remaining<0};
}
export function applyMeetingChange(stops:readonly ItineraryStop[],change:{stopId:string;meetingTime?:string;meetingPointName?:string;latitude?:number;longitude?:number}){
  return stops.map(stop=>stop.id===change.stopId?{...stop,...change,status:'changed' as const}:stop);
}

export function projectItineraryStops(stops:readonly Omit<ItineraryStop,'status'>[],currentMeetingName:string){
  const currentIndex=stops.findIndex(stop=>stop.meetingPointName===currentMeetingName||stop.name===currentMeetingName);
  return {currentIndex,stops:stops.map((stop,index)=>({...stop,status:(index<currentIndex?'completed':index===currentIndex?'current':'upcoming') as ItineraryStopStatus}))};
}
