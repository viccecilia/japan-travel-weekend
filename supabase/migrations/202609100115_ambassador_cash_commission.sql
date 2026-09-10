begin;

create table if not exists public.commission_rule_versions(
 id text primary key,commission_percent integer not null check(commission_percent between 1 and 100),
 effective_from timestamptz not null,effective_until timestamptz,created_by uuid references public.profiles(id),created_at timestamptz not null default now(),
 check(effective_until is null or effective_until>effective_from)
);
insert into public.commission_rule_versions(id,commission_percent,effective_from) values('cash-10-v1',10,'2026-09-10 00:00:00+09') on conflict(id) do nothing;

create table if not exists public.cash_commission_entries(
 id uuid primary key default gen_random_uuid(),beneficiary_account_id uuid not null references public.profiles(id),
 referral_relationship_id uuid not null references public.referral_relationships(id),source_order_id uuid not null references public.orders(id),
 rule_version text not null references public.commission_rule_versions(id),basis_amount_jpy integer not null check(basis_amount_jpy>=0),
 commission_percent integer not null check(commission_percent between 1 and 100),amount_jpy integer not null check(amount_jpy>=0),
 status text not null default 'available' check(status in('available','locked','paid','reversed')),
 unlocked_at timestamptz not null,completed_vehicle_group_id uuid not null references public.vehicle_groups(id),
 payout_request_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(referral_relationship_id),unique(source_order_id)
);
create table if not exists public.commission_payout_requests(
 id uuid primary key default gen_random_uuid(),account_id uuid not null references public.profiles(id),week_start date not null,
 amount_jpy integer not null check(amount_jpy>0),status text not null default 'pending' check(status in('pending','approved','processing','paid','failed','cancelled')),
 idempotency_key text not null,reviewed_by uuid references public.profiles(id),review_note text,provider_reference text,
 requested_at timestamptz not null default now(),reviewed_at timestamptz,paid_at timestamptz,updated_at timestamptz not null default now(),
 unique(account_id,week_start),unique(account_id,idempotency_key)
);
alter table public.cash_commission_entries add constraint cash_commission_payout_fk foreign key(payout_request_id) references public.commission_payout_requests(id) on delete restrict;

alter table public.cash_commission_entries enable row level security;alter table public.commission_payout_requests enable row level security;alter table public.commission_rule_versions enable row level security;
revoke all on public.cash_commission_entries,public.commission_payout_requests,public.commission_rule_versions from public,anon,authenticated;
grant select on public.cash_commission_entries,public.commission_payout_requests,public.commission_rule_versions to authenticated;
grant all on public.cash_commission_entries,public.commission_payout_requests,public.commission_rule_versions to service_role;
create policy commission_entries_owner_ops on public.cash_commission_entries for select to authenticated using(beneficiary_account_id=auth.uid() or public.is_operations());
create policy commission_payout_owner_ops on public.commission_payout_requests for select to authenticated using(account_id=auth.uid() or public.is_operations());
create policy commission_rules_read on public.commission_rule_versions for select to authenticated using(true);

