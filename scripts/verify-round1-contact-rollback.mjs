import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
const env=parseEnv(readFileSync('.env.supabase.restore.local','utf8'));
const accounts=parseEnv(readFileSync('.env.supabase.restore-accounts.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');
assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
assert.ok(process.argv.includes('--rollback-test'));
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:'postgres.'+env.RESTORE_SUPABASE_PROJECT_REF,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const q=(sql,args=[])=>db.query(sql,args),evidence=[];
async function actor(id){await q('reset role');await q("select set_config('request.jwt.claim.sub',$1,true)",[id]);await q('set local role authenticated')}
async function denied(name,sql,args){
 await q('savepoint negative');
 try{await q(sql,args);assert.fail(name+' unexpectedly allowed')}
 catch(error){assert.ok(['42501','P0001'].includes(error.code),name+': '+error.message);evidence.push(name+' denied')}
 finally{await q('rollback to savepoint negative')}
}
await db.connect();
try{
 await q('begin');await q("set local lock_timeout='3s'; set local statement_timeout='15s'");
 await q(readFileSync('supabase/migrations/20260921014034_round1_contact_window.sql','utf8'));
 await q(readFileSync('supabase/migrations/20260921014412_passenger_location_coordinates.sql','utf8'));
 await q(readFileSync('supabase/migrations/20260921014907_private_trip_chat_photos.sql','utf8'));
 const ids={};
 for(const role of ['PASSENGER','PASSENGER2','OPERATIONS']){
  ids[role]=(await q('select id from auth.users where email=$1',[accounts[role+'_EMAIL']])).rows[0]?.id;
  assert.ok(ids[role],'Existing isolated '+role+' identity required');
 }
 const colleagues=JSON.parse(readFileSync('C:/Users/pangv/Downloads/JTW-Colleague-Test-20260914/账号密码-仅内部使用.json','utf8'));
 ids.DRIVER=colleagues.find(item=>item.code==='D01')?.id;
 assert.ok(ids.DRIVER,'Existing D01 test identity required');
 assert.equal((await q('select status from driver_resources where account_id=$1',[ids.DRIVER])).rows[0]?.status,'available','Do not activate resources for testing');
 const trip=(await q("insert into trips(slug,title,status,publication_scope) values($1,'TEST contact rollback','draft','internal_test') returning id",['contact-'+randomUUID()])).rows[0].id;
 const dep=(await q("insert into departures(trip_id,departs_at,capacity,status,sales_scope,seat_price_jpy) values($1,now()+interval '12 hours',4,'draft','internal_test',100) returning id",[trip])).rows[0].id;
 const va=(await q("insert into vehicle_assignments(departure_id,sequence,vehicle_type,capacity,planned_passengers) values($1,1,'test',4,1) returning id",[dep])).rows[0].id;
 const group=(await q('insert into vehicle_groups(departure_id,vehicle_assignment_id) values($1,$2) returning id',[dep,va])).rows[0].id;
 const room=(await q("insert into trip_rooms(vehicle_group_id,status,opens_at) values($1,'open',now()) returning id",[group])).rows[0].id;
 await q("insert into staff_assignments(vehicle_group_id,staff_id,role) values($1,$2,'driver')",[group,ids.DRIVER]);
 const order=(await q("insert into orders(account_id,departure_id,idempotency_key,seat_count,status) values($1,$2,$3,1,'paid') returning id",[ids.PASSENGER,dep,'contact-'+randomUUID()])).rows[0].id;
 await q('insert into vehicle_group_orders(vehicle_group_id,order_id) values($1,$2)',[group,order]);
 const passenger=(await q("insert into passengers(order_id,display_name,passenger_type) values($1,'TEST passenger','adult') returning id",[order])).rows[0].id;
 await q("insert into order_contact_private(order_id,contact_name,phone) values($1,'TEST only','0000000000')",[order]);
 await q("insert into vehicle_group_meeting_state(vehicle_group_id,meeting_at,meeting_name,meeting_address,latitude,longitude,status) values($1,now(),'TEST meeting','TEST address',34.7,135.5,'scheduled')",[group]);
 const contact='select * from get_staff_passenger_contact($1,$2)',args=[group,passenger];
 const photoId=randomUUID();
 await actor(ids.PASSENGER);
 const path=(await q("select prepare_trip_room_photo($1,$2,'image/png',8) path",[room,photoId])).rows[0].path;
 await denied('photo without uploaded object','select publish_trip_room_photo($1)',[photoId]);
 // Object metadata only: verifies DB authorization, NOT a Storage byte-upload acceptance test.
 await q("insert into storage.objects(bucket_id,name,metadata) values('trip-chat-media',$1,'{\"mimetype\":\"image/png\",\"size\":8}')",[path]);
 assert.equal((await q('select publish_trip_room_photo($1) id',[photoId])).rows[0].id,photoId);
 assert.equal((await q('select publish_trip_room_photo($1) id',[photoId])).rows[0].id,photoId);
 await actor(ids.PASSENGER2);
 assert.equal((await q("select name from storage.objects where bucket_id='trip-chat-media' and name=$1",[path])).rows.length,0);
 await denied('nonmember photo reservation',"select prepare_trip_room_photo($1,$2,'image/png',8)",[room,randomUUID()]);
 await actor(ids.DRIVER);
 assert.equal((await q("select name from storage.objects where bucket_id='trip-chat-media' and name=$1",[path])).rows.length,1);
 await q("select prepare_trip_room_photo($1,$2,'image/jpeg',100)",[room,randomUUID()]);
 evidence.push('private photo reservation, finalize and same-ID retry; assigned staff read, other passenger denied (metadata-only DB test)');
 const share='select publish_own_location_share($1,34.7,135.5,10,now(),true) id';
 await actor(ids.PASSENGER);
 await denied('location without explicit consent','select publish_own_location_share($1,34.7,135.5,10,now(),false)',[group]);
 assert.ok((await q(share,[group])).rows[0].id);
 assert.equal((await q('select * from get_passenger_location_shares($1)',[group])).rows.length,1);
 await actor(ids.PASSENGER2);assert.equal((await q('select * from get_passenger_location_shares($1)',[group])).rows.length,0);
 await denied('other passenger cannot publish to group',share,[group]);
 await actor(ids.DRIVER);assert.equal((await q('select * from get_passenger_location_shares($1)',[group])).rows.length,1);
 await actor(ids.PASSENGER);await q('select stop_own_location_share($1)',[group]);
 await actor(ids.DRIVER);assert.equal((await q('select * from get_passenger_location_shares($1)',[group])).rows.length,0);
 evidence.push('explicit passenger coordinates: own and assigned staff readable, other passenger denied, stop immediately hides');
 await actor(ids.DRIVER);await denied('open chat alone is not contact consent',contact,args);
 await q('reset role');await q("update vehicle_group_meeting_state set status='active' where vehicle_group_id=$1",[group]);
 for(const role of ['DRIVER','GUIDE','OPERATIONS']){
  if(role==='GUIDE'){await q('reset role');await q("update staff_assignments set role='guide' where vehicle_group_id=$1",[group])}
  await actor(role==='GUIDE'?ids.DRIVER:ids[role]);assert.equal((await q(contact,args)).rows.length,1);evidence.push(role+' assignment active meeting contact allowed (database role test, not browser login)');
 }
 await q('reset role');await q("update staff_assignments set role='driver' where vehicle_group_id=$1",[group]);
 await q('reset role');assert.equal((await q('select count(*)::int n from passenger_contact_access_audit where vehicle_group_id=$1',[group])).rows[0].n,3);
 evidence.push('each successful access audited; no telephone output in evidence');
 await actor(ids.PASSENGER);await denied('passenger cannot read phone',contact,args);
 await actor(ids.DRIVER);await denied('staff cannot read other group',contact,[randomUUID(),passenger]);
 await denied('staff cannot substitute passenger',contact,[group,randomUUID()]);
 for(const status of ['frozen','closed']){
  await q('reset role');await q('update trip_rooms set status=$1 where vehicle_group_id=$2',[status,group]);
  await actor(ids.DRIVER);await denied(status+' phone window',contact,args);
  await denied(status+' driver location','select start_driver_location_session_v2($1,15)',[group]);
  await actor(ids.PASSENGER);await denied(status+' passenger coordinates',share,[group]);
  await denied(status+' photo reservation',"select prepare_trip_room_photo($1,$2,'image/png',8)",[room,randomUUID()]);
  await denied(status+' photo finalization','select publish_trip_room_photo($1)',[photoId]);
  await denied(status+' text message','select send_trip_room_message($1,$2,$3)',[room,'TEST denied',randomUUID()]);
  await denied(status+' legacy passenger sharing','select start_own_location_share($1,15)',[group]);
 }
 await q('reset role');await q("update trip_rooms set status='open' where vehicle_group_id=$1",[group]);
 await actor(ids.DRIVER);
 const session=(await q('select start_driver_location_session_v2($1,15) session',[group])).rows[0].session.sessionId;
 assert.ok((await q('select append_driver_location_point($1,$2,34.7,135.5,10,now(),1) id',[group,session])).rows[0].id);
 evidence.push('assigned driver open-room location persisted inside rollback transaction');
 await q('reset role');await q('update staff_assignments set revoked_at=now() where vehicle_group_id=$1 and staff_id=$2',[group,ids.DRIVER]);
 await actor(ids.PASSENGER);await q(share,[group]);
 await actor(ids.DRIVER);assert.equal((await q('select * from get_passenger_location_shares($1)',[group])).rows.length,0);
 evidence.push('revoked staff cannot read passenger coordinates');
 await actor(ids.DRIVER);await denied('revoked assignment phone',contact,args);await denied('revoked driver location','select start_driver_location_session_v2($1,15)',[group]);
 await denied('old location session after revocation','select append_driver_location_point($1,$2,34.7,135.5,10,now(),2)',[group,session]);
 await q('reset role');await q("update vehicle_group_meeting_state set status='scheduled' where vehicle_group_id=$1",[group]);
 await q("update departures set departs_at=now()-interval '4 hours' where id=$1",[dep]);
 await actor(ids.OPERATIONS);assert.equal((await q(contact,args)).rows.length,1);evidence.push('existing configured time-window fallback allowed');
 await q('reset role');await q('set local role anon');await denied('anonymous phone',contact,args);
 await denied('anonymous photo reservation',"select prepare_trip_room_photo($1,$2,'image/png',8)",[room,randomUUID()]);
 console.log(JSON.stringify({evidence,cleanup:'all DDL and fictional data rolled back; no external calls'},null,2));
}finally{await q('rollback');await db.end()}
