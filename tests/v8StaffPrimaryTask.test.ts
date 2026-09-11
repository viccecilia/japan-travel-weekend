import {describe,expect,it} from 'vitest';
import {selectPrimaryStaffTask,type StaffTask} from '../src/app/StaffPortal';

const make=(id:string,departsAt:string,status:string):StaffTask=>({staff_assignment_id:id,assignment_role:'driver',vehicle_group_id:`group-${id}`,room_id:null,room_status:null,departure_id:`departure-${id}`,trip_title:id,departs_at:departsAt,chat_opens_at:null,meeting_name:null,meeting_address:null,map_lat:null,map_lng:null,vehicle_sequence:1,vehicle_type:'hiace',vehicle_label:null,vehicle_capacity:10,booked_seats:1,passenger_count:1,boarded_count:0,journey_status:status});

describe('V8-S 今日主任务选择',()=>{
  const now=new Date('2026-09-11T03:00:00Z');
  it('运行中任务优先于更早的待执行任务和数组顺序',()=>{
    const tasks=[make('future','2026-09-12T00:00:00Z','pending'),make('running','2026-09-11T01:00:00Z','in_progress'),make('today','2026-09-11T04:00:00Z','pending')];
    expect(selectPrimaryStaffTask(tasks,now)?.staff_assignment_id).toBe('running');
  });
  it('没有运行中任务时选择东京当天最近待执行任务',()=>{
    const tasks=[make('later','2026-09-11T08:00:00Z','pending'),make('earlier','2026-09-11T04:00:00Z','pending')];
    expect(selectPrimaryStaffTask(tasks,now)?.staff_assignment_id).toBe('earlier');
  });
  it('取消和已完成任务不会成为下一项主任务',()=>{
    const tasks=[make('cancelled','2026-09-11T04:00:00Z','cancelled'),make('completed','2026-09-11T02:00:00Z','completed'),make('next','2026-09-12T00:00:00Z','pending')];
    expect(selectPrimaryStaffTask(tasks,now)?.staff_assignment_id).toBe('next');
  });
});
