import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const fix=readFileSync('supabase/migrations/20261010005707_fix_product_archive_restore_audit_action.sql','utf8');
const lifecycle=readFileSync('supabase/migrations/202609100113_product_lifecycle.sql','utf8');
const currentConstraint=readFileSync('supabase/migrations/20261005093000_expired_payment_checkout_recovery.sql','utf8');
const publicCatalog=readFileSync('supabase/migrations/202609090099_publication_scope_and_release_manifest.sql','utf8');

describe('产品下架和恢复审计事务修复',()=>{
  it('archive 明确映射到正式 product_archived action',()=>{
    expect(fix).toMatch(/p_action='archive'[\s\S]*v_audit_action:='product_archived'/);
    expect(fix).toMatch(/v_audit_action:='product_archived'[\s\S]*status='archived'/);
  });

  it('restore 明确映射到正式 product_restored action并保留历史恢复行为',()=>{
    expect(fix).toMatch(/p_action='restore'[\s\S]*v_audit_action:='product_restored'/);
    expect(fix).toMatch(/p_action='restore'[\s\S]*insert into public\.product_revisions/);
    expect(fix).toContain("values(p_trip,v_next,'draft'");
    expect(fix).toContain('current_draft_revision_id=v_new_id');
  });

  it('不再拼接无效 action且不修改正式 constraint',()=>{
    expect(fix).not.toContain("'product_'||p_action");
    expect(fix).not.toMatch(/drop constraint|add constraint/i);
    expect(currentConstraint).toContain("'product_archived'");
    expect(currentConstraint).toContain("'product_restored'");
    expect(currentConstraint).not.toMatch(/'product_archive'|'product_restore'/);
  });

  it('状态和 audit 保持同一原子函数且不吞掉异常',()=>{
    expect(fix).toMatch(/update public\.trips set status='archived'[\s\S]*insert into public\.account_audit_events/);
    expect(fix).not.toMatch(/\bexception\s+when\b/i);
    expect(fix).not.toMatch(/on conflict[\s\S]*do nothing/i);
    expect(fix).toMatch(/insert into public\.account_audit_events[\s\S]*return v_trip\.catalog_version\+1/);
  });

  it('archive 不删除产品、revision、订单或 published revision 指针',()=>{
    const archiveBranch=fix.match(/if p_action='archive' then([\s\S]*?)elsif p_action='restore'/)?.[1]??'';
    expect(archiveBranch).toContain("status='archived'");
    expect(archiveBranch).not.toMatch(/\bdelete\b/i);
    expect(archiveBranch).not.toMatch(/orders|order_snapshots|product_revisions|current_published_revision_id/i);
  });

  it('公开产品目录继续只返回 published 产品',()=>{
    expect(publicCatalog).toMatch(/list_public_product_catalog[\s\S]*where t\.status='published'/);
  });

  it('原有 create、draft、publish、copy action 不受修改',()=>{
    for(const action of ['product_created','product_draft_saved','product_published','product_copied'])expect(currentConstraint).toContain(`'${action}'`);
    expect(lifecycle).toContain("'product_created'");
  });
});
