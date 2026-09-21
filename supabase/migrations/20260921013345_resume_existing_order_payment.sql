-- Resume never reserves inventory, creates an order, or reapplies a coupon.
-- Only the authenticated server may supply the verified account ID.
alter table public.account_audit_events drop constraint account_audit_events_action_check;
alter table public.account_audit_events add constraint account_audit_events_action_check check(action in (
 'profile_updated','draft_abandoned','draft_expired',
 'staff_application_approved','staff_application_rejected','staff_application_needs_information','staff_application_suspended','staff_access_revoked',
 'route_catalog_patched','product_draft_saved','product_published','product_created','product_archived','product_restored','product_copied',
 'commission_payout_approved','commission_payout_rejected','commission_payout_paid',
 'driver_resource_updated','fleet_vehicle_updated','payment_resumed'));
alter table public.account_audit_events drop constraint account_audit_events_target_type_check;
alter table public.account_audit_events add constraint account_audit_events_target_type_check
 check(target_type in ('account_profile','booking_draft','staff_application','account','trip','order'));
create or replace function public.get_payment_resume_context(p_account uuid,p_order uuid)
returns table(order_id uuid,amount integer,payment_intent_id text)
language sql stable security definer set search_path=public,pg_temp as $$
 select o.id,q.amount_due_jpy,o.payment_intent_id
 from public.orders o
 join public.order_quotes q on q.id=o.quote_id and q.confirmed_order_id=o.id and q.account_id=o.account_id
 join public.inventory_locks h on h.order_id=o.id
 where o.id=p_order and o.account_id=p_account and o.status='pending_payment'
   and o.currency='JPY' and o.amount=q.amount_due_jpy and q.amount_due_jpy>0
   and o.seat_count=q.seat_count and o.departure_id=q.departure_id
   and h.status='held' and h.expires_at>now();
$$;
revoke all on function public.get_payment_resume_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_payment_resume_context(uuid,uuid) to service_role;

create or replace function public.record_resumed_payment_intent(p_account uuid,p_order uuid,p_expected_intent text,p_intent text,p_amount integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;h public.inventory_locks%rowtype;v_amount integer;
begin
 -- Same lock order as payment callback: inventory, then order.
 select * into h from public.inventory_locks where order_id=p_order for update;
 select * into o from public.orders where id=p_order and account_id=p_account for update;
 if o.id is null or h.id is null or o.status<>'pending_payment'
   or h.status<>'held' or h.expires_at<=now() or p_intent is null or p_intent!~'^pi_[a-zA-Z0-9_]+$'
 then return false; end if;
 select c.amount into v_amount from public.get_payment_resume_context(p_account,p_order) c;
 if v_amount is null or p_amount is distinct from v_amount then return false; end if;
 -- Safe replay from concurrent requests; never replace a newer, different PI.
 if o.payment_intent_id=p_intent then return true; end if;
 if o.payment_intent_id is distinct from p_expected_intent then return false; end if;
 update public.orders set payment_intent_id=p_intent,updated_at=now() where id=p_order;
 insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
 values(p_account,'payment_resumed','order',p_order,jsonb_build_object('previousIntent',p_expected_intent,'intent',p_intent,'amount',v_amount));
 return true;
end $$;
revoke all on function public.record_resumed_payment_intent(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.record_resumed_payment_intent(uuid,uuid,text,text,integer) to service_role;

-- Old cancelled/failed PI callbacks must not cancel a replacement PI's order.
create or replace function public.apply_current_payment_intent_event(p_intent text,p_event_id text,p_order uuid,p_status public.payment_status,p_created timestamptz,p_digest text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_intent text;
begin
 perform 1 from public.inventory_locks where order_id=p_order for update;
 select payment_intent_id into v_intent from public.orders where id=p_order for update;
 if v_intent is distinct from p_intent then
   -- Unknown successful payments require reconciliation, never silently acknowledge.
   return p_status in ('cancelled','failed');
 end if;
 return public.apply_payment_event(p_event_id,p_order,p_status,p_created,p_digest);
end $$;
revoke all on function public.apply_current_payment_intent_event(text,text,uuid,public.payment_status,timestamptz,text) from public,anon,authenticated;
grant execute on function public.apply_current_payment_intent_event(text,text,uuid,public.payment_status,timestamptz,text) to service_role;
