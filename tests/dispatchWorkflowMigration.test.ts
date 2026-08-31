import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202608310023_dispatch_workflow.sql','utf8');

describe('023 运营派单闭环',()=>{
  it('所有状态操作均由运营权限函数终审',()=>{
    for(const fn of ['operations_save_dispatch_plan','operations_confirm_dispatch_tasks','operations_simulate_dispatch_send','operations_cancel_dispatch_tasks']){
      expect(sql).toContain(`function public.${fn}`);
    }
    expect(sql.match(/if not public\.is_operations\(\)/g)).toHaveLength(4);
    expect(sql).toContain('security definer set search_path=public,pg_temp');
    expect(sql).toContain('revoke all on function');
  });

  it('草稿原子保存车辆分配并拒绝重复车辆、司机与序号',()=>{
    expect(sql).toContain('insert into public.vehicle_assignments');
    expect(sql).toContain('on conflict(departure_id,sequence)');
    expect(sql).toContain("raise exception 'duplicate dispatch resource'");
    expect(sql).toContain("raise exception 'dispatch resource time conflict'");
    expect(sql).toContain("only draft tasks can be replaced");
  });

  it('确认、发送与取消全部写审计记录并管理车辆状态',()=>{
    for(const action of ["'confirmed'","'mock_sent'","'cancelled'"])expect(sql).toContain(action);
    expect(sql).toContain("set status='assigned'");
    expect(sql).toContain("set status='available'");
    expect(sql).toContain("external_task_id='mock-'||id::text");
  });

  it('模拟发送明确记录不访问外部网络',()=>{
    expect(sql).toContain("jsonb_build_object('provider','memory','externalNetwork',false)");
    expect(sql).not.toMatch(/https?:\/\//);
  });
});
