import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=readFileSync('scripts/verify-growth-phase22-referral-signup.mjs','utf8');
describe('Phase 2.2 real referral signup verifier',()=>{
  it('checks persisted parent/root identity, registered lifecycle, and second-source rejection',()=>{
    expect(source).toContain("assert.equal(row.status,'registered')");
    expect(source).toContain('assert.equal(row.parent_source_id,row.root_source_id)');
    expect(source).toContain('public.apply_referral_registration($1,$2)');
    expect(source).toContain("assert.equal(override,false");
  });
});
