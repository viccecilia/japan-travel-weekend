import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609030033_sellable_product_completeness.sql','utf8');

describe('真实旅行商品完整性迁移',()=>{
  it('要求销售窗口、往返时间、最低成团、含税价格和集合坐标',()=>{
    for(const field of ['sales_open_at','sales_close_at','minimum_guests','tax_included','ends_at','meeting_name','meeting_address','map_lat','map_lng'])expect(sql).toContain(field);
    expect(sql).toContain("currency='JPY'");
  });
  it('路线发布需要政策、行程和费用内容完整',()=>{
    for(const key of ['itinerary','included','excluded','childPolicy','luggagePolicy','accessibilityInfo','mealInfo','weatherPolicy','cancellationPolicyVersion'])expect(sql).toContain(key);
    expect(sql).toContain('guard_published_trip_trigger');
  });
  it('不完整班次不能公开、不能创建草稿且售罄不返回',()=>{
    expect(sql).toContain('guard_sellable_departure_trigger');
    expect(sql).toContain('guard_booking_draft_sellable_trigger');
    expect(sql).toContain('public.is_departure_sellable(d.id,now())');
    expect(sql).toContain('greatest(d.capacity-coalesce(l.used,0),0)>0');
  });
});
