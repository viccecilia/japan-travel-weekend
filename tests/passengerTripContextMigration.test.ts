import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609030043_passenger_trip_context.sql','utf8');
describe('043 游客真实履约上下文',()=>{
  it('只向本车已付款订单本人投影',()=>{expect(sql).toMatch(/o\.account_id=auth\.uid\(\)/);expect(sql).toMatch(/o\.status in \('paid','confirmed'\)/);expect(sql).toMatch(/vgo\.vehicle_group_id=vg\.id/)});
  it('返回路线、返程、当班身份和车辆最小资料',()=>{for(const field of ['trip_title','itinerary','return_at','staff_name','staff_role','vehicle_type','vehicle_label'])expect(sql).toContain(field)});
  it('不暴露工作人员或其他乘客私密资料',()=>{expect(sql).not.toMatch(/phone|email|emergency|payment|passenger_assistance|account_private_profiles/)});
  it('群聊作者只投影安全昵称和真实工作人员身份',()=>{expect(sql).toMatch(/get_trip_room_messages_for_member/);expect(sql).toMatch(/'本车乘客'/);expect(sql).toMatch(/sa\.role in \('driver','guide'\)/);expect(sql).toMatch(/can_receive_vehicle_group/)});
});
