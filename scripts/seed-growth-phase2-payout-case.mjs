// Seeds only the disposable C fixture with the two documented payout UI cases.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const stage = process.argv.find((value) => value.startsWith('--stage='))?.slice('--stage='.length);
if (!['6800', '11300'].includes(stage)) throw new Error('Pass --stage=6800 or --stage=11300.');
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
  const entries = (await db.query("select id from public.cash_commission_entries where beneficiary_account_id=$1 order by created_at,id", [c.id])).rows;
  assert.ok(entries.length >= 7, 'expected C fixture cash entries');
  await db.query("update public.cash_commission_entries set status='invalid',invalid_reason='test_payout_case',updated_at=now() where beneficiary_account_id=$1", [c.id]);
  for (const entry of entries.slice(0, 5)) await db.query("update public.cash_commission_entries set status='available',amount_jpy=1200,invalid_reason=null,confirmed_at=now()-interval '35 days',unlocked_at=now()-interval '35 days',updated_at=now() where id=$1", [entry.id]);
  await db.query("update public.cash_commission_entries set status='available',amount_jpy=800,invalid_reason=null,confirmed_at=now()-interval '35 days',unlocked_at=now()-interval '35 days',updated_at=now() where id=$1", [entries[5].id]);
  if (stage === '11300') await db.query("update public.cash_commission_entries set status='available',amount_jpy=4500,invalid_reason=null,confirmed_at=now(),unlocked_at=now(),updated_at=now() where id=$1", [entries[6].id]);
  const total = Number((await db.query("select coalesce(sum(amount_jpy),0) amount from public.cash_commission_entries where beneficiary_account_id=$1 and status in ('available','carried_over')", [c.id])).rows[0].amount);
  assert.equal(total, Number(stage));
  await db.query('commit');
  console.log(JSON.stringify({status:'PASS',stage,availableJpy:total}));
} catch (error) {
  try { await db.query('rollback'); } catch {}
  throw error;
} finally {
  await db.end();
}
