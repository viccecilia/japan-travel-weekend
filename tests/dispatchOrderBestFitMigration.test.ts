import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609140134_dispatch_order_best_fit.sql','utf8');

describe('同班多车整单分配回归',()=>{
  it('先分配大订单并选择能够容纳整单的最紧凑车辆方案',()=>{
    expect(sql).toContain('order by o.seat_count desc,o.created_at,o.id');
    expect(sql).toContain('where candidate.remaining_seats>=v_order.seat_count');
    expect(sql).toContain('order by candidate.remaining_seats,candidate.sequence');
  });

  it('仍保留整单不拆、计划总数一致和运营权限边界',()=>{
    expect(sql).toContain("raise exception 'order cannot fit within vehicle plan without splitting: %'");
    expect(sql).toContain("raise exception 'dispatch plan must assign every committed passenger exactly once'");
    expect(sql).toContain("if not public.is_operations()");
    expect(sql).toContain('revoke all on function public.finalize_dispatch_departure(uuid) from public,anon,authenticated');
  });
});
