import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202608310025_operations_dashboard_projection.sql','utf8');
describe('025 运营统计安全投影',()=>{
  it('只通过运营角色受控函数返回统计字段',()=>{expect(sql).toContain('where public.is_operations()');expect(sql).toContain('security definer');expect(sql).toContain('revoke all on function public.get_operations_dashboard_departures() from public,anon')});
  it('待付款不混入已确认席位和成交额',()=>{expect(sql).toContain("o.status in ('paid','confirmed') then o.seat_count");expect(sql).toContain("o.status='pending_payment'");expect(sql).toContain("o.currency='JPY' then o.amount")});
  it('不返回付款凭据或乘客身份字段',()=>{expect(sql).not.toMatch(/payment_intent|email|phone|passenger_name|stripe/i)});
});
