begin;

create table if not exists public.referral_program_settings(
  id boolean primary key default true check(id),
  active boolean not null default true,
  discount_percent integer not null default 10 check(discount_percent between 1 and 50),
  validity_days integer not null default 90 check(validity_days between 1 and 365),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.referral_program_settings(id) values(true) on conflict(id) do nothing;

create table if not exists public.referral_codes(
  account_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check(code ~ '^[A-Z0-9]{6,20}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.referral_relationships(
  id uuid primary key default gen_random_uuid(),
  inviter_account_id uuid not null references public.profiles(id),
  invitee_account_id uuid not null unique references public.profiles(id),
  referral_code text not null references public.referral_codes(code),
  discount_percent integer not null check(discount_percent between 1 and 50),
  created_at timestamptz not null default now(),
  check(inviter_account_id<>invitee_account_id)
);
create table if not exists public.discount_coupons(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  referral_relationship_id uuid not null references public.referral_relationships(id) on delete cascade,
  recipient_kind text not null check(recipient_kind in ('inviter','invitee')),
  discount_percent integer not null check(discount_percent between 1 and 50),
  status text not null default 'active' check(status in ('active','redeemed','expired','void')),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(referral_relationship_id,recipient_kind),
  unique(account_id,referral_relationship_id)
);

alter table public.referral_program_settings enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_relationships enable row level security;
alter table public.discount_coupons enable row level security;
create policy referral_settings_read on public.referral_program_settings for select to authenticated using(true);
create policy referral_codes_own_read on public.referral_codes for select to authenticated using(account_id=auth.uid() or public.is_operations());
create policy referral_relationships_own_read on public.referral_relationships for select to authenticated using(inviter_account_id=auth.uid() or invitee_account_id=auth.uid() or public.is_operations());
create policy discount_coupons_own_read on public.discount_coupons for select to authenticated using(account_id=auth.uid() or public.is_operations());
revoke all on public.referral_program_settings,public.referral_codes,public.referral_relationships,public.discount_coupons from public,anon,authenticated;
grant select on public.referral_program_settings,public.referral_codes,public.referral_relationships,public.discount_coupons to authenticated;
grant all on public.referral_program_settings,public.referral_codes,public.referral_relationships,public.discount_coupons to service_role;

create or replace function public.ensure_referral_code(p_account uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare result text;
begin
  select code into result from public.referral_codes where account_id=p_account;
  if result is null then
    result:='JT'||upper(substr(replace(p_account::text,'-',''),1,10));
    insert into public.referral_codes(account_id,code) values(p_account,result) on conflict(account_id) do update set code=excluded.code returning code into result;
  end if;
  return result;
end$$;

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
  insert into public.discount_coupons(account_id,referral_relationship_id,recipient_kind,discount_percent,expires_at)
  values(inviter,relation,'inviter',cfg.discount_percent,now()+make_interval(days=>cfg.validity_days)),
        (p_invitee,relation,'invitee',cfg.discount_percent,now()+make_interval(days=>cfg.validity_days));
  return true;
end$$;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare requested text:=coalesce(new.raw_user_meta_data->>'requested_account_type','passenger'); applicant text:=trim(coalesce(new.raw_user_meta_data->>'display_name','')); referral text:=coalesce(new.raw_user_meta_data->>'referral_code','');
begin
  insert into public.profiles(id,display_name,role) values(new.id,applicant,'passenger');
  if requested in ('driver','guide') then
    insert into public.staff_account_applications(account_id,requested_role,applicant_name) values(new.id,requested,applicant);
  else
    perform public.ensure_referral_code(new.id);
    perform public.apply_referral_registration(new.id,referral);
  end if;
  return new;
end$$;

create or replace function public.get_own_referral_summary() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare own_code text; cfg public.referral_program_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  own_code:=public.ensure_referral_code(auth.uid());
  select * into cfg from public.referral_program_settings where id=true;
  return jsonb_build_object('code',own_code,'active',cfg.active,'discountPercent',cfg.discount_percent,'validityDays',cfg.validity_days,
    'successfulInvites',(select count(*) from public.referral_relationships where inviter_account_id=auth.uid()),
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'discountPercent',discount_percent,'status',status,'expiresAt',expires_at,'recipientKind',recipient_kind) order by created_at desc) from public.discount_coupons where account_id=auth.uid()),'[]'::jsonb));
end$$;

create or replace function public.get_operations_referral_summary() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cfg public.referral_program_settings%rowtype;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  select * into cfg from public.referral_program_settings where id=true;
  return jsonb_build_object('active',cfg.active,'discountPercent',cfg.discount_percent,'validityDays',cfg.validity_days,
    'successfulInvites',(select count(*) from public.referral_relationships),'activeCoupons',(select count(*) from public.discount_coupons where status='active'));
end$$;
create or replace function public.operations_update_referral_settings(p_discount_percent integer,p_validity_days integer,p_active boolean) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_discount_percent not between 1 and 50 or p_validity_days not between 1 and 365 then raise exception 'invalid referral settings'; end if;
  update public.referral_program_settings set discount_percent=p_discount_percent,validity_days=p_validity_days,active=p_active,updated_by=auth.uid(),updated_at=now() where id=true;
  return true;
end$$;
revoke all on function public.ensure_referral_code(uuid),public.apply_referral_registration(uuid,text),public.get_own_referral_summary(),public.get_operations_referral_summary(),public.operations_update_referral_settings(integer,integer,boolean) from public,anon;
grant execute on function public.get_own_referral_summary(),public.get_operations_referral_summary(),public.operations_update_referral_settings(integer,integer,boolean) to authenticated;

commit;
