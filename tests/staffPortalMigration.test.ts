import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202608300022_staff_portal.sql','utf8');
describe('工作人员端数据边界迁移',()=>{
  it('任务限定为本人分配且只返回付款汇总',()=>{
    expect(sql).toContain('sa.staff_id=auth.uid()');
    expect(sql).toContain("sa.role in ('driver','guide','operations')");
    expect(sql).toContain('payment_ready_count');
    expect(sql).toContain('payment_review_count');
    expect(sql).not.toContain('payment_events');
    expect(sql).not.toContain('payload_digest');
  });
});
