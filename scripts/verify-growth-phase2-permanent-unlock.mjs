// Disposable test-project regression check for the Phase 2 permanent ambassador rule.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

if (!process.argv.includes('--apply-test-refund')) throw new Error('Pass --apply-test-refund for the disposable growth fixture only.');
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
  const c = (await db.query("select id from auth.users where email='growth-phase2-c@example.invalid'")).rows[0];
  assert.ok(c, 'missing C fixture');
  const order = (await db.query("select id,amount from public.orders where idempotency_key like 'growth-phase2-fixture-c-%' order by created_at,id limit 1")).rows[0];
  assert.ok(order, 'missing C fixture order');
  await db.query("update public.orders set status='refunded',refunded_amount_jpy=$2 where id=$1", [order.id, order.amount]);
  await db.query('select public.refresh_referral_lifecycle_for_order($1)', [order.id]);
  await db.query('select public.refresh_ambassador_qualification($1)', [c.id]);
  const result = (await db.query(`select
    (select status from public.ambassador_qualifications where account_id=$1) ambassador_status,
    (select qualifying_referral_count from public.ambassador_qualifications where account_id=$1) valid_referrals,
    (select status from public.referral_lifecycles l join public.referral_relationships r on r.id=l.referral_relationship_id where r.invitee_account_id=(select account_id from public.orders where id=$2)) lifecycle_status,
    (select status from public.cash_commission_entries where source_order_id=$2) cash_status`, [c.id, order.id])).rows[0];
  assert.equal(result.ambassador_status, 'active');
  assert.equal(Number(result.valid_referrals), 9);
  assert.equal(result.lifecycle_status, 'refunded');
  assert.equal(result.cash_status, 'invalid');
  await db.query('commit');
  console.log(JSON.stringify({status:'PASS', ...result}));
} catch (error) {
  try { await db.query('rollback'); } catch {}
  throw error;
} finally {
  await db.end();
}
