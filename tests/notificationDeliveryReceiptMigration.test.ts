import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609030040_notification_delivery_receipts.sql','utf8');
describe('040 通知真实送达回执',()=>{
  it('供应商事件幂等且只保存摘要',()=>{expect(sql).toMatch(/provider_event_id text not null unique/);expect(sql).toMatch(/payload_digest text not null/);expect(sql).not.toMatch(/payload jsonb/)});
  it('外部 ID 匹配且按供应商时间防止乱序覆盖',()=>{expect(sql).toMatch(/n\.external_id=p_external_id/);expect(sql).toMatch(/p_occurred_at>=n\.provider_status_at/);expect(sql).toMatch(/n\.status<>'delivered'/)});
  it('回执只能由可信服务应用且游客不可读取供应商载荷',()=>{expect(sql).toMatch(/trusted service only/);expect(sql).toMatch(/revoke all on public\.notification_delivery_receipts from public,anon,authenticated/);expect(sql).not.toMatch(/grant select[\s\S]*to authenticated/)});
});
