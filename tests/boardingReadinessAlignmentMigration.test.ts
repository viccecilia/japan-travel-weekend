import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('boarding readiness alignment',()=>{
  const sql=readFileSync('supabase/migrations/202609030050_boarding_readiness_alignment.sql','utf8');
  it('creates one initial boarding row for every paid or confirmed order',()=>{
    for(const marker of ['ensure_boarding_after_order_insert_trigger','ensure_boarding_after_order_status_trigger',"new.status in ('paid','confirmed')","values(new.id,'not_issued')",'on conflict(order_id) do nothing'])expect(sql).toContain(marker);
  });
  it('backfills eligible orders without overwriting prior boarding state',()=>{
    expect(sql).toContain("where o.status in ('paid','confirmed')");
    expect(sql).toContain('on conflict(order_id) do nothing');
  });
  it('only marks boarding ready when the room is open and a usable boarding exists',()=>{
    expect(sql).toContain("tr.status='open'");
    expect(sql).toContain("b.status in ('not_issued','issued')");
    expect(sql).not.toContain("tr.status in ('frozen','open')");
  });
});
