const {Client}=require('pg');
const ref=process.env.RESTORE_SUPABASE_PROJECT_REF,region=process.env.RESTORE_REGION,password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD||'');
if(!ref||!region||!password)throw new Error('missing disposable database settings');
const client=new Client({connectionString:`postgresql://postgres.${ref}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`,ssl:{rejectUnauthorized:false}});
(async()=>{
 await client.connect();await client.query('begin');
 try{
  const fixture=await client.query(`select c.id coupon_id,c.account_id,c.status,c.available_at,c.qualifying_trip_starts_at,c.qualifying_order_id from public.discount_coupons c join public.referral_relationships r on r.id=c.referral_relationship_id join auth.users u on u.id=r.invitee_account_id where u.email='test2@daitora' and c.recipient_kind='inviter' limit 1`);
  if(!fixture.rowCount)throw new Error('referral fixture missing');const row=fixture.rows[0];
  const hours=(new Date(row.qualifying_trip_starts_at)-new Date(row.available_at))/3600000;
  if(row.status!=='pending_trip_completion'||hours!==24)throw new Error(`unexpected waiting reward ${row.status}/${hours}`);
  await client.query(`update public.discount_coupons set available_at=now()-interval '1 minute' where id=$1`,[row.coupon_id]);
  const activated=(await client.query(`select public.activate_referral_rewards_at_refund_cutoff($1) changed`,[row.account_id])).rows[0].changed;
  const active=(await client.query(`select status from public.discount_coupons where id=$1`,[row.coupon_id])).rows[0].status;
  if(Number(activated)!==1||active!=='active')throw new Error(`cutoff activation failed ${activated}/${active}`);
  await client.query(`update public.orders set status='cancelled' where id=$1`,[row.qualifying_order_id]);
  const invalid=(await client.query(`select status from public.discount_coupons where id=$1`,[row.coupon_id])).rows[0].status;
  if(invalid!=='void')throw new Error(`cancellation did not void reward: ${invalid}`);
  console.log(JSON.stringify({ok:true,initialStatus:row.status,unlockHoursBeforeStart:hours,activatedAtCutoff:active,cancelledRewardStatus:invalid,rollback:true}));
 }finally{await client.query('rollback');await client.end()}
})().catch(error=>{console.error(error.message);process.exitCode=1});
