import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('工作人员单一角色审批',()=>{
  const sql=readFileSync('supabase/migrations/202609080074_single_role_staff_approval.sql','utf8');
  it('新注册工作人员只创建待审申请，不直接获得权限',()=>{
    expect(sql).toContain("requested in ('driver','guide')");
    expect(sql).toContain("values(new.id,applicant,'passenger')");
    expect(sql).toContain('staff_account_applications(account_id,requested_role,applicant_name)');
  });
  it('只有运营账号能审批且批准时替换唯一角色',()=>{
    expect(sql).toContain('if not public.is_operations()');
    expect(sql).toContain('set role=item.requested_role::public.app_role');
    expect(sql).toContain("where id=item.account_id and role='passenger'");
  });
  it('登录目的地覆盖游客、工作人员、运营和待审状态',()=>{
    expect(sql).toContain("then 'operations'");
    expect(sql).toContain("then 'staff'");
    expect(sql).toContain("then 'staff_pending'");
    expect(sql).toContain("else 'passenger' end");
  });
});
