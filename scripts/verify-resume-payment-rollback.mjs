import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
const env=parseEnv(readFileSync('.env.supabase.restore.local','utf8'));
const identities=parseEnv(readFileSync('.env.supabase.restore-accounts.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
assert.ok(process.argv.includes('--rollback-test'));
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:'postgres.'+env.RESTORE_SUPABASE_PROJECT_REF,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const q=(sql,args=[])=>db.query(sql,args);
const evidence=[];
await db.connect();
try{
 await q('begin');await q("set local lock_timeout='3s'; set local statement_timeout='15s'");
 await q(readFileSync('supabase/migrations/20260921013345_resume_existing_order_payment.sql','utf8'));
 const owner=(await q('select id from auth.users where email=$1',[identities.PASSENGER_EMAIL])).rows[0]?.id;
 assert.ok(owner,'Existing test identity required');
 const trip=(await q("insert into trips(slug,title,status,publication_scope) values($1,'TEST Resume rollback','draft','internal_test') returning id",['resume-'+randomUUID()])).rows[0].id;
 const dep=(await q("insert into departures(trip_id,capacity,status,sales_scope,seat_price_jpy) values($1,4,'draft','internal_test',9900) returning id",[trip])).rows[0].id;
 const quote=(await q("insert into order_quotes(account_id,departure_id,departure_version,seat_count,unit_price_jpy,base_fare_jpy,amount_due_jpy,expires_at) values($1,$2,1,2,5500,11000,11000,now()+interval '15 minutes') returning id",[owner,dep])).rows[0].id;
 await q("update order_quotes set trip_id=$1,title='TEST Resume',departs_at=now()+interval '2 days',meeting_name='TEST meeting',meeting_address='TEST address',cancellation_policy='TEST only',commercial_terms='{}',line_items='[]' where id=$2",[trip,quote]);
 const order=(await q("insert into orders(account_id,departure_id,idempotency_key,seat_count,amount,quote_id,payment_intent_id) values($1,$2,$3,2,11000,$4,'pi_old') returning id",[owner,dep,'resume-order-'+randomUUID(),quote])).rows[0].id;
 await q('update order_quotes set confirmed_order_id=$1,confirmed_at=now() where id=$2',[order,quote]);
 const hold=(await q("insert into inventory_locks(departure_id,order_id,idempotency_key,seats,expires_at) values($1,$2,$3,2,now()+interval '15 minutes') returning id",[dep,order,'resume-hold-'+randomUUID()])).rows[0].id;
 const context=async(account=owner)=>(await q('select * from get_payment_resume_context($1,$2)',[account,order])).rows;
 const record=async(expected,next,amount=11000)=>(await q('select record_resumed_payment_intent($1,$2,$3,$4,$5) ok',[owner,order,expected,next,amount])).rows[0].ok;
 assert.equal((await context())[0].amount,11000); // NOT current 9900 * 2.
 assert.equal((await context(randomUUID())).length,0);
 assert.equal(await record('pi_old','pi_new',1),false);
 assert.equal(await record('pi_old','pi_new'),true);
 assert.equal(await record('pi_old','pi_new'),true);
 assert.equal(await record('pi_old','pi_competing'),false);
 assert.equal((await q('select count(*)::int n from orders where departure_id=$1',[dep])).rows[0].n,1);
 assert.deepEqual((await q('select id,seats,status from inventory_locks where order_id=$1',[order])).rows,[{id:hold,seats:2,status:'held'}]);
 evidence.push('historical quote 11000 retained despite current price 9900; no new order/hold; replay succeeds; stale CAS and amount tampering denied');
 const stale=(await q("select apply_current_payment_intent_event('pi_old',$1,$2,'cancelled',now(),'test') ok",['event-'+randomUUID(),order])).rows[0].ok;
 assert.equal(stale,true);assert.equal((await q('select status from orders where id=$1',[order])).rows[0].status,'pending_payment');
 evidence.push('old cancelled PI callback cannot cancel replacement order');
 for(const status of ['paid','cancelled','expired','refunded']){
  await q('savepoint state_case');
  await q('update orders set status=$1 where id=$2',[status,order]);
  assert.equal((await context()).length,0);
  assert.equal(await record('pi_new','pi_illegal'),false);
  await q('rollback to savepoint state_case');
  evidence.push(status+' order denied');
 }
 await q('savepoint expired_hold');await q("update inventory_locks set expires_at=now()-interval '1 minute' where id=$1",[hold]);
 assert.equal((await context()).length,0);assert.equal(await record('pi_new','pi_expired'),false);
 await q('rollback to savepoint expired_hold');evidence.push('expired hold rejected without reserving again');
 for(const role of ['anon','authenticated']){
  await q('savepoint denied_role');await q('set local role '+role);
  try{await context();assert.fail('untrusted role called payment RPC')}catch(error){assert.equal(error.code,'42501')}
  await q('rollback to savepoint denied_role');evidence.push(role+' direct payment RPC denied');
 }
 console.log(JSON.stringify({evidence,fixture:'fictional transaction-local records; not a Stripe payment test',cleanup:'all rolled back'},null,2));
}finally{await q('rollback');await db.end()}
