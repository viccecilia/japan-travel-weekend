begin;

-- V7: explicit, auditable ambassador eligibility. Approved staff are enrolled
-- automatically; passengers require an operations approval.
create table if not exists public.ambassador_qualifications(
 account_id uuid primary key references public.profiles(id) on delete cascade,
 status text not null check(status in('pending','approved','rejected','suspended')),
 source text not null check(source in('staff_approval','passenger_application','operations')),
 applied_at timestamptz not null default now(),approved_at timestamptz,
 reviewed_by uuid references public.profiles(id),review_note text,
 updated_at timestamptz not null default now()
);
alter table public.ambassador_qualifications enable row level security;
revoke all on public.ambassador_qualifications from public,anon,authenticated;
grant select on public.ambassador_qualifications to authenticated;
grant all on public.ambassador_qualifications to service_role;
create policy ambassador_qualification_owner_ops on public.ambassador_qualifications for select to authenticated
 using(account_id=auth.uid() or public.is_operations());

insert into public.ambassador_qualifications(account_id,status,source,approved_at)
select a.account_id,'approved','staff_approval',coalesce(a.reviewed_at,a.updated_at,now())
from public.staff_account_applications a where a.status='approved'
on conflict(account_id) do update set status='approved',source='staff_approval',approved_at=coalesce(public.ambassador_qualifications.approved_at,excluded.approved_at),updated_at=now();

alter table public.cash_commission_entries drop constraint if exists cash_commission_entries_status_check;
alter table public.cash_commission_entries add constraint cash_commission_entries_status_check
 check(status in('pending','available','locked','paid','reversed','recovery_due'));
alter table public.cash_commission_entries alter column unlocked_at drop not null;
alter table public.cash_commission_entries alter column completed_vehicle_group_id drop not null;
alter table public.cash_commission_entries add column if not exists adjustment_reason text;
alter table public.cash_commission_entries add column if not exists original_amount_jpy integer;

alter table public.cash_commission_entries drop constraint if exists cash_commission_entries_referral_relationship_id_key;
create unique index if not exists cash_commission_one_open_referral
 on public.cash_commission_entries(referral_relationship_id)
 where status in('pending','available','locked','paid','recovery_due');

create or replace function public.commission_basis_for_order(p_order uuid) returns integer
language sql stable security definer set search_path=public,pg_temp as $$
 select greatest(0,coalesce((
   select sum((item->>'amountJpy')::integer)
   from public.order_snapshots s cross join lateral jsonb_array_elements(coalesce(s.line_items,'[]'::jsonb)) item
   where s.order_id=p_order and item->>'kind' in('base_fare','coupon')
 ),(select greatest(coalesce(o.gross_amount,o.amount,0)-coalesce(o.discount_amount,0),0) from public.orders o where o.id=p_order))
 -least(coalesce((select refunded_amount_jpy from public.orders where id=p_order),0),coalesce((
   select sum((item->>'amountJpy')::integer)
   from public.order_snapshots s cross join lateral jsonb_array_elements(coalesce(s.line_items,'[]'::jsonb)) item
   where s.order_id=p_order and item->>'kind' in('base_fare','coupon')
 ),(select greatest(coalesce(o.gross_amount,o.amount,0)-coalesce(o.discount_amount,0),0) from public.orders o where o.id=p_order))))::integer
$$;

