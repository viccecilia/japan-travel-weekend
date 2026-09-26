// Idempotent, reversible Phase 3 referral-tree fixtures.  The hard guards make
// this unusable against a production project or arbitrary email accounts.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

if(!process.argv.includes('--seed-test-growth-tree'))throw new Error('Pass --seed-test-growth-tree to provision disposable referral-tree fixtures.');
const parse=text=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)]}));
const env=parse(readFileSync('.env.supabase.restore.local','utf8'));
assert.equal(env.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');assert.equal(env.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
const fixturePassword=process.env.GROWTH_TEST_FIXTURE_PASSWORD??env.GROWTH_TEST_FIXTURE_PASSWORD;
assert.ok(fixturePassword,'Set GROWTH_TEST_FIXTURE_PASSWORD outside the repository before seeding test fixtures.');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${env.RESTORE_SUPABASE_PROJECT_REF}`,password:env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const prefix='growth-phase3-tree-';
const fixtureEmail=name=>`${prefix}${name.toLowerCase()}@example.invalid`;
// A deliberately exceeds the per-level page size so the browser can exercise
// the real "load more" path.  These are disposable test identities only.
const people=[...Array.from({length:45},(_,i)=>`a${String(i+1).padStart(2,'0')}`),...['u10','u11','u12','u13','u14','u20','u21','u22','u23','u24','u30','u31','u32','u33','u34','ambassador','u41','u42','u43','anom']];

await db.connect();
try{
  await db.query('begin');
  const makeUser=async name=>{
    const email=fixtureEmail(name);let row=(await db.query('select id from auth.users where email=$1',[email])).rows[0];
    if(!row)row=(await db.query("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$1,crypt($2,gen_salt('bf')),now(),'','','','',jsonb_build_object('provider','email','providers',jsonb_build_array('email')),jsonb_build_object('display_name',$3::text,'requested_account_type','passenger'),now(),now()) returning id",[email,fixturePassword,`Tree ${name.toUpperCase()}`])).rows[0];
    await db.query("update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()),confirmation_token='',recovery_token='',email_change_token_new='' where id=$1",[row.id]);
    await db.query('select public.ensure_referral_code($1)',[row.id]);return row.id;
  };
  const ids={};for(const name of people)ids[name]=await makeUser(name);
  const fixtureCode=(await db.query('select code from public.referral_codes where account_id=$1',[ids.a01])).rows[0].code;
  const all=Object.values(ids);
  await db.query("delete from public.discount_coupons where source_event_id like 'growth-phase3-tree-%'");
  await db.query("delete from public.cash_commission_entries where source_order_id in (select id from public.orders where idempotency_key like 'growth-phase3-tree-%')");
  await db.query("delete from public.referral_lifecycles where invitee_account_id=any($1::uuid[])",[all]);
  await db.query("delete from public.referral_relationships where invitee_account_id=any($1::uuid[])",[all]);
  await db.query("delete from public.boardings where order_id in (select id from public.orders where idempotency_key like 'growth-phase3-tree-%')");
  await db.query("delete from public.passenger_checkins where order_id in (select id from public.orders where idempotency_key like 'growth-phase3-tree-%')");
  await db.query("delete from public.passengers where order_id in (select id from public.orders where idempotency_key like 'growth-phase3-tree-%')");
  await db.query("delete from public.vehicle_group_orders where order_id in (select id from public.orders where idempotency_key like 'growth-phase3-tree-%')");
  await db.query("delete from public.notification_outbox where order_id in (select id from public.orders where idempotency_key like 'growth-phase3-tree-%')");
  await db.query("delete from public.orders where idempotency_key like 'growth-phase3-tree-%'");
  await db.query("delete from public.referral_sources where code in ('G3FLAT2026','G3RELAY2026','G3DEEP2026','G3ANOM2026')");
  const trip=(await db.query("insert into public.trips(slug,title,status,content,publication_scope) values('growth-phase3-tree-fixture','Growth Phase 3 tree fixture','published',jsonb_build_object('description','Isolated Growth Phase 3 test route.','itinerary',jsonb_build_array('Fixture stop'),'included',jsonb_build_array('Fixture transport'),'excluded',jsonb_build_array('Fixture expense'),'childPolicy','Fixture child policy','luggagePolicy','Fixture luggage policy','accessibilityInfo','Fixture accessibility policy','mealInfo','Fixture meal policy','weatherPolicy','Fixture weather policy','cancellationPolicyVersion','growth-phase3-v1'),'public') on conflict(slug) do update set title=excluded.title,content=excluded.content returning id")).rows[0].id;
  const departure=(await db.query("insert into public.departures(trip_id,capacity,status,departs_at,ends_at,sales_open_at,sales_close_at,minimum_guests,seat_price_jpy,currency,tax_included,meeting_name,meeting_address,map_lat,map_lng,sales_scope) values($1,80,'open',now()+interval '15 days',now()+interval '15 days 8 hours',now()-interval '1 day',now()+interval '14 days',1,10000,'JPY',true,'Growth tree fixture','Test only',35,135,'public') returning id",[trip])).rows[0].id;
  const source=async(kind,name,code)=> (await db.query("insert into public.referral_sources(source_kind,display_name,code,active) values($1,$2,$3,true) returning id",[kind,name,code])).rows[0].id;
  const flat=await source('organization','机构 A（平铺型）','G3FLAT2026');const relay=await source('organization','机构 B（双中继）','G3RELAY2026');const deep=await source('organization','机构 C（深层裂变）','G3DEEP2026');const anomaly=await source('organization','机构 E（异常检测）','G3ANOM2026');
  const accountSource=async name=>(await db.query('select id from public.referral_sources where account_id=$1',[ids[name]])).rows[0].id;
  const add=async(name,parent,root,valid=false,{ageDays=3,status:requestedStatus}={})=>{
    const child=await accountSource(name);const relation=(await db.query("insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent,parent_source_id,root_source_id,created_at) values(null,$1,$2,10,$3,$4,now()-($5::text||' days')::interval) returning id",[ids[name],fixtureCode,parent,root,String(ageDays)])).rows[0].id;
    let order=null;if(valid){order=(await db.query("insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount,gross_amount,discount_amount) values($1,$2,$3,1,'confirmed',10000,10000,0) returning id",[ids[name],departure,`growth-phase3-tree-${name}`])).rows[0].id;}
    const completedAt=valid?new Date(Date.now()-(ageDays-1)*86400000):null;
    const lifecycleStatus=requestedStatus??(valid?'valid_referral':'registered');
    await db.query("insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,registered_at,first_payment_completed_at,first_trip_completed_at,valid_at,first_completed_order_id,status) values($1,$2,now()-($3::text||' days')::interval,$4,$4,$4,$5,$6)",[relation,ids[name],String(ageDays),completedAt,order,lifecycleStatus]);
    return {child,relation,order};
  };
  const flatRows=[];for(let i=1;i<=45;i++)flatRows.push(await add(`a${String(i).padStart(2,'0')}`,flat,flat,i<=5,{ageDays:i<=5?14:3,status:i===45?'refunded':undefined}));
  const u10=await add('u10',relay,relay);const u20=await add('u20',relay,relay);
  const relayChildren=[];for(const name of ['u11','u12','u13','u14'])relayChildren.push(await add(name,u10.child,relay,name!=='u14'));for(const name of ['u21','u22','u23','u24'])relayChildren.push(await add(name,u20.child,relay,name!=='u24'));
  const u30=await add('u30',deep,deep,false,{ageDays:14});const u31=await add('u31',u30.child,deep);const u32=await add('u32',u31.child,deep);await add('u33',u32.child,deep,true);await add('u34',u32.child,deep,true);
  const ambassadorRoot=await accountSource('ambassador');await add('u41',ambassadorRoot,ambassadorRoot,true);await add('u42',ambassadorRoot,ambassadorRoot);await add('u43',ambassadorRoot,ambassadorRoot,true);
  // Isolated bad lifecycle data is intentional: it verifies detection/filtering
  // without contaminating the four demonstration roots.
  await add('anom',anomaly,anomaly,false,{status:'valid_referral'});
  for(const row of relayChildren.filter(row=>row.order)){const beneficiary=row.relation===relayChildren[0].relation||row.relation===relayChildren[1].relation||row.relation===relayChildren[2].relation?ids.u10:ids.u20;await db.query("insert into public.cash_commission_entries(beneficiary_account_id,referred_account_id,referral_relationship_id,source_order_id,rule_version,basis_amount_jpy,eligible_amount_jpy,commission_percent,amount_jpy,reward_rule,status,confirmed_at,unlocked_at) values($1,(select invitee_account_id from public.referral_relationships where id=$2),$2,$3,'cash-10-v1',10000,10000,10,1000,'cash-10-v1','available',now(),now())",[beneficiary,row.relation,row.order]);}
  const couponRelation=relayChildren[0];await db.query("insert into public.discount_coupons(account_id,referral_relationship_id,recipient_kind,discount_percent,status,expires_at,source_type,source_event_id,source_order_id,face_value_jpy,remaining_value_jpy) values($1,$2,'invitee',10,'active',now()+interval '30 days','travel_moment','growth-phase3-tree-post-001',$3,5000,5000)",[ids.u11,couponRelation.relation,couponRelation.order]);
  await db.query('commit');
  console.log(JSON.stringify({status:'PASS',project:env.RESTORE_SUPABASE_PROJECT_REF,batch:'growth-phase3-tree',roots:{flat,relay,deep,ambassador:ambassadorRoot},note:'fixture users use the configured disposable test fixture secret'}));
}catch(error){try{await db.query('rollback')}catch{}throw error}finally{await db.end()}
