import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync('supabase/migrations/202609080077_referral_coupon_program.sql','utf8');

describe('游客双向邀请优惠',()=>{
  it('默认双方各发10%且后台可调整',()=>{
    expect(sql).toContain('discount_percent integer not null default 10');
    expect(sql).toContain("(inviter,relation,'inviter'");
    expect(sql).toContain("(p_invitee,relation,'invitee'");
    expect(sql).toContain('operations_update_referral_settings');
  });

  it('限制为直接邀请并阻止自邀与重复领取',()=>{
    expect(sql).toContain('invitee_account_id uuid not null unique');
    expect(sql).toContain('inviter=p_invitee');
    expect(sql).toContain('unique(referral_relationship_id,recipient_kind)');
  });

  it('只向本人或运营开放记录',()=>{
    expect(sql).toContain('account_id=auth.uid() or public.is_operations()');
    expect(sql).toContain('if not public.is_operations()');
  });
});
