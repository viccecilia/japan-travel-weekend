alter table public.departures add column if not exists seat_price_jpy integer check(seat_price_jpy is null or seat_price_jpy>0);

create or replace function public.record_stripe_payment_intent(p_order uuid,p_payment_intent text,p_amount integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_payment_intent!~'^pi_' or p_amount<=0 then raise exception 'invalid payment intent'; end if;
  update public.orders set payment_intent_id=p_payment_intent,amount=p_amount,updated_at=now()
    where id=p_order and status='pending_payment' and payment_intent_id is null;
  return found;
end$$;

revoke all on function public.record_stripe_payment_intent(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.record_stripe_payment_intent(uuid,text,integer) to service_role;