create or replace function public.ensure_pending_cash_commission(p_order uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders%rowtype;r public.referral_relationships%rowtype;q public.ambassador_qualifications%rowtype;v_rule public.commission_rule_versions%rowtype;v_basis integer;v_id uuid;
begin
 if current_user not in('service_role','postgres') then raise exception 'trusted service only';end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.status not in('paid','confirmed') then return null;end if;
 select * into r from public.referral_relationships where invitee_account_id=o.account_id;
 if not found then return null;end if;
 select * into q from public.ambassador_qualifications where account_id=r.inviter_account_id and status='approved';
 if not found then return null;end if;
 if exists(select 1 from public.cash_commission_entries where referral_relationship_id=r.id and status in('pending','available','locked','paid','recovery_due')) then return null;end if;
 select * into v_rule from public.commission_rule_versions where effective_from<=o.created_at and(effective_until is null or effective_until>o.created_at) order by effective_from desc limit 1;
 if not found then return null;end if;
 v_basis:=public.commission_basis_for_order(o.id);
 insert into public.cash_commission_entries(beneficiary_account_id,referral_relationship_id,source_order_id,rule_version,basis_amount_jpy,commission_percent,amount_jpy,status,unlocked_at,completed_vehicle_group_id)
 values(r.inviter_account_id,r.id,o.id,v_rule.id,v_basis,v_rule.commission_percent,floor(v_basis*v_rule.commission_percent/100.0)::integer,'pending',null,null)
 returning id into v_id;return v_id;
end$$;

create or replace function public.create_pending_commission_after_payment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.status in('paid','confirmed') and old.status is distinct from new.status then perform public.ensure_pending_cash_commission(new.id);end if;return new;
end$$;
drop trigger if exists create_pending_commission_after_payment_trigger on public.orders;
create trigger create_pending_commission_after_payment_trigger after update of status on public.orders for each row execute function public.create_pending_commission_after_payment();

create or replace function public.settle_cash_commissions_for_completed_group(p_vehicle_group uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
 if current_user not in('service_role','postgres') then raise exception 'trusted service only';end if;
 update public.cash_commission_entries c set status='available',basis_amount_jpy=public.commission_basis_for_order(c.source_order_id),amount_jpy=floor(public.commission_basis_for_order(c.source_order_id)*c.commission_percent/100.0)::integer,unlocked_at=now(),completed_vehicle_group_id=p_vehicle_group,updated_at=now()
 from public.vehicle_group_orders vgo
 where vgo.vehicle_group_id=p_vehicle_group and vgo.order_id=c.source_order_id and c.status='pending'
   and public.commission_basis_for_order(c.source_order_id)>0
   and exists(select 1 from public.ambassador_qualifications q where q.account_id=c.beneficiary_account_id and q.status='approved');
 get diagnostics v_count=row_count;return v_count;
end$$;

-- Refund completion is never blocked by commission recovery. Unpaid commission
-- is reversed; locked/paid commission becomes an explicit recovery item.
create or replace function public.reverse_cash_commission_after_refund() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_new_basis integer;v_new_amount integer;
begin
 if new.refunded_amount_jpy is distinct from old.refunded_amount_jpy or new.status in('cancelled','refunded') and old.status is distinct from new.status then
  v_new_basis:=public.commission_basis_for_order(new.id);
  update public.cash_commission_entries set original_amount_jpy=coalesce(original_amount_jpy,amount_jpy),basis_amount_jpy=v_new_basis,
   amount_jpy=floor(v_new_basis*commission_percent/100.0)::integer,
   status=case when status in('pending','available') and v_new_basis=0 then 'reversed' when status in('locked','paid') then 'recovery_due' else status end,
   adjustment_reason='order_refund',updated_at=now() where source_order_id=new.id and status<>'reversed';
 end if;return new;
end$$;
drop trigger if exists reverse_cash_commission_after_refund_trigger on public.orders;
create trigger reverse_cash_commission_after_refund_trigger after update of status,refunded_amount_jpy on public.orders for each row execute function public.reverse_cash_commission_after_refund();

-- Refund provider callbacks report the amount of one refund. Recompute the
-- order total from completed operations so multiple refund IDs accumulate.
create or replace function public.recompute_order_refund_total() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_total integer;v_amount integer;
begin
 if new.status='completed' and(old.status is distinct from new.status or old.actual_refund_amount is distinct from new.actual_refund_amount) then
  select coalesce(sum(actual_refund_amount),0) into v_total from public.refund_operations where order_id=new.order_id and status='completed';
  select coalesce(amount,0) into v_amount from public.orders where id=new.order_id for update;
  update public.orders set refunded_amount_jpy=v_total,status=case when v_total>=v_amount then 'refunded'::public.order_status else status end,updated_at=now() where id=new.order_id;
 end if;return new;
end$$;
drop trigger if exists recompute_order_refund_total_trigger on public.refund_operations;
create trigger recompute_order_refund_total_trigger after update of status,actual_refund_amount on public.refund_operations for each row execute function public.recompute_order_refund_total();

-- Own the customer notification at the order-level transition and suppress
-- duplicate inserts from legacy provider/manual completion functions.
create or replace function public.suppress_duplicate_refund_notification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.event_type='refund-completed' and exists(select 1 from public.notification_outbox n where n.event_type='refund-completed' and n.order_id=new.order_id) then return null;end if;return new;
end$$;
drop trigger if exists suppress_duplicate_refund_notification_trigger on public.notification_outbox;
create trigger suppress_duplicate_refund_notification_trigger before insert on public.notification_outbox for each row execute function public.suppress_duplicate_refund_notification();

-- New referrals no longer award an inviter coupon. Existing coupons and their
-- audit history are deliberately retained.
create or replace function public.apply_referral_registration(p_invitee uuid,p_raw_code text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.referral_program_settings%rowtype;inviter uuid;relation uuid;normalized text:=upper(trim(coalesce(p_raw_code,'')));
begin
 if normalized='' then return false;end if;select * into cfg from public.referral_program_settings where id=true;if not found or not cfg.active then return false;end if;
 select account_id into inviter from public.referral_codes where code=normalized;if inviter is null or inviter=p_invitee then return false;end if;
 insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent) values(inviter,p_invitee,normalized,cfg.discount_percent) on conflict(invitee_account_id) do nothing returning id into relation;
 if relation is null then return false;end if;
 insert into public.discount_coupons(account_id,referral_relationship_id,recipient_kind,discount_percent,status,expires_at,activated_at,source_type,rules_version)
 values(p_invitee,relation,'invitee',cfg.discount_percent,'active',now()+make_interval(days=>cfg.validity_days),now(),'referral','cash-referral-v2');return true;
end$$;

revoke all on function public.commission_basis_for_order(uuid),public.ensure_pending_cash_commission(uuid),public.create_pending_commission_after_payment(),public.recompute_order_refund_total(),public.suppress_duplicate_refund_notification() from public,anon,authenticated;
grant execute on function public.commission_basis_for_order(uuid),public.ensure_pending_cash_commission(uuid),public.settle_cash_commissions_for_completed_group(uuid) to service_role;

commit;
