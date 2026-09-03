begin;
alter table public.booking_drafts add column if not exists converted_order_id uuid unique references public.orders(id);
alter table public.booking_drafts add column if not exists converted_at timestamptz;
create or replace function public.reserve_inventory_from_draft(p_draft uuid,p_account uuid,p_departure uuid,p_seats integer,p_key text,p_expires timestamptz)
returns table(order_id uuid,hold_id uuid) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_draft public.booking_drafts%rowtype;v_order uuid;v_hold uuid;v_existing public.orders%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_account is null or length(coalesce(p_key,''))<8 or p_expires<=now() then raise exception 'invalid draft checkout'; end if;
  select * into v_draft from public.booking_drafts where id=p_draft and account_id=p_account for update;
  if not found then raise exception 'draft not found'; end if;
  if v_draft.departure_id<>p_departure or v_draft.seat_impact<>p_seats then raise exception 'draft checkout parameter mismatch'; end if;
  if not v_draft.accepted_cancellation or not v_draft.accepted_terms or v_draft.expires_at<=now() then raise exception 'draft not eligible'; end if;
  if v_draft.operational_review_status='unavailable' then raise exception 'assistance unavailable'; end if;
  if v_draft.converted_order_id is not null then
    select * into v_existing from public.orders where id=v_draft.converted_order_id;
    select id into v_hold from public.inventory_locks where order_id=v_existing.id and idempotency_key=v_existing.idempotency_key;
    if v_existing.idempotency_key<>p_key or v_hold is null then raise exception 'draft conversion idempotency mismatch'; end if;
    return query select v_existing.id,v_hold;return;
  end if;
  if v_draft.status<>'payment_not_started' then raise exception 'draft not eligible'; end if;
  select r.order_id,r.hold_id into v_order,v_hold from public.reserve_inventory(v_draft.departure_id,p_account,v_draft.seat_impact,p_key,p_expires) r;
  if v_order is null or v_hold is null then raise exception 'inventory reservation failed'; end if;
  update public.booking_drafts set status='converted',converted_order_id=v_order,converted_at=now(),updated_at=now() where id=v_draft.id;
  return query select v_order,v_hold;
end$$;
revoke all on function public.reserve_inventory_from_draft(uuid,uuid,uuid,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_inventory_from_draft(uuid,uuid,uuid,integer,text,timestamptz) to service_role;

create or replace function public.cancel_pending_order(p_order uuid,p_account uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  update public.orders set status='cancelled',updated_at=now() where id=p_order and account_id=p_account and status='pending_payment';
  if not found then return false; end if;
  update public.inventory_locks set status='released' where order_id=p_order and status='held';
  update public.booking_drafts set status='payment_not_started',converted_order_id=null,converted_at=null,updated_at=now() where converted_order_id=p_order;
  return true;
end$$;
revoke all on function public.cancel_pending_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_pending_order(uuid,uuid) to service_role;
commit;
