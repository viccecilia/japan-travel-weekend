// Reads the real test fixture's service function after its UI request is submitted.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

if (!process.argv.includes('--verify-test-monthly-lock')) throw new Error('Pass --verify-test-monthly-lock for the disposable test project only.');
const parse = (text) => Object.fromEntries(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
  const at = line.indexOf('=');
  return [line.slice(0, at), line.slice(at + 1)];
}));
const env = parse(readFileSync('.env.supabase.restore.local', 'utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF, 'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE, 'yes-delete-test-data');
const db = new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
try {
  await db.query('begin');
  const account = (await db.query("select id from auth.users where email='growth-phase2-c@example.invalid'")).rows[0];
  assert.ok(account, 'missing C fixture');
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [account.id]);
  await assert.rejects(
    () => db.query("select public.request_own_commission_payout('growth-phase2-second-monthly-request')"),
    /one payout request per natural month/,
  );
  await db.query('rollback');
  console.log(JSON.stringify({status:'PASS',rejected:'one payout request per natural month'}));
} finally {
  await db.end();
}
