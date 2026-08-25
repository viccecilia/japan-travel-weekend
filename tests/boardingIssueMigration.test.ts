import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202608250014_boarding_issue_for_owner.sql','utf8');
const fix=readFileSync('supabase/migrations/202608250016_fix_boarding_issue_ambiguity.sql','utf8');
describe('014 乘客登车凭证签发迁移',()=>{
  it('只允许订单本人查看资格，签发由 service role 执行',()=>{expect(sql).toMatch(/o\.account_id=auth\.uid\(\)/);expect(sql).toMatch(/current_user not in \('service_role','postgres'\)/);expect(sql).not.toMatch(/grant execute on function public\.issue_owner_boarding_credential[\s\S]*to authenticated/)});
  it('只有 paid/confirmed 且房间 open 的本车订单可签发',()=>{expect(sql).toMatch(/o\.status in \('paid','confirmed'\)/);expect(sql).toMatch(/r\.status='open'/);expect(sql).toMatch(/boarding credential unavailable/)});
  it('新签发会撤销旧的未使用凭证且数据库只接收摘要',()=>{expect(sql).toMatch(/update public\.boarding_credentials as bc set revoked_at/);expect(sql).toMatch(/octet_length\(p_token_digest\)<>32/);expect(sql).not.toMatch(/raw_token|plaintext_token/)});
  it('表字段使用别名，避免与函数返回列歧义',()=>{expect(fix).toMatch(/bc\.boarding_id=b_id/);expect(fix).toMatch(/returning bc\.id into c_id/);expect(fix).toMatch(/brd\.id=b_id/)})
});
