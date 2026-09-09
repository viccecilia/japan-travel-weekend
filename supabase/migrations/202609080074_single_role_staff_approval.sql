begin;

create table if not exists public.staff_account_applications(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.profiles(id) on delete cascade,
  requested_role text not null check(requested_role in ('driver','guide')),
  status text not null default 'pending' check(status in ('pending','needs_information','approved','rejected','suspended')),
  applicant_name text not null default '' check(length(applicant_name)<=120),
  review_note text not null default '' check(length(review_note)<=500),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_account_applications enable row level security;
alter table public.account_audit_events drop constraint if exists account_audit_events_action_check;
alter table public.account_audit_events add constraint account_audit_events_action_check check(action in ('profile_updated','draft_abandoned','draft_expired','staff_application_approved','staff_application_rejected','staff_application_needs_information','staff_application_suspended'));
alter table public.account_audit_events drop constraint if exists account_audit_events_target_type_check;
alter table public.account_audit_events add constraint account_audit_events_target_type_check check(target_type in ('account_profile','booking_draft','staff_application'));
drop policy if exists staff_application_own_read on public.staff_account_applications;
create policy staff_application_own_read on public.staff_account_applications for select to authenticated
using(account_id=auth.uid() or public.is_operations());
revoke all on public.staff_account_applications from public,anon,authenticated;
grant select(id,account_id,requested_role,status,applicant_name,review_note,reviewed_at,created_at,updated_at) on public.staff_account_applications to authenticated;
grant all on public.staff_account_applications to service_role;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare requested text:=coalesce(new.raw_user_meta_data->>'requested_account_type','passenger'); applicant text:=trim(coalesce(new.raw_user_meta_data->>'display_name',''));
begin
  insert into public.profiles(id,display_name,role) values(new.id,applicant,'passenger');
  if requested in ('driver','guide') then
    insert into public.staff_account_applications(account_id,requested_role,applicant_name)
    values(new.id,requested,applicant);
  end if;
  return new;
end$$;

create or replace function public.get_own_access_destination()
returns table(destination text,account_role text,application_status text)
language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when p.role='operations' then 'operations'
    when p.role in ('driver','guide') then 'staff'
    when a.status in ('pending','needs_information') then 'staff_pending'
    when a.status in ('rejected','suspended') then 'staff_blocked'
    else 'passenger' end,
    p.role::text,
    a.status
  from public.profiles p left join public.staff_account_applications a on a.account_id=p.id
  where p.id=auth.uid();
$$;

create or replace function public.get_operations_staff_applications()
returns table(id uuid,account_id uuid,email text,applicant_name text,requested_role text,status text,review_note text,created_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select a.id,a.account_id,u.email,a.applicant_name,a.requested_role,a.status,a.review_note,a.created_at,a.updated_at
  from public.staff_account_applications a join auth.users u on u.id=a.account_id
  where public.is_operations()
  order by case a.status when 'pending' then 0 when 'needs_information' then 1 else 2 end,a.created_at;
$$;

create or replace function public.operations_review_staff_application(p_application uuid,p_decision text,p_note text default '')
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.staff_account_applications%rowtype;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_decision not in ('approved','rejected','needs_information','suspended') or length(trim(coalesce(p_note,'')))>500 then raise exception 'invalid review'; end if;
  select * into item from public.staff_account_applications where id=p_application for update;
  if not found then raise exception 'application not found'; end if;
  if p_decision='approved' then
    update public.profiles set role=item.requested_role::public.app_role,updated_at=now() where id=item.account_id and role='passenger';
    if not found then raise exception 'account already has another role'; end if;
    insert into public.driver_resources(account_id,display_name,languages,status,service_role)
    select item.account_id,coalesce(nullif(item.applicant_name,''),nullif(p.display_name,''),'工作人员'),'{}'::text[],'available',item.requested_role
    from public.profiles p where p.id=item.account_id
    on conflict(account_id) do update set display_name=excluded.display_name,status='available',service_role=excluded.service_role,updated_at=now();
  elsif p_decision in ('rejected','suspended') then
    update public.profiles set role='passenger',updated_at=now() where id=item.account_id and role in ('driver','guide');
    update public.driver_resources set status=case when p_decision='suspended' then 'suspended'::public.driver_resource_status else 'unavailable'::public.driver_resource_status end,updated_at=now() where account_id=item.account_id;
  end if;
  update public.staff_account_applications set status=p_decision,review_note=trim(coalesce(p_note,'')),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_application;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'staff_application_'||p_decision,'staff_application',p_application,jsonb_build_object('accountId',item.account_id,'requestedRole',item.requested_role));
  return true;
end$$;

revoke all on function public.get_own_access_destination(),public.get_operations_staff_applications(),public.operations_review_staff_application(uuid,text,text) from public,anon;
grant execute on function public.get_own_access_destination(),public.get_operations_staff_applications(),public.operations_review_staff_application(uuid,text,text) to authenticated;

commit;