create or replace function public.settle_cash_commissions_for_completed_group(p_vehicle_group uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer:=0;v_rows integer;v_order record;v_rule public.commission_rule_versions%rowtype;v_eligible boolean;
begin
 if current_user not in('service_role','postgres') then raise exception 'trusted service only';end if;
 select * into v_rule from public.commission_rule_versions where effective_from<=now() and(effective_until is null or effective_until>now()) order by effective_from desc limit 1;
 if not found then return 0;end if;
 for v_order in
  select o.id,o.account_id,o.amount,o.created_at,r.id relation_id,r.inviter_account_id
  from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id join public.referral_relationships r on r.invitee_account_id=o.account_id
  where vgo.vehicle_group_id=p_vehicle_group and o.status in('paid','confirmed')
 loop
  if exists(select 1 from public.cash_commission_entries c where c.referral_relationship_id=v_order.relation_id) then continue;end if;
  if exists(select 1 from public.orders earlier join public.vehicle_group_orders evgo on evgo.order_id=earlier.id join public.vehicle_group_journey_state ejs on ejs.vehicle_group_id=evgo.vehicle_group_id and ejs.status='completed' where earlier.account_id=v_order.account_id and earlier.status in('paid','confirmed') and earlier.created_at<v_order.created_at) then continue;end if;
  select p.role in('driver','guide') or (select count(*)>=10 from public.discount_coupons c join public.referral_relationships rr on rr.id=c.referral_relationship_id where rr.inviter_account_id=v_order.inviter_account_id and c.recipient_kind='inviter' and c.qualifying_order_id is not null and c.status in('active','reserved','redeemed')) into v_eligible from public.profiles p where p.id=v_order.inviter_account_id;
  if not coalesce(v_eligible,false) then continue;end if;
  insert into public.cash_commission_entries(beneficiary_account_id,referral_relationship_id,source_order_id,rule_version,basis_amount_jpy,commission_percent,amount_jpy,unlocked_at,completed_vehicle_group_id)
  values(v_order.inviter_account_id,v_order.relation_id,v_order.id,v_rule.id,coalesce(v_order.amount,0),v_rule.commission_percent,floor(coalesce(v_order.amount,0)*v_rule.commission_percent/100.0)::integer,now(),p_vehicle_group) on conflict do nothing;
  get diagnostics v_rows=row_count;v_count:=v_count+v_rows;
 end loop;return v_count;
end$$;

create or replace function public.settle_cash_commission_after_journey() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin if new.status='completed' and old.status is distinct from new.status then perform public.settle_cash_commissions_for_completed_group(new.vehicle_group_id);end if;return new;end$$;
drop trigger if exists settle_cash_commission_after_journey_trigger on public.vehicle_group_journey_state;
create trigger settle_cash_commission_after_journey_trigger after update of status on public.vehicle_group_journey_state for each row execute function public.settle_cash_commission_after_journey();

create or replace function public.reverse_cash_commission_after_refund() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status in('cancelled','refunded') and old.status is distinct from new.status then
  if exists(select 1 from public.cash_commission_entries where source_order_id=new.id and status in('locked','paid')) then raise exception 'commission already included in payout; manual audited recovery required';end if;
  update public.cash_commission_entries set status='reversed',updated_at=now() where source_order_id=new.id and status='available';
 end if;return new;
end$$;
drop trigger if exists reverse_cash_commission_after_refund_trigger on public.orders;
create trigger reverse_cash_commission_after_refund_trigger before update of status on public.orders for each row execute function public.reverse_cash_commission_after_refund();

create or replace function public.request_own_commission_payout(p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_week date:=((date_trunc('week',now() at time zone 'Asia/Tokyo'))::date);v_request uuid;v_amount integer;
begin
 if auth.uid() is null or length(trim(coalesce(p_idempotency_key,'')))<8 then raise exception 'invalid payout request';end if;
 select id into v_request from public.commission_payout_requests where account_id=auth.uid() and idempotency_key=p_idempotency_key;
 if found then return(select jsonb_build_object('id',id,'status',status,'amountJpy',amount_jpy,'weekStart',week_start) from public.commission_payout_requests where id=v_request);end if;
 if exists(select 1 from public.commission_payout_requests where account_id=auth.uid() and week_start=v_week) then raise exception 'one payout request per week';end if;
 perform 1 from public.cash_commission_entries where beneficiary_account_id=auth.uid() and status='available' for update;
 select coalesce(sum(amount_jpy),0)::integer into v_amount from public.cash_commission_entries where beneficiary_account_id=auth.uid() and status='available';
 if v_amount<=0 then raise exception 'no available commission';end if;
 insert into public.commission_payout_requests(account_id,week_start,amount_jpy,idempotency_key) values(auth.uid(),v_week,v_amount,p_idempotency_key) returning id into v_request;
 update public.cash_commission_entries set status='locked',payout_request_id=v_request,updated_at=now() where beneficiary_account_id=auth.uid() and status='available';
 return jsonb_build_object('id',v_request,'status','pending','amountJpy',v_amount,'weekStart',v_week);
end$$;

create or replace function public.operations_review_commission_payout(p_request uuid,p_action text,p_note text,p_provider_reference text default null)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.commission_payout_requests%rowtype;v_target text;
begin
 if not public.is_operations() then raise exception 'operations role required';end if;
 select * into v from public.commission_payout_requests where id=p_request for update;if not found then raise exception 'request not found';end if;
 if p_action='approve' and v.status='pending' then v_target:='approved';elsif p_action='mark_processing' and v.status='approved' then v_target:='processing';elsif p_action='mark_paid' and v.status in('approved','processing') and length(trim(coalesce(p_provider_reference,'')))>=3 then v_target:='paid';elsif p_action='fail' and v.status in('approved','processing') then v_target:='failed';elsif p_action='retry' and v.status='failed' then v_target:='approved';elsif p_action='cancel' and v.status in('pending','failed') then v_target:='cancelled';else raise exception 'invalid payout transition';end if;
 update public.commission_payout_requests set status=v_target,reviewed_by=auth.uid(),review_note=trim(coalesce(p_note,'')),provider_reference=coalesce(nullif(trim(coalesce(p_provider_reference,'')),''),provider_reference),reviewed_at=now(),paid_at=case when v_target='paid' then now() else paid_at end,updated_at=now() where id=v.id;
 if v_target='paid' then update public.cash_commission_entries set status='paid',updated_at=now() where payout_request_id=v.id and status='locked';elsif v_target='cancelled' then update public.cash_commission_entries set status='available',payout_request_id=null,updated_at=now() where payout_request_id=v.id and status='locked';end if;
 insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'commission_payout_'||v_target,'commission_payout',v.id,jsonb_build_object('priorStatus',v.status,'amountJpy',v.amount_jpy,'providerReference',p_provider_reference));
 return v_target;
end$$;

create or replace function public.get_own_cash_commission_summary() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('availableJpy',coalesce(sum(amount_jpy)filter(where status='available'),0),'lockedJpy',coalesce(sum(amount_jpy)filter(where status='locked'),0),'paidJpy',coalesce(sum(amount_jpy)filter(where status='paid'),0),'entries',coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceOrderId',source_order_id,'basisAmountJpy',basis_amount_jpy,'commissionPercent',commission_percent,'amountJpy',amount_jpy,'status',status,'unlockedAt',unlocked_at) order by created_at desc),'[]'::jsonb),'payouts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'weekStart',week_start,'amountJpy',amount_jpy,'status',status,'requestedAt',requested_at) order by requested_at desc) from public.commission_payout_requests where account_id=auth.uid()),'[]'::jsonb)) from public.cash_commission_entries where beneficiary_account_id=auth.uid()
$$;

revoke all on function public.settle_cash_commissions_for_completed_group(uuid),public.settle_cash_commission_after_journey(),public.reverse_cash_commission_after_refund(),public.request_own_commission_payout(text),public.operations_review_commission_payout(uuid,text,text,text),public.get_own_cash_commission_summary() from public,anon;
grant execute on function public.settle_cash_commissions_for_completed_group(uuid) to service_role;
grant execute on function public.request_own_commission_payout(text),public.get_own_cash_commission_summary() to authenticated;
grant execute on function public.operations_review_commission_payout(uuid,text,text,text) to authenticated,service_role;
commit;
