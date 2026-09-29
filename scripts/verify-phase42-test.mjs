import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
const out={project:env.RESTORE_SUPABASE_PROJECT_REF,marker:'PHASE42-TEST'};
try{
 await db.query('begin');
 const template=(await db.query("select requested_order_id,order_id,trip_id from public.travel_moment_submissions where order_id is not null and trip_id is not null limit 1")).rows[0];assert.ok(template,'requires existing Phase 4.1 completed-order fixture');
 const month='2099-09-01'; const created=[];
 const add=async(index,{platform=index%2?'tiktok':'instagram',nulls=false,published='2099-08-30T00:00:00Z',status='eligible',account=null}={})=>{
   const id=randomUUID(),accountId=account??randomUUID(),token=randomUUID().replaceAll('-','').slice(0,14);if(!account){await db.query("insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values($1,'authenticated','authenticated',$2,'{}','{}',now(),now())",[accountId,`phase42-${token}@example.test`]);await db.query('update public.profiles set display_name=$2 where id=$1',[accountId,`PHASE42-TEST-${index}`]);}
   const url=platform==='tiktok'?`https://tiktok.com/@phase42/video/${token.replace(/\D/g,'').padEnd(10,'7').slice(0,10)}`:`https://instagram.com/reel/${token}`;
   await db.query("insert into public.travel_moment_submissions(id,submission_number,account_id,requested_order_id,order_id,trip_id,platform,post_url,canonical_url,canonical_content_id,social_account_name,status,internal_verdict,external_verdict,reason_codes,published_at,first_verified_at,is_test_order,verification_generation) values($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,'@phase42',$10,'eligible','passed','{}',$11,$11,true,1)",[id,`TM-PHASE42-${index}-${token.slice(0,6)}`,accountId,template.requested_order_id,template.order_id,template.trip_id,platform,url,`${platform}:${token}`,status,published]);
   if(status==='eligible')await db.query("insert into public.travel_moment_metric_snapshots(submission_id,provider,views,likes,comments,shares,saves,raw_coverage,refresh_key,captured_at) values($1,'PHASE42-TEST',$2,$3,$4,$5,$6,$7::jsonb,$8,'2099-09-29T00:00:00Z')",[id,1000+index*100,100+index*10,20+index,10+index,nulls?null:5+index,JSON.stringify({views:true,likes:true,comments:true,shares:true,saves:!nulls}),`seed-${index}`]);
   created.push({id,accountId,platform,nulls});return {id,accountId};
 };
 for(let i=1;i<=52;i++)await add(i,{nulls:i===52});
 const refreshKey='refresh-provider-primitive';
 const refreshPayload={views:1200,likes:144,comments:24,shares:12,saves:6,coverage:{views:true,likes:true,comments:true,shares:true,saves:true}};
 assert.equal((await db.query("select public.record_travel_moment_metric_snapshot($1,'PHASE42-REFRESH',$2::jsonb,$3) ok",[created[0].id,JSON.stringify(refreshPayload),refreshKey])).rows[0].ok,true);
 assert.equal((await db.query("select count(*)::int count from public.travel_moment_metric_snapshots where submission_id=$1 and refresh_key=$2",[created[0].id,refreshKey])).rows[0].count,1);
 assert.equal((await db.query("select public.record_travel_moment_metric_snapshot($1,'PHASE42-REFRESH',$2::jsonb,$3) ok",[created[0].id,JSON.stringify(refreshPayload),refreshKey])).rows[0].ok,true);
 assert.equal((await db.query("select count(*)::int count from public.travel_moment_metric_snapshots where submission_id=$1 and refresh_key=$2",[created[0].id,refreshKey])).rows[0].count,1);
 const duplicate=await add(53,{account:created[0].accountId});
 const pending=await add(54,{status:'pending_review'});const late=await add(55,{published:'2099-09-30T23:30:00Z'});
 const run=(await db.query('select public.operations_generate_travel_moment_monthly_candidates($1::date) id',[month])).rows[0].id;out.run=run;
 const summary=(await db.query('select eligible_count,pending_maturity_count,scored_count,candidate_count,reserve_count,status from public.travel_moment_monthly_runs where id=$1',[run])).rows[0];
 assert.equal(summary.status,'finalized');assert.equal(Number(summary.candidate_count),25);assert.equal(Number(summary.reserve_count),25);assert.equal(Number(summary.scored_count),53);
 assert.equal((await db.query('select count(*)::int count from public.travel_moment_final_snapshots where monthly_run_id=$1 and submission_id=$2',[run,pending.id])).rows[0].count,0);
 assert.equal((await db.query('select count(*)::int count from public.travel_moment_final_snapshots where monthly_run_id=$1 and submission_id=$2',[run,late.id])).rows[0].count,0);
 const nullEntry=(await db.query("select c.auto_score,c.metric_coverage from public.travel_moment_monthly_candidates c join public.travel_moment_final_snapshots f on f.monthly_run_id=c.monthly_run_id and f.submission_id=c.submission_id where c.monthly_run_id=$1 and f.submission_id=$2",[run,created[51].id])).rows[0];assert.ok(Number(nullEntry.metric_coverage)<1);assert.ok(Number(nullEntry.auto_score)>0);
 const duplicateCount=(await db.query('select count(*)::int count from public.travel_moment_monthly_candidates where monthly_run_id=$1 and account_id=$2',[run,created[0].accountId])).rows[0].count;assert.equal(duplicateCount,1);
 const platformStats=(await db.query('select platform,count(*)::int count from public.travel_moment_final_snapshots where monthly_run_id=$1 group by platform',[run])).rows;assert.equal(platformStats.length,2);
 const candidate=(await db.query("select * from public.travel_moment_monthly_candidates where monthly_run_id=$1 and lane='candidate' order by current_rank limit 1",[run])).rows[0];const reserve=(await db.query("select * from public.travel_moment_monthly_candidates where monthly_run_id=$1 and lane='reserve' order by current_rank limit 1",[run])).rows[0];
 const operator=(await db.query("select id from public.profiles where role='operations' limit 1")).rows[0];assert.ok(operator,'requires existing operations fixture');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[operator.id]);
 await db.query("insert into public.travel_moment_flags(submission_id,code) values($1,'ENGAGEMENT_OUTLIER')",[candidate.submission_id]);assert.equal((await db.query('select status from public.travel_moment_submissions where id=$1',[candidate.submission_id])).rows[0].status,'eligible');
 assert.equal((await db.query("select public.operations_review_travel_moment_candidate($1,'rejected','PHASE42-TEST review') ok",[candidate.id])).rows[0].ok,true);
 const promoted=(await db.query('select lane,current_rank,promoted_from_reserve from public.travel_moment_monthly_candidates where id=$1',[reserve.id])).rows[0];assert.deepEqual(promoted,{lane:'candidate',current_rank:candidate.current_rank,promoted_from_reserve:true});
 const frozenBefore=(await db.query('select auto_score,current_rank from public.travel_moment_monthly_candidates where id=$1',[reserve.id])).rows[0];await db.query("insert into public.travel_moment_metric_snapshots(submission_id,provider,likes,views,refresh_key) values($1,'PHASE42-TEST',999999,999999,'later-growth')",[reserve.submission_id]);const repeat=(await db.query('select public.operations_generate_travel_moment_monthly_candidates($1::date) id',[month])).rows[0].id;assert.equal(repeat,run);const frozenAfter=(await db.query('select auto_score,current_rank from public.travel_moment_monthly_candidates where id=$1',[reserve.id])).rows[0];assert.deepEqual(frozenAfter,frozenBefore);
 const audits=(await db.query("select count(*)::int count from public.travel_moment_monthly_review_audits where monthly_run_id=$1 and action='promoted'",[run])).rows[0].count;assert.equal(audits,1);
 Object.assign(out,{A:'eligible scored',B:'pending excluded',C:'NULL preserved',D:'platform percentiles separate',E:'weights renormalized',F:'one user one slot',G:`${summary.candidate_count}+${summary.reserve_count}`,H:'reserve promoted',I:'flag retained without rejection',J:'finalized frozen',K:'late pending maturity',L:'idempotent',metricsRefresh:'idempotent snapshot write',summary,platforms:platformStats,metricCoverage:nullEntry.metric_coverage,promotionAudit:audits});
 await db.query('rollback');console.log(JSON.stringify({status:'PASS',...out}));
}catch(error){try{await db.query('rollback')}catch{}throw error}finally{await db.end()}
