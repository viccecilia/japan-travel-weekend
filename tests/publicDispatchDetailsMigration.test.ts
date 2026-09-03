import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';const sql=readFileSync('supabase/migrations/202609030044_public_dispatch_details.sql','utf8');
describe('044 游客可见派车资料',()=>{
  it('公开字段与私人账户资料分离且照片仅接受 HTTPS',()=>{for(const field of ['public_color','public_photo_url','service_role','public_phone'])expect(sql).toContain(field);expect(sql).toMatch(/\^https:\/\//);expect(sql).not.toMatch(/account_private_profiles/)});
  it('只有运营可创建并要求公开颜色、电话和服务身份',()=>{expect((sql.match(/operations only/g)??[]).length).toBeGreaterThanOrEqual(2);expect(sql).toMatch(/length\(trim\(p_public_color\)\)/);expect(sql).toMatch(/length\(trim\(p_public_phone\)\)/);expect(sql).toMatch(/driver_guide/)});
  it('游客上下文仍限制为本车已付款订单本人',()=>{expect(sql).toMatch(/o\.account_id=auth\.uid\(\)/);expect(sql).toMatch(/o\.status in \('paid','confirmed'\)/);expect(sql).not.toMatch(/grant execute[\s\S]*get_passenger_trip_context_v2[\s\S]*to anon/)});
});
