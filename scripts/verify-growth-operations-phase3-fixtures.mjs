// Read-only verification for the Phase 3 disposable fixtures and operations
// RPCs. It verifies the data through the same authenticated role boundary used
// by the browser client.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
if(!process.argv.includes('--verify-test-growth-tree'))throw new Error('Pass --verify-test-growth-tree.');
const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)]}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));const accounts=parse(readFileSync('.env.supabase.restore-accounts.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
try{
  await db.query('begin');const op=(await db.query('select id from auth.users where email=$1',[accounts.OPERATIONS_EMAIL])).rows[0];assert.ok(op,'operations fixture is missing');
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[op.id]);await db.query('set local role authenticated');
  const roots=(await db.query('select public.list_operations_referral_roots(null,null,\'all\') value')).rows[0].value;assert.ok(Array.isArray(roots));
  const relay=roots.find(row=>row.code==='G3RELAY2026');const flat=roots.find(row=>row.code==='G3FLAT2026');const deep=roots.find(row=>row.code==='G3DEEP2026');assert.ok(relay&&flat&&deep,'missing required root fixture');
  const children=(await db.query('select public.get_operations_referral_tree_children($1,$1,null,null,0,40) value',[relay.id])).rows[0].value;assert.equal(children.items.length,2);assert.equal(children.items.filter(row=>row.childCount>=4).length,2);
  const relayAnalysis=(await db.query('select public.get_operations_referral_tree_analysis($1,null,null) value',[relay.id])).rows[0].value;assert.equal(relayAnalysis.propagationType,'multi_relay');assert.equal(relayAnalysis.relayCount,2);
  const deepAnalysis=(await db.query('select public.get_operations_referral_tree_analysis($1,null,null) value',[deep.id])).rows[0].value;assert.equal(deepAnalysis.propagationType,'deep');
  const u10=children.items.find(row=>row.childCount>=4);const detail=(await db.query('select public.get_operations_referral_node_detail($1,$2) value',[relay.id,u10.sourceId])).rows[0].value;assert.equal(detail.travel.completedFirstTrip,false);assert.equal(detail.propagation.validDescendants,3);assert.equal(detail.cash.entries.length,3);assert.equal(detail.cash.entries.every(row=>row.amountJpy===1000),true);
  const u11=(await db.query('select public.get_operations_referral_tree_children($1,$2,null,null,0,40) value',[relay.id,u10.sourceId])).rows[0].value.items[0];const couponDetail=(await db.query('select public.get_operations_referral_node_detail($1,$2) value',[relay.id,u11.sourceId])).rows[0].value;assert.equal(couponDetail.coupons.items[0].sourceType,'travel_moment');
  const anomalies=(await db.query('select public.list_operations_referral_anomalies($1) value',[relay.id])).rows[0].value;assert.equal(Array.isArray(anomalies),true);assert.equal(anomalies.length,0);
  await db.query('rollback');console.log(JSON.stringify({status:'PASS',roots:roots.filter(row=>['G3FLAT2026','G3RELAY2026','G3DEEP2026'].includes(row.code)).map(row=>({code:row.code,registered:row.registered,firstPaid:row.firstPaid,validTrips:row.validTrips})),relay:{relayCount:relayAnalysis.relayCount,type:relayAnalysis.propagationType},deep:{type:deepAnalysis.propagationType},u10:{ownTrip:detail.travel.completedFirstTrip,direct:detail.propagation.directReferrals,validDescendants:detail.propagation.validDescendants,cashEntries:detail.cash.entries.length},coupon:couponDetail.coupons.items[0].sourceType}));
}catch(error){try{await db.query('rollback')}catch{}throw error}finally{await db.end()}
