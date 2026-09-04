import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('班次截单结果字段冲突修复',()=>{
  const sql=readFileSync('supabase/migrations/202609040057_departure_cutoff_result_name.sql','utf8');
  it('使用不会与表字段冲突的输出名称并保持服务角色限制',()=>{
    expect(sql).toContain('processed_departure_id uuid');
    expect(sql).toContain('processed_departure_id:=item.id');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('from public,anon,authenticated');
  });
});
