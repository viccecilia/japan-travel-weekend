// Existing restore-test only. No account creation/reset; all fixture/DDL writes roll back.
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import pg from 'pg';
const env=parseEnv(readFileSync('.env.supabase.restore.local','utf8'));
const front=parseEnv(readFileSync('.env.production.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_SUPABASE_URL,front.VITE_SUPABASE_URL);
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
assert.ok(process.argv.includes('--rollback-test'),'Explicit --rollback-test required');
const accounts=JSON.parse(readFileSync('C:/Users/pangv/Downloads/JTW-Colleague-Test-20260914/账号密码-仅内部使用.json','utf8'));
const identity=Object.fromEntries(['P01','D01','A01'].map(code=>[code,accounts.find(x=>x.code===code).id]));
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:'postgres.'+env.RESTORE_SUPABASE_PROJECT_REF,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const migrations=['20260919100111_operations_read_authorization_closure.sql','20260919100132_travelers_boost_explicit_consent.sql','20260919100755_staff_assignment_capability_boundary.sql','20260919101135_restore_korean_translation_context.sql'];
const evidence=[];
const query=(sql,args=[])=>db.query(sql,args);
async function asAccount(id){await query('reset role');await query("select set_config('request.jwt.claim.sub',$1,true)",[id??'']);await query('set local role authenticated');}
async function denied(name,sql,args=[],expectedCode='42501'){
  await query('savepoint negative');
  try{await query(sql,args);throw Error(name+': unauthorized operation accepted');}
  catch(error){if(error.code!==expectedCode)throw error;evidence.push({name,result:'denied',sqlstate:error.code});}
  finally{await query('rollback to savepoint negative');}
}
try{
 await db.connect();await query('begin');
 await query("set local lock_timeout='3s'; set local statement_timeout='20s'");
 for(const [code,id] of Object.entries(identity)){
  const rows=(await query('select u.email,p.role,u.email_confirmed_at is not null verified,u.banned_until,u.deleted_at from auth.users u join public.profiles p on p.id=u.id where u.id=$1',[id])).rows;
  assert.equal(rows.length,1,'Existing test identity missing');
  evidence.push({name:'identity-'+code,role:rows[0].role,emailMatchesSaved:rows[0].email===accounts.find(x=>x.code===code).email,verified:rows[0].verified,banned:Boolean(rows[0].banned_until),deleted:Boolean(rows[0].deleted_at)});
 }
 for(const migration of migrations){
  const sql=readFileSync('supabase/migrations/'+migration,'utf8');
  assert.match(sql,/^\s*begin;/i);assert.match(sql,/commit;\s*$/i);
  await query(sql.replace(/^\s*begin;\s*/i,'').replace(/\s*commit;\s*$/i,''));
  evidence.push({name:migration,result:'applied inside rollback transaction'});
 }
 const names=[...readFileSync('supabase/migrations/'+migrations[0],'utf8').matchAll(/function public\.(\w+)\(/g)].map(x=>x[1]);
 for(const name of names){
  const fn=(await query("select oid,oidvectortypes(proargtypes) as types from pg_proc where pronamespace='public'::regnamespace and proname=$1",[name])).rows;
  assert.equal(fn.length,1);
  const types=fn[0].types?fn[0].types.split(', '):[];
  const args=types.map(type=>type==='uuid'?'00000000-0000-0000-0000-000000000000':type.includes('date')||type.includes('timestamp')?'2099-01-01':null);
  const sql='select count(*) from public.'+name+'('+types.map((type,i)=>'$'+(i+1)+'::'+type).join(',')+')';
  for(const code of ['P01','D01']){await asAccount(identity[code]);await denied(name+'-'+code,sql,args);}
  await asAccount(identity.A01);await query(sql,args);evidence.push({name:name+'-A01',result:'executed'});
 }
 await query('reset role');
 const suffix='closure-'+Date.now();
 const trip=(await query("insert into public.trips(slug,title,status,publication_scope) values($1,'TEST Blocker Closure','draft','internal_test') returning id",[suffix])).rows[0].id;
 const departure=(await query("insert into public.departures(trip_id,capacity,status,sales_scope,seat_price_jpy) values($1,4,'draft','internal_test',100) returning id",[trip])).rows[0].id;
 const va=(await query("insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,capacity,planned_passengers) values($1,1,'test',4,1) returning id",[departure])).rows[0].id;
 const group=(await query('insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values($1,$2) returning id',[departure,va])).rows[0].id;
 await query("insert into public.vehicle_group_meeting_state(vehicle_group_id,meeting_at,meeting_name,meeting_address,latitude,longitude,changed_by) values($1,now(),'TEST meeting','TEST rollback fixture',34.7,135.5,$2)",[group,identity.A01]);
 const room=(await query("insert into public.trip_rooms(vehicle_group_id,status,opens_at) values($1,'open',now()-interval '1 hour') returning id",[group])).rows[0].id;
 const resource=(await query('select status from public.driver_resources where account_id=$1',[identity.D01])).rows[0];
 assert.equal(resource?.status,'available','Existing test driver must already be available; do not enable a real resource');
 const assignment=(await query("insert into public.staff_assignments(vehicle_group_id,staff_id,role) values($1,$2,'driver') returning id",[group,identity.D01])).rows[0].id;
 const caps=async()=> (await query("select public.staff_assignment_allows($1,'driving',$2) driving,public.staff_assignment_allows($1,'guiding',$2) guiding",[group,identity.D01])).rows[0];
 assert.deepEqual(await caps(),{driving:true,guiding:false});
 await asAccount(identity.D01);
 const locationSession=(await query('select public.start_driver_location_session_v2($1,30) result',[group])).rows[0].result;
 assert.ok(locationSession.sessionId);evidence.push({name:'driver-position-session',result:'created in rollback transaction'});
 await denied('driver-other-group','select public.start_driver_location_session_v2($1,30)',['00000000-0000-0000-0000-000000000000']);
 await denied('private-capability-helper','select public.staff_assignment_allows($1,$2,$3)',[group,'guiding',identity.A01]);
 await denied('driver-cannot-start-guide-meeting','select public.record_staff_execution_event($1,$2,$3,$4)',[group,'meeting_started','{}',suffix+'-meeting']);
 await denied('driver-cannot-self-grant-guiding','select public.operations_set_assignment_guiding($1,true,0,$2)',[assignment,'test explicit duty']);
 await asAccount(identity.P01);
 await denied('passenger-cannot-drive','select public.advance_vehicle_group_journey($1,$2,$3,$4,$5)',[group,'stop_arrived',null,'test',suffix+'-drive']);
 await query('reset role');
 await query("update public.staff_assignments set role='guide' where id=$1",[assignment]);
 assert.deepEqual(await caps(),{driving:false,guiding:true});
 await asAccount(identity.D01);
 await denied('guide-cannot-drive','select public.advance_vehicle_group_journey($1,$2,$3,$4,$5)',[group,'stop_arrived',null,'test',suffix+'-drive']);
 await denied('guide-cannot-publish-vehicle-position','select public.start_driver_location_session_v2($1,30)',[group]);
 await query('select public.record_staff_execution_event($1,$2,$3,$4)',[group,'meeting_started','{}',suffix+'-guide-meeting']);
 await query('reset role');
 await query("update public.staff_assignments set role='driver' where id=$1",[assignment]);
 await asAccount(identity.A01);
 await query('select public.operations_set_assignment_guiding($1,true,0,$2)',[assignment,'TEST explicit combined assignment']);
 await denied('combined-authorization-stale-version','select public.operations_set_assignment_guiding($1,true,0,$2)',[assignment,'stale retry'],'40001');
 await query('reset role');
 assert.deepEqual(await caps(),{driving:true,guiding:true});
 await query("update public.vehicle_group_meeting_state set status='scheduled' where vehicle_group_id=$1",[group]);
 await asAccount(identity.D01);
 await query('select public.record_staff_execution_event($1,$2,$3,$4)',[group,'meeting_started','{}',suffix+'-combined-meeting']);
 await query('reset role');
 await query('update public.staff_assignments set revoked_at=now() where id=$1',[assignment]);
 assert.deepEqual(await caps(),{driving:false,guiding:false});
 assert.equal((await query('select enabled from public.staff_assignment_guiding_grants where assignment_id=$1',[assignment])).rows[0].enabled,false);
 await asAccount(identity.D01);
 await denied('revoked-combined-cannot-execute','select public.record_staff_execution_event($1,$2,$3,$4)',[group,'meeting_started','{}',suffix+'-revoked']);
 await query('reset role');
 await query('update public.staff_assignments set revoked_at=null where id=$1',[assignment]);
 assert.deepEqual(await caps(),{driving:true,guiding:false});
 await query('update public.staff_assignments set revoked_at=now() where id=$1',[assignment]);
 evidence.push({name:'assignment-matrix',result:'driver driving only; guide guiding only; explicit combined both; revoked neither; real RPC negative and meeting positive cases'});
 await query("insert into public.vehicle_group_journey_state(vehicle_group_id,status,updated_by) values($1,'completed',$2) on conflict(vehicle_group_id) do update set status='completed',updated_by=excluded.updated_by",[group,identity.A01]);
 const order=(await query("insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status) values($1,$2,$3,1,'paid') returning id",[identity.P01,departure,suffix])).rows[0].id;
 await query('insert into public.vehicle_group_orders(vehicle_group_id,order_id) values($1,$2)',[group,order]);
 const message=(await query("insert into public.trip_room_messages(trip_room_id,author_id,content) values($1,$2,'TEST translation context') returning id",[room,identity.P01])).rows[0].id;
 for(const language of ['zh-CN','zh-TW','en','ja','ko','es','vi','ne']){
   const rows=(await query('select * from public.get_message_translation_context($1,$2,$3)',[identity.P01,message,language])).rows;
   assert.equal(rows.length,language==='es'?0:1);
   if(language!=='es'){
     await query('set local role service_role');
     await query('select public.store_message_translation($1,$2,$3,$4)',[message,language,'TEST fixture not an external translation','rollback-test-receiver']);
     await query('reset role');
     const cached=(await query('select * from public.get_message_translation_context($1,$2,$3)',[identity.P01,message,language])).rows[0];
     assert.equal(cached.cached_translation,'TEST fixture not an external translation');
   }
   evidence.push({name:'translation-context-'+language,result:language==='es'?'not connected':'authorized context available; external generation not exercised'});
 }
 assert.equal((await query("select * from public.get_message_translation_context($1,$2,'ko')",[identity.D01,message])).rows.length,0);
 await asAccount(identity.P01);
 await denied('passenger-cannot-write-translation-cache','select public.store_message_translation($1,$2,$3,$4)',[message,'en','fake','fake']);
 await query('reset role');
 evidence.push({name:'translation-revoked-staff',result:'no context returned'});
 const price=(await query('select round(5500*1.10/100.0)*100 as rounded')).rows[0].rounded;
 assert.equal(Number(price),6100);evidence.push({name:'weekend-rounding',result:'5500 * 1.10 = 6050; round to nearest 100 = 6100; no price changed'});
 const campaign=(await query("insert into public.link_campaigns(campaign_month,status,opens_at,closes_at) values('2199-01-01','open',now()-interval '1 hour',now()+interval '1 hour') returning id")).rows[0].id;
 const consent={authorized:true,mention_confirmed:true,display:true,monitoring:true,repost:true,download:false,editing:false,reupload:false,paid_ads:false};
 const call='select public.submit_travel_share_link($1,$2,$3,$4,$5,$6,$7::jsonb)';
 const inputs=scope=>[campaign,order,'tiktok','https://www.tiktok.com/@closure/video/'+Date.now(),'closure','share-link-limited-v2',JSON.stringify(scope)];
 await asAccount(identity.P01);
 for(const [name,scope] of [['null',null],['missing',{}],['not-authorized',{...consent,authorized:false}],['mention-missing',{...consent,mention_confirmed:false}],['string-true',{...consent,authorized:'true'}],['paid-ads',{...consent,paid_ads:true}],['extra-right',{...consent,all_future_posts:true}]]){
  await denied('boost-'+name,call,inputs(scope));
 }
 const oldVersion=inputs(consent);oldVersion[5]='old';await denied('boost-old-version',call,oldVersion);
 const success=await query(call,inputs(consent));assert.ok(success.rows[0].submit_travel_share_link);
 const saved=(await query('select authorization_scope from public.link_campaign_submissions where id=$1',[success.rows[0].submit_travel_share_link])).rows[0];
 assert.deepEqual(saved.authorization_scope,consent);evidence.push({name:'boost-explicit-consent',result:'persisted exact limited rights within transaction'});
 await asAccount(null);await denied('boost-no-account',call,inputs(consent)).catch(error=>{if(!error.message.includes('authentication required'))throw error;evidence.push({name:'boost-no-account',result:'denied authentication'});});
 await query('reset role');
 await query('rollback');
 const remaining=(await query('select count(*)::int n from public.trips where id=$1',[trip])).rows[0].n;
 assert.equal(remaining,0);
 evidence.push({name:'rollback',result:'confirmed: no fixture persisted, no migration installed'});
 console.log(JSON.stringify(evidence,null,2));
}catch(error){await query('rollback').catch(()=>{});console.error(JSON.stringify({error:error.message,code:error.code,detail:error.detail,where:error.where,evidence},null,2));process.exitCode=1;}
finally{await db.end();}
