begin;

-- A held seat expires after 15 minutes. The API cancels the matching Stripe
-- Test PaymentIntent first, then uses these service-only functions to return
-- the original draft to its formal pre-checkout state. This never revives a
-- stale hold or changes a paid/payment-review order.
alter table public.account_audit_events drop constraint if exists account_audit_events_action_check;
alter table public.account_audit_events add constraint account_audit_events_action_check check(action in (
 'profile_updated','draft_abandoned','draft_expired',
 'staff_application_approved','staff_application_rejected','staff_application_needs_information','staff_application_suspended','staff_access_revoked',
 'route_catalog_patched','product_draft_saved','product_published','product_created','product_archived','product_restored','product_copied',
 'commission_payout_approved','commission_payout_rejected','commission_payout_paid',
 'driver_resource_updated','fleet_vehicle_updated','payment_resumed','expired_payment_checkout_reset'
));

create or replace function public.get_expired_payment_recovery_context(p_account uuid,p_order uuid)
returns table(order_id uuid,amount integer,payment_intent_id text,draft_id uuid)
language sql stable security definer set search_path=public,pg_temp as $$
 select o.id,q.amount_due_jpy,o.payment_intent_id,bd.id
 from public.orders o
 join public.order_quotes q on q.id=o.quote_id and q.confirmed_order_id=o.id and q.account_id=o.account_id
 join public.inventory_locks h on h.order_id=o.id
 join public.booking_drafts bd on bd.converted_order_id=o.id and bd.account_id=o.account_id
 where o.id=p_order and o.account_id=p_account and o.status='pending_payment'
   and o.currency='JPY' and o.amount=q.amount_due_jpy and q.amount_due_jpy>0
   and o.seat_count=q.seat_count and o.departure_id=q.departure_id
   and h.status='held' and h.expires_at<=now();
$$;

create or replace function public.reset_expired_payment_checkout(p_account uuid,p_order uuid,p_intent text,p_draft uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_hold public.inventory_locks%rowtype;v_draft public.booking_drafts%rowtype;
begin
 if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
 select * into v_hold from public.inventory_locks where order_id=p_order for update;
 select * into v_order from public.orders where id=p_order and account_id=p_account for update;
 select * into v_draft from public.booking_drafts where id=p_draft and account_id=p_account for update;
 if v_order.id is null or v_hold.id is null or v_draft.id is null
    or v_draft.converted_order_id is distinct from p_order
    or v_order.payment_intent_id is distinct from p_intent
    or v_order.status not in ('pending_payment','expired','cancelled')
    or not ((v_hold.status='held' and v_hold.expires_at<=now()) or v_hold.status in ('expired','released'))
 then return false; end if;
 update public.inventory_locks set status='expired' where id=v_hold.id and status='held';
 update public.orders set status='expired',updated_at=now() where id=p_order and status in ('pending_payment','cancelled');
 update public.booking_drafts set status='payment_not_started',converted_order_id=null,converted_at=null,updated_at=now() where id=p_draft;
 insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
 values(p_account,'expired_payment_checkout_reset','order',p_order,jsonb_build_object('draftId',p_draft));
 return true;
end $$;

revoke all on function public.get_expired_payment_recovery_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_expired_payment_recovery_context(uuid,uuid) to service_role;
revoke all on function public.reset_expired_payment_checkout(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reset_expired_payment_checkout(uuid,uuid,text,uuid) to service_role;

commit;
