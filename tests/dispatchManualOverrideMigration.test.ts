import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609080082_dispatch_manual_override.sql','utf8');

describe('自动建议后人工调整派车',()=>{
  it('记录自动或人工调整来源并进入审计',()=>{
    expect(sql).toContain("planning_source in ('automatic','manual_override')");
    expect(sql).toContain("source_value:=coalesce(nullif(item->>'planningSource',''),'automatic')");
    expect(sql).toContain("jsonb_build_object('source',source_value)");
  });
  it('人工修改仍校验车辆司机资格与时间冲突',()=>{
    expect(sql).toContain("raise exception 'vehicle unavailable'");
    expect(sql).toContain("raise exception 'driver unavailable or unqualified'");
    expect(sql).toContain("raise exception 'dispatch resource time conflict'");
  });
});
