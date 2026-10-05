import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/20261005094500_expired_payment_recovery_after_sweep.sql','utf8');

describe('expired checkout recovery after the lifecycle sweep',()=>{
 it('accepts only the formal expired state or a currently expiring hold',()=>{
  expect(sql).toContain("o.payment_intent_id is not null");
  expect(sql).toContain("(o.status='pending_payment' and h.status='held' and h.expires_at<=now())");
  expect(sql).toContain("(o.status='expired' and h.status in ('expired','released'))");
  expect(sql).not.toContain("o.status='cancelled'");
 });
 it('remains service-only',()=>{
  expect(sql).toContain('security definer set search_path=public,pg_temp');
  expect(sql).toContain('revoke all on function public.get_expired_payment_recovery_context(uuid,uuid) from public,anon,authenticated');
  expect(sql).toContain('grant execute on function public.get_expired_payment_recovery_context(uuid,uuid) to service_role');
 });
});
