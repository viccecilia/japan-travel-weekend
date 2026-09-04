import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/202609040061_staff_paid_fulfilment_boundary.sql', 'utf8');
const staff = readFileSync('src/app/StaffPortal.tsx', 'utf8');

describe('工作人员仅接收已付款履约数据', () => {
  it('在任务、登车与签到查询中限定 paid/confirmed', () => {
    expect((sql.match(/o\.status in \('paid','confirmed'\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sql).not.toContain('payment_review_count');
    expect(sql).not.toContain('payment_blocked_count');
  });

  it('司机端不展示付款审核职责', () => {
    expect(staff).not.toContain('付款与登车资格');
    expect(staff).not.toContain('待人工确认');
    expect(staff).not.toContain('不可登车');
    expect(staff).toContain('仅履约名单');
  });
});
