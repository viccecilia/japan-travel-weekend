begin;

create table if not exists public.account_private_profiles (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null default '',
  preferred_language text not null default 'zh-CN' check(preferred_language in ('zh-CN')),
  phone text not null default '',
  emergency_name text not null default '',
  emergency_phone text not null default '',
  accepted_terms_at timestamptz,
  accepted_privacy_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check(action in ('profile_updated','draft_abandoned','draft_expired')),
  target_type text not null check(target_type in ('account_profile','booking_draft')),
  target_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check(not (metadata ?| array['phone','emergency_phone','password','token','private_notes','health']))
);

alter table public.booking_drafts add column if not exists expires_at timestamptz;
alter table public.booking_drafts add column if not exists abandoned_at timestamptz;
update public.booking_drafts set expires_at=created_at+interval '30 days' where expires_at is null;
alter table public.booking_drafts alter column expires_at set default (now()+interval '30 days');
alter table public.booking_drafts alter column expires_at set not null;

alter table public.account_private_profiles enable row level security;
alter table public.account_audit_events enable row level security;
revoke all on public.account_private_profiles,public.account_audit_events from public,anon,authenticated;
grant select on public.account_private_profiles,public.account_audit_events to authenticated;
grant all on public.account_private_profiles,public.account_audit_events to service_role;

drop policy if exists account_private_profiles_owner_read on public.account_private_profiles;
create policy account_private_profiles_owner_read on public.account_private_profiles
for select to authenticated using(account_id=auth.uid());
drop policy if exists account_audit_owner_read on public.account_audit_events;
create policy account_audit_owner_read on public.account_audit_events
for select to authenticated using(actor_id=auth.uid());

create or replace function public.get_own_account_profile()
returns table(account_id uuid,display_name text,preferred_language text,phone text,emergency_name text,emergency_phone text,accepted_terms_at timestamptz,accepted_privacy_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path=public,pg_temp
as $$ select ap.account_id,ap.display_name,ap.preferred_language,ap.phone,ap.emergency_name,ap.emergency_phone,ap.accepted_terms_at,ap.accepted_privacy_at,ap.updated_at from public.account_private_profiles ap where ap.account_id=auth.uid(); $$;

create or replace function public.update_own_account_profile(p_display_name text,p_phone text,p_emergency_name text,p_emergency_phone text,p_accept_terms boolean,p_accept_privacy boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account uuid:=auth.uid();
begin
  if v_account is null then raise exception 'authentication required'; end if;
  if length(trim(coalesce(p_display_name,''))) not between 1 and 80 or length(trim(coalesce(p_phone,''))) not between 5 and 40 or length(trim(coalesce(p_emergency_name,''))) not between 1 and 80 or length(trim(coalesce(p_emergency_phone,''))) not between 5 and 40 then raise exception 'profile input invalid'; end if;
  if not coalesce(p_accept_terms,false) or not coalesce(p_accept_privacy,false) then raise exception 'consent required'; end if;
  insert into public.account_private_profiles(account_id,display_name,phone,emergency_name,emergency_phone,accepted_terms_at,accepted_privacy_at)
  values(v_account,trim(p_display_name),trim(p_phone),trim(p_emergency_name),trim(p_emergency_phone),now(),now())
  on conflict(account_id) do update set display_name=excluded.display_name,phone=excluded.phone,emergency_name=excluded.emergency_name,emergency_phone=excluded.emergency_phone,accepted_terms_at=coalesce(public.account_private_profiles.accepted_terms_at,excluded.accepted_terms_at),accepted_privacy_at=coalesce(public.account_private_profiles.accepted_privacy_at,excluded.accepted_privacy_at),updated_at=now();
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata) values(v_account,'profile_updated','account_profile',v_account,jsonb_build_object('fields',array['display_name','phone','emergency_contact'],'consentRecorded',true));
end $$;

create or replace function public.expire_own_booking_drafts(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account uuid:=auth.uid(); v_count integer;
begin
  if v_account is null then raise exception 'authentication required'; end if;
  with changed as (update public.booking_drafts bd set status='expired',updated_at=p_now where bd.account_id=v_account and bd.status in ('payment_not_started','pending_manual_review') and bd.expires_at<=p_now returning bd.id)
  insert into public.account_audit_events(actor_id,action,target_type,target_id) select v_account,'draft_expired','booking_draft',c.id from changed c;
  get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.abandon_own_booking_draft(p_draft uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account uuid:=auth.uid(); v_changed uuid;
begin
  if v_account is null then raise exception 'authentication required'; end if;
  update public.booking_drafts bd set status='cancelled',abandoned_at=now(),updated_at=now() where bd.id=p_draft and bd.account_id=v_account and bd.status in ('payment_not_started','pending_manual_review') returning bd.id into v_changed;
  if v_changed is null then return false; end if;
  insert into public.account_audit_events(actor_id,action,target_type,target_id) values(v_account,'draft_abandoned','booking_draft',v_changed); return true;
end $$;

revoke all on function public.get_own_account_profile(),public.update_own_account_profile(text,text,text,text,boolean,boolean),public.expire_own_booking_drafts(timestamptz),public.abandon_own_booking_draft(uuid) from public;
grant execute on function public.get_own_account_profile(),public.update_own_account_profile(text,text,text,text,boolean,boolean),public.expire_own_booking_drafts(timestamptz),public.abandon_own_booking_draft(uuid) to authenticated,service_role;

commit;
