export type SelectableStaffTask={staff_assignment_id:string;departs_at:string|null;journey_status?:string};

export const tokyoDay=(value:string|Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(typeof value==='string'?new Date(value):value);
export const taskPhase=(task:SelectableStaffTask)=>task.journey_status==='cancelled'?'cancelled' as const:task.journey_status==='completed'?'completed' as const:task.journey_status&&['meeting','in_progress'].includes(task.journey_status)?'active' as const:'pending' as const;
export const taskSortTime=(task:SelectableStaffTask)=>task.departs_at?new Date(task.departs_at).getTime():Number.MAX_SAFE_INTEGER;

export const isExecutableStaffTask=(task:SelectableStaffTask)=>!['cancelled','completed'].includes(taskPhase(task));

export function selectCurrentStaffTask<T extends SelectableStaffTask>(tasks:T[],now=new Date()):T|null{
  const today=tokyoDay(now);
  const eligible=tasks.filter(isExecutableStaffTask);
  const running=eligible.filter(task=>taskPhase(task)==='active').sort((a,b)=>taskSortTime(a)-taskSortTime(b));
  if(running[0])return running[0];
  return eligible.filter(task=>taskPhase(task)==='pending'&&task.departs_at&&tokyoDay(task.departs_at)===today).sort((a,b)=>taskSortTime(a)-taskSortTime(b))[0]??null;
}

export function selectNextStaffTask<T extends SelectableStaffTask>(tasks:T[],now=new Date()):T|null{
  return tasks.filter(task=>isExecutableStaffTask(task)&&task.departs_at&&taskSortTime(task)>now.getTime()).sort((a,b)=>taskSortTime(a)-taskSortTime(b))[0]??null;
}

export function selectPrimaryStaffTask<T extends SelectableStaffTask>(tasks:T[],now=new Date()):T|null{
  return selectCurrentStaffTask(tasks,now)??selectNextStaffTask(tasks,now);
}

export function tokyoWeekBounds(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now);
  const value=(type:string)=>parts.find(part=>part.type===type)?.value??'';
  const date=new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00+09:00`);
  const weekday={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6}[value('weekday') as 'Mon']??0;
  const start=new Date(date.getTime()-weekday*86_400_000);
  return {start,end:new Date(start.getTime()+7*86_400_000)};
}
