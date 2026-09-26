// Disposable-test-project fixtures for the Ambassador UI. Never use this on
// production: it hard-locks the known test project ref and fixture emails.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

if(!process.argv.includes('--provision-test-growth'))throw new Error('Pass --provision-test-growth to provision disposable demo fixtures.');
const parse=(text)=>Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)]}));
const restore=parse(readFileSync('.env.supabase.restore.local','utf8'));
assert.equal(restore.RESTORE_SUPABASE_PROJECT_REF,'hzxoofvodpqpdomtmzlf');assert.equal(restore.RESTORE_TARGET_IS_DISPOSABLE,'yes-delete-test-data');
const password=process.env.GROWTH_TEST_FIXTURE_PASSWORD??restore.GROWTH_TEST_FIXTURE_PASSWORD;
assert.ok(password,'Set GROWTH_TEST_FIXTURE_PASSWORD outside the repository before provisioning test fixtures.');
const db=new pg.Client({host:'aws-0-ap-northeast-1.pooler.supabase.com',port:6543,user:`postgres.${restore.RESTORE_SUPABASE_PROJECT_REF}`,password:restore.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const primary=[['a','growth-phase2-a@example.invalid','Growth A 6'],['b','growth-phase2-b@example.invalid','Growth B 9'],['c','growth-phase2-c@example.invalid','Growth C 10'],['d','growth-phase2-d@example.invalid','Growth D Company'],['driver','growth-phase2-driver@example.invalid','Growth Driver Guide']];
const allEmails=[...primary.map(([,email])=>email),...['a','b','c','driver'].flatMap(key=>Array.from({length:key==='a'?6:key==='b'?9:key==='c'?10:2},(_,i)=>`growth-phase2-${key}-ref-${i+1}@example.invalid`))];
await db.connect();
try{
 const user=async(email,name,role='passenger')=>{
   const found=await db.query('select id from auth.users where email=$1',[email]);
   const account=found.rowCount?found.rows[0]:(await db.query("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$1,crypt($2,gen_salt('bf')),now(),'','','','',jsonb_build_object('provider','email','providers',jsonb_build_array('email')),jsonb_build_object('display_name',$3::text,'requested_account_type',$4::text),now(),now()) returning id",[email,password,name,role])).rows[0];
   await db.query("update auth.users set encrypted_password=crypt($2,gen_salt('bf')),email_confirmed_at=coalesce(email_confirmed_at,now()),confirmation_token=coalesce(confirmation_token,''),recovery_token=coalesce(recovery_token,''),email_change_token_new=coalesce(email_change_token_new,''),email_change=coalesce(email_change,''),raw_app_meta_data=jsonb_build_object('provider','email','providers',jsonb_build_array('email')),updated_at=now() where id=$1",[account.id,password]);
   await db.query("insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values($1::uuid,$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true,'phone_verified',false),'email',now(),now()) on conflict(provider_id,provider) do update set user_id=excluded.user_id,identity_data=excluded.identity_data,updated_at=now()",[account.id,email]);
   return account;
 };
 for(const [,email,name] of primary)await user(email,name,email.includes('driver')?'driver':'passenger');
 for(const email of allEmails.filter(email=>!primary.some(([,value])=>value===email)))await user(email,'Growth referral');
 const result=await db.query('select id,email from auth.users where email=any($1)',[allEmails]);const ids=Object.fromEntries(result.rows.map(row=>[row.email,row.id]));
 await db.query('begin');
 await db.query("delete from public.cash_commission_entries where beneficiary_account_id=any($1::uuid[]) or referred_account_id=any($1::uuid[])",[Object.values(ids)]);
 await db.query("delete from public.referral_lifecycles where invitee_account_id=any($1::uuid[])",[Object.values(ids)]);
 await db.query("delete from public.referral_relationships where inviter_account_id=any($1::uuid[]) or invitee_account_id=any($1::uuid[])",[Object.values(ids)]);
 await db.query("delete from public.ambassador_qualifications where account_id=any($1::uuid[])",[Object.values(ids)]);
 await db.query("delete from public.boardings where order_id in (select id from public.orders where idempotency_key like 'growth-phase2-fixture-%')");
 await db.query("delete from public.passenger_checkins where order_id in (select id from public.orders where idempotency_key like 'growth-phase2-fixture-%')");
 await db.query("delete from public.passengers where order_id in (select id from public.orders where idempotency_key like 'growth-phase2-fixture-%')");
 await db.query("delete from public.vehicle_group_orders where order_id in (select id from public.orders where idempotency_key like 'growth-phase2-fixture-%')");
 await db.query("delete from public.notification_outbox where order_id in (select id from public.orders where idempotency_key like 'growth-phase2-fixture-%')");
 await db.query("delete from public.orders where idempotency_key like 'growth-phase2-fixture-%'");
 await db.query("insert into public.trips(slug,title,status,content,publication_scope) values('growth-phase2-fixture','Growth Phase 2 fixture','published',jsonb_build_object('description','Isolated Growth Phase 2 test route.','itinerary',jsonb_build_array('Fixture stop'),'included',jsonb_build_array('Fixture transport'),'excluded',jsonb_build_array('Fixture expense'),'childPolicy','Fixture child policy','luggagePolicy','Fixture luggage policy','accessibilityInfo','Fixture accessibility policy','mealInfo','Fixture meal policy','weatherPolicy','Fixture weather policy','cancellationPolicyVersion','growth-phase2-v1'),'public') on conflict(slug) do update set title=excluded.title,content=excluded.content returning id");
 const trip=(await db.query("select id from public.trips where slug='growth-phase2-fixture'")).rows[0].id;
 const departure=(await db.query("insert into public.departures(trip_id,capacity,status,departs_at,ends_at,sales_open_at,sales_close_at,minimum_guests,seat_price_jpy,currency,tax_included,meeting_name,meeting_address,map_lat,map_lng,sales_scope) values($1,50,'open',now()+interval '45 days',now()+interval '45 days 8 hours',now()-interval '1 day',now()+interval '44 days',1,10000,'JPY',true,'Growth fixture','Test only',35,135,'public') returning id",[trip])).rows[0].id;
 for(const [key,email] of primary){const id=ids[email];await db.query('select public.ensure_referral_code($1)',[id]);}
 const count={a:6,b:9,c:10,driver:2};
 for(const [key,email] of primary.filter(([key])=>key in count)){
   const inviter=ids[email];const code=(await db.query('select code from public.referral_codes where account_id=$1',[inviter])).rows[0].code;const source=(await db.query('select id from public.referral_sources where account_id=$1',[inviter])).rows[0].id;
   for(let i=1;i<=count[key];i++){
     const invitee=ids[`growth-phase2-${key}-ref-${i}@example.invalid`];const created=i%3===0?"now()-interval '35 days'":"now()-interval '7 days'";
     const relation=(await db.query(`insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent,parent_source_id,root_source_id,created_at) values($1,$2,$3,10,$4,$4,${created}) returning id`,[inviter,invitee,code,source])).rows[0].id;
     const order=(await db.query(`insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount,gross_amount,discount_amount) values($1,$2,$3,1,'confirmed',12000,12000,0) returning id`,[invitee,departure,`growth-phase2-fixture-${key}-${i}`])).rows[0].id;
     const at=i%3===0?"now()-interval '35 days'":"now()-interval '7 days'";
     await db.query(`insert into public.referral_lifecycles(referral_relationship_id,invitee_account_id,first_order_id,first_paid_order_id,first_completed_order_id,registered_at,first_payment_completed_at,first_trip_completed_at,valid_at,status) values($1,$2,$3,$3,$3,${at},${at},${at},${at},'valid_referral')`,[relation,invitee,order]);
     await db.query(`insert into public.cash_commission_entries(beneficiary_account_id,referred_account_id,referral_relationship_id,source_order_id,rule_version,basis_amount_jpy,eligible_amount_jpy,commission_percent,amount_jpy,reward_rule,status,confirmed_at,unlocked_at) values($1,$2,$3,$4,'cash-10-v1',12000,12000,10,1200,'cash-10-v1','available',${at},${at})`,[inviter,invitee,relation,order]);
   }
   await db.query('select public.refresh_ambassador_qualification($1)',[inviter]);
 }
 const d=ids['growth-phase2-d@example.invalid'];await db.query("insert into public.ambassador_qualifications(account_id,status,source,approved_at,activated_at,qualification_achieved_at,qualification_source,review_note) values($1,'active','company_granted',now(),now(),now(),'company_granted','test fixture company grant')",[d]);
 const driver=ids['growth-phase2-driver@example.invalid'];await db.query("update public.profiles set role='driver' where id=$1",[driver]);await db.query("insert into public.staff_account_applications(account_id,requested_role,status,applicant_name,review_note,reviewed_at) values($1,'driver','approved','Growth Driver Guide','test fixture',now()) on conflict(account_id) do update set status='approved',review_note='test fixture',reviewed_at=now()",[driver]);await db.query("insert into public.driver_resources(account_id,display_name,languages,status,service_role) values($1,'Growth Driver Guide',array['zh-CN','en'],'available','driver_guide') on conflict(account_id) do update set display_name=excluded.display_name,languages=excluded.languages,status='available',service_role='driver_guide',updated_at=now()",[driver]);
 await db.query('commit');
 console.log(JSON.stringify({status:'PASS',project:restore.RESTORE_SUPABASE_PROJECT_REF,accounts:{A:primary[0][1],B:primary[1][1],C:primary[2][1],D:primary[3][1],DriverGuide:primary[4][1]},fixture:'test-growth-phase2'}));
}catch(error){try{await db.query('rollback')}catch{}throw error}finally{await db.end()}
