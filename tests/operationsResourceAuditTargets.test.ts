import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(join(process.cwd(),'supabase','migrations','20261005172000_allow_operations_resource_audit_targets.sql'),'utf8');

describe('Operations 资源维护审计目标',()=>{
  it('允许现有正式 RPC 使用的资源目标类型',()=>{
    for(const target of ['commission_payout','driver_resource','fleet_vehicle']){
      expect(sql).toContain(`'${target}'`);
    }
  });
});
