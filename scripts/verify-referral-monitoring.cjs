const {Client}=require('pg');
const ref=process.env.RESTORE_SUPABASE_PROJECT_REF;
const region=process.env.RESTORE_REGION;
const password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD||'');
if(!ref||!region||!password)throw new Error('Missing disposable test database settings');
const client=new Client({connectionString:`postgresql://postgres.${ref}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`,ssl:{rejectUnauthorized:false}});
(async()=>{
 await client.connect();
 const admin=await client.query(`select u.id from auth.users u join public.profiles p on p.id=u.id where p.role='operations' order by u.created_at limit 1`);
 if(!admin.rowCount)throw new Error('No operations test account');
 await client.query(`select set_config('request.jwt.claim.sub',$1,false)`,[admin.rows[0].id]);
 const result=await client.query(`select public.get_operations_referral_summary() value`);
 const value=result.rows[0].value;
 const integrity=value.integrity;
 console.log(JSON.stringify({
  relationships:value.successfulInvites,
  paidInvitees:value.paidInvitees,
  qualifiedInvites:value.qualifiedInvites,
  couponCounts:value.couponCounts,
  expectedCoupons:integrity.expectedCoupons,
  actualCoupons:integrity.actualCoupons,
  missingPairs:integrity.missingPairs,
  orphanCoupons:integrity.orphanCoupons,
  alertCount:value.alerts.length,
  relationRows:value.relations.length,
  unavailableSignals:value.unavailableSignals,
 },null,2));
 await client.query('begin');
 const pair=await client.query(`select a.id inviter,b.id invitee from public.profiles a cross join public.profiles b where a.role='passenger' and b.role='passenger' and a.id<>b.id and not exists(select 1 from public.referral_relationships r where r.invitee_account_id=b.id) limit 1`);
 if(pair.rowCount){
  const {inviter,invitee}=pair.rows[0];const code=`MON${Date.now().toString(36).toUpperCase()}`.slice(0,20);
  await client.query(`insert into public.referral_codes(account_id,code) values($1,$2) on conflict(account_id) do update set code=excluded.code`,[inviter,code]);
  const relation=(await client.query(`insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent) values($1,$2,$3,10) returning id`,[inviter,invitee,code])).rows[0].id;
  await client.query(`insert into public.discount_coupons(account_id,referral_relationship_id,recipient_kind,discount_percent,status,expires_at) values($1,$3,'inviter',10,'pending_trip_completion','infinity'),($2,$3,'invitee',10,'active',now()+interval '90 days')`,[inviter,invitee,relation]);
  const healthy=(await client.query(`select public.get_operations_referral_summary() value`)).rows[0].value.integrity;
  await client.query(`delete from public.discount_coupons where referral_relationship_id=$1 and recipient_kind='invitee'`,[relation]);
  const broken=(await client.query(`select public.get_operations_referral_summary() value`)).rows[0].value;
  console.log(JSON.stringify({fixtureHealthy:{expectedCoupons:healthy.expectedCoupons,actualCoupons:healthy.actualCoupons,missingPairs:healthy.missingPairs},fixtureBroken:{missingPairs:broken.integrity.missingPairs,hasPairMismatchAlert:broken.alerts.some(item=>item.kind==='coupon_pair_mismatch')}},null,2));
 }
 await client.query('rollback');
 await client.end();
})().catch(async error=>{console.error(error.message);try{await client.end()}catch{}process.exitCode=1});
