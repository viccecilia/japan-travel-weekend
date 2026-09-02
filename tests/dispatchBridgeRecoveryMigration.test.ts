import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/202609020032_dispatch_bridge_recovery.sql'),'utf8');
describe('履约桥接恢复入口',()=>{
  it('运营可安全重试同一原子最终化函数且保留审计结果',()=>{
    expect(sql).toContain('function public.operations_finalize_dispatch_departure');
    expect(sql).toContain('select public.finalize_dispatch_departure(p_departure) into finalized');
    expect(sql).toContain("'fulfilment_bridge'");
    expect(sql).toContain("jsonb_build_object('finalized',finalized");
  });
  it('确认任务自动调用可审计入口并继续限制为运营角色',()=>{
    expect(sql).toContain('perform public.operations_finalize_dispatch_departure(v_departure)');
    expect(sql.match(/if not public\.is_operations\(\)/g)).toHaveLength(2);
  });
});
