import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609050071_refund_inventory_and_notification.sql','utf8');

describe('refund finalization migration',()=>{
  it('releases paid inventory when an order becomes refunded',()=>{
    expect(sql).toContain("new.status='refunded'");
    expect(sql).toContain("status='released'");
    expect(sql).toContain("status in ('held','committed')");
  });

  it('queues one durable refund completion notification',()=>{
    expect(sql).toContain("'refund-completed:'||new.id::text");
    expect(sql).toContain("'refund-completed'");
    expect(sql).toContain('on conflict(event_id) do nothing');
  });

  it('backfills already-refunded orders safely',()=>{
    expect(sql).toContain("o.status='refunded'");
    expect(sql).toContain("'refund-completed:'||o.id::text");
  });

  it('uses an exact 24-hour cancellation boundary',()=>{
    expect(sql).toContain("v_departs-now()>=interval '24 hours'");
    expect(sql).toContain('then 100 else 0');
  });
});
