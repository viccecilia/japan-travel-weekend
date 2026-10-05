begin;

-- The lifecycle sweep may expire the hold and order before the passenger
-- retries. Preserve the same strict ownership/quote/draft checks while
-- allowing that formal expired state into the Stripe-status recovery path.
create or replace function public.get_expired_payment_recovery_context(p_account uuid,p_order uuid)
returns table(order_id uuid,amount integer,payment_intent_id text,draft_id uuid)
language sql stable security definer set search_path=public,pg_temp as $$
 select o.id,q.amount_due_jpy,o.payment_intent_id,bd.id
 from public.orders o
 join public.order_quotes q on q.id=o.quote_id and q.confirmed_order_id=o.id and q.account_id=o.account_id
 join public.inventory_locks h on h.order_id=o.id
 join public.booking_drafts bd on bd.converted_order_id=o.id and bd.account_id=o.account_id
 where o.id=p_order and o.account_id=p_account
   and o.payment_intent_id is not null
   and o.currency='JPY' and o.amount=q.amount_due_jpy and q.amount_due_jpy>0
   and o.seat_count=q.seat_count and o.departure_id=q.departure_id
   and (
     (o.status='pending_payment' and h.status='held' and h.expires_at<=now())
     or (o.status='expired' and h.status in ('expired','released'))
   );
$$;

revoke all on function public.get_expired_payment_recovery_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_expired_payment_recovery_context(uuid,uuid) to service_role;

commit;
