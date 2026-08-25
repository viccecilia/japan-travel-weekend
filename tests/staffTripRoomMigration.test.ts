import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202608250012_staff_trip_room_actions.sql','utf8');
const boardingGate=readFileSync('supabase/migrations/202608250013_boarding_open_room_gate.sql','utf8');
describe('012 工作人员行程房间迁移静态审计',()=>{
  it('八种广播模板集中在服务端并保存重要通知原文',()=>{for(const key of ['introduce','confirm_meeting','vehicle_arrived','departing_10','departing_5','return_vehicle','traffic_delay','meeting_changed'])expect(sql).toContain(`'${key}'`);expect(sql).toMatch(/original_content/);expect(sql).toMatch(/translated_content/)});
  it('工作人员只能操作本车且冻结房间不能广播',()=>{expect(sql).toMatch(/status='open'/);expect(sql).toMatch(/public\.is_group_staff/);expect(sql).toMatch(/order is not in vehicle group/)});
  it('位置共享只投影是否开启，不向普通乘客暴露坐标',()=>{expect(sql).toMatch(/location_shared boolean/);expect(sql).not.toMatch(/encrypted_location\s*,/)});
  it('只有本车房间开放后才能登记登车',()=>{expect(boardingGate).toMatch(/status='open'/);expect(boardingGate).toMatch(/trip room is not open/);expect(boardingGate).toMatch(/public\.is_group_staff/)});
});
