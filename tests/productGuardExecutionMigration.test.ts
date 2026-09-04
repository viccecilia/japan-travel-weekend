import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('商品完整性触发器执行权限',()=>{
  const sql=readFileSync('supabase/migrations/202609040058_product_guard_execution.sql','utf8');
  it('只开放不可变布尔校验函数，不授予表写权限',()=>{
    expect(sql).toContain('grant execute on function public.route_catalog_complete(jsonb) to authenticated,service_role');
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+(table\s+)?public\.(trips|departures)/i);
  });
});
