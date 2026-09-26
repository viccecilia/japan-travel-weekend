// Verifies the browser-created Phase 2.2 referral account in the disposable test project.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const email='growth-phase22-referral-e2e+20260926@example.com';
const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false}});
await db.connect();
try{
  const row=(await db.query(`select u.id,r.referral_code,r.parent_source_id,r.root_source_id,l.status,
    parent.code parent_code,root.code root_code,inviter.email inviter_email
    from auth.users u join public.referral_relationships r on r.invitee_account_id=u.id
    join public.referral_lifecycles l on l.referral_relationship_id=r.id
    join public.referral_sources parent on parent.id=r.parent_source_id
    join public.referral_sources root on root.id=r.root_source_id
    join auth.users inviter on inviter.id=r.inviter_account_id
    where u.email=$1`,[email])).rows[0];
  assert.ok(row,'browser signup did not create a referral relationship');
  assert.equal(row.status,'registered');
  assert.equal(row.parent_source_id,row.root_source_id);
  assert.equal(row.parent_code,row.root_code);
  const before=(await db.query('select count(*)::int count from public.referral_relationships where inviter_account_id=(select id from auth.users where email=$1)',[row.inviter_email])).rows[0].count;
  await db.query('begin');
  const secondCode=(await db.query("select code from public.referral_codes where account_id<>(select id from auth.users where email=$1) order by code limit 1",[email])).rows[0].code;
  const override=(await db.query('select public.apply_referral_registration($1,$2) applied',[row.id,secondCode])).rows[0].applied;
  assert.equal(override,false,'an existing account accepted a second referral source');
  await db.query('rollback');
  const after=(await db.query('select count(*)::int count from public.referral_relationships where inviter_account_id=(select id from auth.users where email=$1)',[row.inviter_email])).rows[0].count;
  assert.equal(after,before);
  console.log(JSON.stringify({status:'PASS',parentCode:row.parent_code,rootCode:row.root_code,lifecycle:row.status,inviterRegisteredCount:after}));
}finally{await db.end();}
