begin;

alter table public.discount_coupons drop constraint if exists discount_coupons_status_check;
alter table public.discount_coupons add constraint discount_coupons_status_check
  check(status in ('pending_trip_completion','active','reserved','redeemed','expired','void','frozen'));
alter table public.discount_coupons add column if not exists qualifying_order_id uuid references public.orders(id);
alter table public.discount_coupons add column if not exists activated_at timestamptz;

update public.discount_coupons
set status='pending_trip_completion',expires_at='infinity',activated_at=null
where recipient_kind='inviter' and status='active' and qualifying_order_id is null;

create or replace function public.apply_referral_registration(p_invitee uuid,p_raw_code text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.referral_program_settings%rowtype; inviter uuid; relation uuid; normalized text:=upper(trim(coalesce(p_raw_code,'')));
begin
  if normalized='' then return false; end if;
  select * into cfg from public.referral_program_settings where id=true;
  if not found or not cfg.active then return false; end if;
  select account_id into inviter from public.referral_codes where code=normalized;
  if inviter is null or inviter=p_invitee then return false; end if;
  if not exists(select 1 from public.profiles where id=inviter and role='passenger') then return false; end if;
  insert into public.referral_relationships(inviter_account_id,invitee_account_id,referral_code,discount_percent)
  values(inviter,p_invitee,normalized,cfg.discount_percent) on conflict(invitee_account_id) do nothing returning id into relation;
  if relation is null then return false; end if;
  -- 新游客首单券立即可用；直接推荐人的奖励必须等被推荐人实际完成首次有效行程。
  insert into public.discount_coupons(account_id,referral_relationship_id,recipient_kind,discount_percent,status,expires_at,activated_at)
  values(inviter,relation,'inviter',cfg.discount_percent,'pending_trip_completion','infinity',null),
        (p_invitee,relation,'invitee',cfg.discount_percent,'active',now()+make_interval(days=>cfg.validity_days),now());
  return true;
end$$;

create or replace function public.activate_completed_referral_rewards(p_vehicle_group uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.referral_program_settings%rowtype; changed integer;
begin
  if not (current_user in ('service_role','postgres') or public.is_operations() or public.is_group_staff(p_vehicle_group)) then
    raise exception 'assigned staff or operations only';
  end if;
  if not exists(select 1 from public.vehicle_group_journey_state where vehicle_group_id=p_vehicle_group and status='completed') then
    raise exception 'journey not completed';
  end if;
  select * into cfg from public.referral_program_settings where id=true;
  update public.discount_coupons c
     set status='active',qualifying_order_id=o.id,activated_at=now(),expires_at=now()+make_interval(days=>cfg.validity_days)
    from public.referral_relationships r
    join public.orders o on o.account_id=r.invitee_account_id and o.status in ('paid','confirmed')
    join public.vehicle_group_orders vgo on vgo.order_id=o.id and vgo.vehicle_group_id=p_vehicle_group
   where c.referral_relationship_id=r.id and c.recipient_kind='inviter' and c.status='pending_trip_completion'
     and exists(select 1 from public.passengers p join public.passenger_checkins pc on pc.passenger_id=p.id where p.order_id=o.id and pc.status='boarded');
  get diagnostics changed=row_count;
  return changed;
end$$;

create or replace function public.freeze_referral_reward_after_refund() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('refunded','cancelled') and old.status is distinct from new.status then
    update public.discount_coupons set status=case when status='redeemed' then 'frozen' else 'void' end
      where qualifying_order_id=new.id and recipient_kind='inviter' and status in ('active','reserved','redeemed');
  end if;
  return new;
end$$;
drop trigger if exists freeze_referral_reward_after_refund_trigger on public.orders;
create trigger freeze_referral_reward_after_refund_trigger after update of status on public.orders
for each row execute function public.freeze_referral_reward_after_refund();

create or replace function public.activate_referral_rewards_after_journey() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform public.activate_completed_referral_rewards(new.vehicle_group_id);
  end if;
  return new;
end$$;
drop trigger if exists activate_referral_rewards_after_journey_trigger on public.vehicle_group_journey_state;
create trigger activate_referral_rewards_after_journey_trigger after insert or update of status on public.vehicle_group_journey_state
for each row execute function public.activate_referral_rewards_after_journey();

create or replace function public.get_own_referral_summary() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare own_code text; cfg public.referral_program_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  own_code:=public.ensure_referral_code(auth.uid());
  select * into cfg from public.referral_program_settings where id=true;
  return jsonb_build_object('code',own_code,'active',cfg.active,'discountPercent',cfg.discount_percent,'validityDays',cfg.validity_days,
    'successfulInvites',(select count(*) from public.referral_relationships where inviter_account_id=auth.uid()),
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'discountPercent',discount_percent,'status',status,'expiresAt',expires_at,'recipientKind',recipient_kind,'activatedAt',activated_at) order by created_at desc) from public.discount_coupons where account_id=auth.uid()),'[]'::jsonb));
end$$;

revoke all on function public.activate_completed_referral_rewards(uuid),public.freeze_referral_reward_after_refund(),public.activate_referral_rewards_after_journey() from public,anon,authenticated;
grant execute on function public.activate_completed_referral_rewards(uuid) to service_role;

commit;
