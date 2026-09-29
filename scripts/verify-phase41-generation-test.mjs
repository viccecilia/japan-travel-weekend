import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
const out={project:env.RESTORE_SUPABASE_PROJECT_REF};
try{
 await db.query('begin');
 const template=(await db.query("select account_id,order_id,requested_order_id,trip_id from public.travel_moment_submissions where order_id is not null and trip_id is not null limit 1")).rows[0];
 assert.ok(template,'no Travel Moments fixture with a completed-order context is available');
 const add=async(label,{internal='eligible',status='pending_review',reasons=[]}={})=>{const id=randomUUID(),token=randomUUID().replaceAll('-','');await db.query("insert into public.travel_moment_submissions(id,submission_number,account_id,requested_order_id,order_id,trip_id,platform,post_url,canonical_url,canonical_content_id,social_account_name,status,internal_verdict,external_verdict,reason_codes,verification_generation) values($1,$2,$3,$4,$5,$6,'tiktok',$7,$7,$8,'@generation-test',$9,$10,'unknown',$11,1)",[id,`TM-GEN-${label}-${token.slice(0,8)}`,template.account_id,template.requested_order_id,template.order_id,template.trip_id,`https://tiktok.com/@generation/video/${token.slice(0,12)}`,`tiktok:${token.slice(0,12)}`,status,internal,reasons]);return id};
 const manual=async(id,field,decision,generation=1)=>db.query("insert into public.travel_moment_manual_verifications(submission_id,operator_id,field,decision,reason,verification_generation) values($1,$2,$3,$4,'test evidence',$5)",[id,template.account_id,field,decision,generation]);
 const all=async(id,generation=1)=>{for(const field of ['public','official_mention','campaign_hashtag','author'])await manual(id,field,'confirmed',generation)};
 const state=async id=>(await db.query('select status,reason_codes,verification_generation from public.travel_moment_submissions where id=$1',[id])).rows[0];

 const a=await add('a');await manual(a,'official_mention','confirmed');assert.equal((await db.query('select public.tm_evaluate_external($1,null) value',[a])).rows[0].value,'pending_review');out.A=await state(a);
 const b=await add('b');await all(b);assert.equal((await db.query('select public.tm_evaluate_external($1,null) value',[b])).rows[0].value,'eligible');out.B=await state(b);
 const c=await add('c');await manual(c,'official_mention','rejected');assert.equal((await db.query('select public.tm_evaluate_external($1,null) value',[c])).rows[0].value,'needs_adjustment');out.C=await state(c);assert.deepEqual(out.C.reason_codes,['MISSING_OFFICIAL_MENTION']);
 const d=await add('d');await manual(d,'official_mention','rejected');await db.query('select public.tm_evaluate_external($1,null)',[d]);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[template.account_id]);const g2=(await db.query('select public.request_travel_moment_recheck($1) generation',[d])).rows[0].generation;assert.equal(g2,2);await all(d,2);assert.equal((await db.query('select public.tm_evaluate_external($1,null) value',[d])).rows[0].value,'eligible');out.D={...(await state(d)),g1Rejects:(await db.query("select count(*)::int count from public.travel_moment_manual_verifications where submission_id=$1 and verification_generation=1 and decision='rejected'",[d])).rows[0].count};assert.equal(out.D.g1Rejects,1);
 const e=await add('e',{internal:'ineligible',status:'ineligible',reasons:['ORDER_REFUNDED']});await all(e);assert.equal((await db.query('select public.tm_evaluate_external($1,null) value',[e])).rows[0].value,'ineligible');out.E=await state(e);assert.deepEqual(out.E.reason_codes,['ORDER_REFUNDED']);
 const f=await add('f');await db.query('update public.travel_moment_submissions set verification_generation=2,status=\'checking\' where id=$1',[f]);await all(f,2);await db.query('select public.tm_evaluate_external($1,null)',[f]);const before=await state(f);assert.equal(before.status,'eligible');assert.equal((await db.query("select public.record_travel_moment_provider_check($1,'initial_submit','deterministic-test',$2::jsonb,$3::text[],null,1) ok",[f,JSON.stringify({public:false,officialMention:false,campaignHashtag:false,authorMatches:false}),['POST_UNAVAILABLE']])).rows[0].ok,true);const after=await state(f);const stale=(await db.query('select count(*)::int count from public.travel_moment_check_runs where submission_id=$1 and verification_generation=1 and provider=\'deterministic-test\'',[f])).rows[0].count;assert.equal(after.status,'eligible');assert.equal(after.verification_generation,2);assert.equal(stale,1);out.F={before,after,staleRuns:stale};
 await db.query('commit');console.log(JSON.stringify({status:'PASS',...out}));
}catch(error){try{await db.query('rollback')}catch{}throw error}finally{await db.end()}
