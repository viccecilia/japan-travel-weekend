const { Client } = require('pg');

function connectionString() {
  const ref = process.env.RESTORE_SUPABASE_PROJECT_REF;
  const region = process.env.RESTORE_REGION;
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || '');
  if (!ref || !region || !password) throw new Error('Missing disposable test database settings');
  return `postgresql://postgres.${ref}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
}

async function main() {
  const client = new Client({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('begin');
  try {
    const accounts = await client.query(`
      select a.id inviter, b.id invitee
      from public.profiles a cross join public.profiles b
      where a.id <> b.id
        and not exists(select 1 from public.referral_relationships r where r.invitee_account_id=b.id)
      limit 1`);
    if (!accounts.rowCount) throw new Error('Need two available test profiles');
    const { inviter, invitee } = accounts.rows[0];
    const suffix = Date.now().toString(36);
    const referralCode = `VERIFY${suffix.toUpperCase()}`.slice(0, 20);
    await client.query(
      `insert into public.referral_codes(account_id,code) values($1,$2)
       on conflict(account_id) do update set code=excluded.code`,
      [inviter, referralCode],
    );
    const departure = await client.query(`select id from public.departures where departs_at is not null and ends_at is not null order by created_at limit 1`);
    if (!departure.rowCount) throw new Error('Need an existing test departure');
    const relation = await client.query(
      `insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent)
       values($1,$2,$3,10) returning id`,
      [inviter, invitee, referralCode],
    );

    async function createOrder(key, initialStatus = 'paid') {
      return (await client.query(
        `insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount)
         values($1,$2,$3,1,$4,10000) returning id`,
        [invitee, departure.rows[0].id, key, initialStatus],
      )).rows[0].id;
    }
    const inviterCoupon = (await client.query(
      `insert into public.discount_coupons(account_id,referral_relationship_id,recipient_kind,discount_percent,status,expires_at)
       values($1,$2,'inviter',10,'pending_trip_completion','infinity')
       on conflict(referral_relationship_id,recipient_kind) do update set account_id=excluded.account_id
       returning id`,
      [inviter, relation.rows[0].id],
    )).rows[0].id;
    async function prepareCoupon(orderId, status) {
      await client.query(
        `update public.discount_coupons set status=$2,qualifying_order_id=$3,expires_at=now()+interval '30 days' where id=$1`,
        [inviterCoupon, status, orderId],
      );
    }
    async function status(id) {
      return (await client.query(`select status from public.discount_coupons where id=$1`, [id])).rows[0].status;
    }

    const pendingOrder = await createOrder(`verify-pending-${suffix}`, 'pending_payment');
    await client.query(
      `update public.discount_coupons set status='pending_trip_completion',qualifying_order_id=null,available_at=null,qualifying_trip_starts_at=null where id=$1`,
      [inviterCoupon],
    );
    await client.query(`update public.orders set status='paid' where id=$1`, [pendingOrder]);
    const schedule = (await client.query(
      `select status,qualifying_order_id,available_at,qualifying_trip_starts_at from public.discount_coupons where id=$1`,
      [inviterCoupon],
    )).rows[0];
    await client.query(`update public.orders set status='cancelled' where id=$1`, [pendingOrder]);
    const cancelledBeforeTripCompletion = await status(inviterCoupon);

    const activeOrder = await createOrder(`verify-active-${suffix}`);
    await prepareCoupon(activeOrder, 'active');
    await client.query(`update public.orders set status='cancelled' where id=$1`, [activeOrder]);
    const cancelledAfterActivation = await status(inviterCoupon);

    const redeemedOrder = await createOrder(`verify-redeemed-${suffix}`);
    await prepareCoupon(redeemedOrder, 'redeemed');
    await client.query(`update public.orders set status='refunded' where id=$1`, [redeemedOrder]);
    const refundedAfterRedemption = await status(inviterCoupon);

    const result = {
      scheduledAfterPayment: {
        status: schedule.status,
        boundToPaidOrder: schedule.qualifying_order_id === pendingOrder,
        hasTripStart: Boolean(schedule.qualifying_trip_starts_at),
        hasExpectedUnlock: Boolean(schedule.available_at),
        unlockHoursBeforeStart: schedule.qualifying_trip_starts_at&&schedule.available_at
          ? (new Date(schedule.qualifying_trip_starts_at)-new Date(schedule.available_at))/3600000
          : null,
      },
      cancelledAfterActivation,
      refundedAfterRedemption,
      cancelledBeforeTripCompletion,
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.query('rollback');
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
