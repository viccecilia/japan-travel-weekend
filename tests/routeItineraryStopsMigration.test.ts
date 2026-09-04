import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609040060_route_itinerary_stops.sql','utf8');

describe('060 五条线路履约节点',()=>{
  it('覆盖全部正式路线并保存坐标与集合资料',()=>{
    for(const slug of ['kyoto-nara-classic','amanohashidate-ine','biwako-shirahige','wakayama-family','kobe-arima-rokko'])expect(sql).toContain(`('${slug}'`);
    for(const field of ['meetingTime','meetingPointName','meetingPointDescription','latitude','longitude'])expect(sql).toContain(`"${field}"`);
  });
  it('只向运营、本车工作人员或本人已付款订单开放',()=>{
    expect(sql).toMatch(/get_vehicle_group_itinerary/);
    expect(sql).toMatch(/is_operations\(\)/);
    expect(sql).toMatch(/is_group_staff\(vg\.id\)/);
    expect(sql).toMatch(/o\.account_id=auth\.uid\(\)/);
    expect(sql).toMatch(/o\.status in \('paid','confirmed'\)/);
  });
  it('司导选择节点时原子更新坐标、时间和行程状态',()=>{expect(sql).toMatch(/advance_vehicle_group_to_itinerary_stop/);expect(sql).toMatch(/update_vehicle_group_meeting/);expect(sql).toMatch(/advance_vehicle_group_journey/);expect(sql).toMatch(/at time zone 'Asia\/Tokyo'/)});
});
