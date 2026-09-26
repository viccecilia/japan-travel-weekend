import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=readFileSync('scripts/provision-growth-operations-phase2-fixtures.mjs','utf8');

describe('Growth Phase 2 Auth fixtures',()=>{
  it('writes the GoTrue string-token defaults and a standard email identity',()=>{
    expect(source).toContain("confirmation_token,recovery_token,email_change_token_new,email_change");
    expect(source).toContain("confirmation_token=coalesce(confirmation_token,'')");
    expect(source).toContain("insert into auth.identities(provider_id,user_id,identity_data,provider");
  });
  it('provisions the approved driver resource required by the staff access RPC',()=>{
    expect(source).toContain("insert into public.driver_resources(account_id,display_name,languages,status,service_role)");
    expect(source).toContain("status='available'");
  });
});
