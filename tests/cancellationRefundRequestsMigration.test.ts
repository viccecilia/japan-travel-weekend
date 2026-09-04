import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql=readFileSync('supabase/migrations/202609040062_cancellation_refund_requests.sql','utf8');

describe('游客取消与退款申请边界',()=>{
  it('仅允许本人对已付款未出发行程申请',()=>{
    expect(sql).toContain('o.account_id=auth.uid()');
    expect(sql).toContain("v_order.status not in ('paid','confirmed')");
    expect(sql).toContain('v_departs<=now()');
  });
  it('申请不会直接把订单标为退款',()=>{
    expect(sql).not.toMatch(/update public\.orders set status='refunded'/);
    expect(sql).toContain("status in ('requested','reviewing','refund_processing')");
  });
  it('按日本日期保存规则测算且运营和本人分权读取',()=>{
    expect(sql).toContain("at time zone 'Asia/Tokyo'");
    expect(sql).toContain('cancellation_owner_read');
    expect(sql).toContain('cancellation_operations_read');
  });
});
