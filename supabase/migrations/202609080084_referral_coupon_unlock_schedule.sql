begin;

alter table public.discount_coupons add column if not exists available_at timestamptz;
alter table public.discount_coupons add column if not exists qualifying_trip_starts_at timestamptz;

-- Bind the inviter reward to the invitee's first paid trip.  It remains unusable
-- until that exact trip has actually completed.
create or replace function public.schedule_referral_reward_after_payment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    update public.discount_coupons c
       set qualifying_order_id=new.id,
           qualifying_trip_starts_at=d.departs_at,
           available_at=d.ends_at
      from public.referral_relationships r,public.departures d
     where r.invitee_account_id=new.account_id
       and r.id=c.referral_relationship_id
       and d.id=new.departure_id
       and c.recipient_kind='inviter'
       and c.status='pending_trip_completion'
       and c.qualifying_order_id is null;
  end if;
  return new;
end$$;

drop trigger if exists schedule_referral_reward_after_payment_trigger on public.orders;
create trigger schedule_referral_reward_after_payment_trigger after update of status on public.orders
for each row execute function public.schedule_referral_reward_after_payment();

-- Populate an expected unlock time for already-paid test orders where possible.
with q as(
  select distinct on(r.id) r.id relation_id,o.id order_id,d.departs_at,d.ends_at
    from public.referral_relationships r
    join public.orders o on o.account_id=r.invitee_account_id and o.status in ('paid','confirmed')
    join public.departures d on d.id=o.departure_id
   order by r.id,d.departs_at,o.created_at
)
update public.discount_coupons c
   set qualifying_order_id=q.order_id,
       qualifying_trip_starts_at=q.departs_at,
       available_at=q.ends_at
  from q
 where q.relation_id=c.referral_relationship_id
   and c.recipient_kind='inviter' and c.status='pending_trip_completion' and c.qualifying_order_id is null;

create or replace function public.activate_completed_referral_rewards(p_vehicle_group uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.referral_program_settings%rowtype; changed integer;
begin
  if not (current_user in ('service_role','postgres') or public.is_operations() or public.is_group_staff(p_vehicle_group)) then
    raise exception 'assigned staff or operations only';
  end if;
  select * into cfg from public.referral_program_settings where id=true;
  update public.discount_coupons c
     set status='active',activated_at=now(),available_at=coalesce(c.available_at,now()),expires_at=now()+make_interval(days=>cfg.validity_days)
    from public.referral_relationships r
    join public.orders o on o.account_id=r.invitee_account_id and o.status in ('paid','confirmed')
    join public.departures d on d.id=o.departure_id
    join public.vehicle_group_orders vgo on vgo.order_id=o.id and vgo.vehicle_group_id=p_vehicle_group
    join public.vehicle_group_journey_state js on js.vehicle_group_id=vgo.vehicle_group_id and js.status='completed' and js.completed_at is not null
   where c.referral_relationship_id=r.id
     and c.recipient_kind='inviter'
     and c.status='pending_trip_completion'
     and c.qualifying_order_id=o.id
     and now()>=d.ends_at
     and exists(select 1 from public.passengers p join public.passenger_checkins pc on pc.passenger_id=p.id where p.order_id=o.id and pc.status='boarded');
  get diagnostics changed=row_count;
  return changed;
end$$;

create or replace function public.freeze_referral_reward_after_refund() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('refunded','cancelled') and old.status is distinct from new.status then
    update public.discount_coupons
       set status=case when status='redeemed' then 'frozen' else 'void' end
     where qualifying_order_id=new.id
       and recipient_kind='inviter'
       and status in ('pending_trip_completion','active','reserved','redeemed');
  end if;
  return new;
end$$;

create or replace function public.get_own_referral_summary() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare own_code text; cfg public.referral_program_settings%rowtype; completed_count integer; registered_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  own_code:=public.ensure_referral_code(auth.uid());
  select * into cfg from public.referral_program_settings where id=true;
  select count(*)::integer into registered_count from public.referral_relationships where inviter_account_id=auth.uid();
  select count(*)::integer into completed_count
    from public.discount_coupons c join public.referral_relationships r on r.id=c.referral_relationship_id
   where r.inviter_account_id=auth.uid() and c.recipient_kind='inviter'
     and c.qualifying_order_id is not null and c.status in ('active','reserved','redeemed');
  return jsonb_build_object(
    'code',own_code,'active',cfg.active,'discountPercent',cfg.discount_percent,'validityDays',cfg.validity_days,
    'successfulInvites',registered_count,'completedInvites',completed_count,'pendingInvites',greatest(registered_count-completed_count,0),
    'achievementKey',case when completed_count>=100 then 'gold_ambassador' when completed_count>=10 then 'ambassador_candidate' when completed_count>=3 then 'rising_promoter' when completed_count>=1 then 'travel_sharer' else 'travel_explorer' end,
    'nextMilestone',case when completed_count<1 then 1 when completed_count<3 then 3 when completed_count<10 then 10 when completed_count<100 then 100 else null end,
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'discountPercent',discount_percent,'status',status,'expiresAt',expires_at,'recipientKind',recipient_kind,'activatedAt',activated_at,'availableAt',available_at,'qualifyingTripStartsAt',qualifying_trip_starts_at) order by created_at desc) from public.discount_coupons where account_id=auth.uid()),'[]'::jsonb)
  );
end$$;

revoke all on function public.schedule_referral_reward_after_payment(),public.activate_completed_referral_rewards(uuid),public.freeze_referral_reward_after_refund() from public,anon,authenticated;

commit;
