import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609030041_operations_notification_delivery_queue.sql','utf8');
describe('041 运营通知异常队列',()=>{
  it('只投影失败与超时未回执通知且不暴露载荷和收件人',()=>{expect(sql).toMatch(/n\.status='failed'/);expect(sql).toMatch(/n\.status='submitted'[\s\S]*interval '10 minutes'/);expect(sql).not.toMatch(/returns table\([^)]*(payload|recipient_id)/)});
  it('仅失败状态允许人工重试并重置供应商关联',()=>{expect(sql).toMatch(/prior is distinct from 'failed'/);expect(sql).toMatch(/status='pending'/);expect(sql).toMatch(/external_id=null/);expect(sql).toMatch(/provider_status_at=null/)});
  it('每次重试记录运营人员、理由和原状态',()=>{expect(sql).toMatch(/notification_delivery_actions/);expect(sql).toMatch(/actor_id/);expect(sql).toMatch(/retry reason required/);expect(sql).toMatch(/operations role required/)});
});
