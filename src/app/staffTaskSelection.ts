export type SelectableStaffTask={staff_assignment_id:string;departs_at:string|null;journey_status?:string};

export const tokyoDay=(value:string|Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(typeof value==='string'?new Date(value):value);
export const taskPhase=(task:SelectableStaffTask)=>task.journey_status==='cancelled'?'cancelled' as const:task.journey_status==='completed'?'completed' as const:task.journey_status&&['meeting','in_progress'].includes(task.journey_status)?'active' as const:'pending' as const;
export const taskSortTime=(task:SelectableStaffTask)=>task.departs_at?new Date(task.departs_at).getTime():Number.MAX_SAFE_INTEGER;

export function selectPrimaryStaffTask<T extends SelectableStaffTask>(tasks:T[],now=new Date()):T|null{
  const today=tokyoDay(now);
  const eligible=tasks.filter(task=>taskPhase(task)!=='cancelled'&&taskPhase(task)!=='completed');
  const running=eligible.filter(task=>taskPhase(task)==='active').sort((a,b)=>taskSortTime(a)-taskSortTime(b));
  if(running[0])return running[0];
  const todayPending=eligible.filter(task=>task.departs_at&&tokyoDay(task.departs_at)===today).sort((a,b)=>taskSortTime(a)-taskSortTime(b));
  if(todayPending[0])return todayPending[0];
  return eligible.filter(task=>taskSortTime(task)>=now.getTime()).sort((a,b)=>taskSortTime(a)-taskSortTime(b))[0]??null;
}
