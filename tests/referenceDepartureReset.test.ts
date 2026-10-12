import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609030034_publish_reference_seat_products.sql','utf8');

describe('reference departure reset fixture',()=>{
  it('keeps the sales window valid regardless of the clock time when reset runs',()=>{
    expect(sql).toContain("departs_at-interval '30 days',departs_at-interval '10 hours'");
    expect(sql).not.toContain("now()-interval '1 minute',departs_at-interval '10 hours'");
  });
});
