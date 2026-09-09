begin;

create table public.staff_leave_requests(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check(length(trim(reason)) between 2 and 300),
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  review_note text not null default '' check(length(review_note)<=500),
  reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(ends_at>starts_at)
);
create index staff_leave_account_time_idx on public.staff_leave_requests(account_id,starts_at,ends_at) where status in ('pending','approved');
alter table public.staff_leave_requests enable row level security;
create policy staff_leave_own_or_operations_read on public.staff_leave_requests for select to authenticated using(account_id=auth.uid() or public.is_operations());
revoke all on public.staff_leave_requests from public,anon,authenticated;
grant select(id,account_id,starts_at,ends_at,reason,status,review_note,reviewed_at,created_at,updated_at) on public.staff_leave_requests to authenticated;
grant all on public.staff_leave_requests to service_role;

create function public.submit_own_staff_leave(p_starts_at timestamptz,p_ends_at timestamptz,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare created uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role in ('driver','guide')) then raise exception 'staff only'; end if;
  if p_starts_at<now() or p_ends_at<=p_starts_at or length(trim(p_reason)) not between 2 and 300 then raise exception 'invalid leave request'; end if;
  if exists(select 1 from public.staff_leave_requests where account_id=auth.uid() and status in ('pending','approved') and starts_at<p_ends_at and ends_at>p_starts_at) then raise exception 'overlapping leave request'; end if;
  insert into public.staff_leave_requests(account_id,starts_at,ends_at,reason) values(auth.uid(),p_starts_at,p_ends_at,trim(p_reason)) returning id into created;
  return created;
end$$;

create function public.get_own_staff_leave_requests()
returns table(id uuid,starts_at timestamptz,ends_at timestamptz,reason text,status text,review_note text,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$select l.id,l.starts_at,l.ends_at,l.reason,l.status,l.review_note,l.created_at from public.staff_leave_requests l where l.account_id=auth.uid() order by l.starts_at desc limit 20$$;

create function public.cancel_own_staff_leave(p_request uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$begin update public.staff_leave_requests set status='cancelled',updated_at=now() where id=p_request and account_id=auth.uid() and status='pending';return found;end$$;

create function public.get_operations_staff_leave_requests()
returns table(id uuid,account_id uuid,email text,display_name text,starts_at timestamptz,ends_at timestamptz,reason text,status text,review_note text,reviewed_at timestamptz,conflicting_tasks bigint,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select l.id,l.account_id,u.email,p.display_name,l.starts_at,l.ends_at,l.reason,l.status,l.review_note,l.reviewed_at,
    (select count(*) from public.dispatch_tasks dt join public.driver_resources dr on dr.id=dt.driver_id where dr.account_id=l.account_id and dt.status in ('draft','confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress') and nullif(dt.payload->>'startsAt','')::timestamptz<l.ends_at and nullif(dt.payload->>'endsAt','')::timestamptz>l.starts_at),l.created_at
  from public.staff_leave_requests l join public.profiles p on p.id=l.account_id join auth.users u on u.id=l.account_id where public.is_operations() order by case l.status when 'pending' then 0 else 1 end,l.starts_at;
$$;

create function public.operations_review_staff_leave(p_request uuid,p_decision text,p_note text default '')
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if p_decision not in ('approved','rejected') or length(trim(coalesce(p_note,'')))>500 then raise exception 'invalid review'; end if;
  update public.staff_leave_requests set status=p_decision,review_note=trim(coalesce(p_note,'')),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_request and status='pending';
  return found;
end$$;

create function public.prevent_dispatch_during_approved_leave()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare staff_account uuid; task_start timestamptz; task_end timestamptz;
begin
  if new.status not in ('draft','confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress') then return new; end if;
  task_start:=nullif(new.payload->>'startsAt','')::timestamptz;
  task_end:=nullif(new.payload->>'endsAt','')::timestamptz;
  if task_start is null or task_end is null then return new; end if;
  select account_id into staff_account from public.driver_resources where id=new.driver_id;
  if staff_account is not null and exists(select 1 from public.staff_leave_requests where account_id=staff_account and status='approved' and starts_at<task_end and ends_at>task_start) then
    raise exception 'driver has approved leave during task';
  end if;
  return new;
end$$;
create trigger dispatch_respects_approved_leave before insert or update of driver_id,payload,status on public.dispatch_tasks for each row execute function public.prevent_dispatch_during_approved_leave();

revoke all on function public.submit_own_staff_leave(timestamptz,timestamptz,text),public.get_own_staff_leave_requests(),public.cancel_own_staff_leave(uuid),public.get_operations_staff_leave_requests(),public.operations_review_staff_leave(uuid,text,text) from public,anon;
grant execute on function public.submit_own_staff_leave(timestamptz,timestamptz,text),public.get_own_staff_leave_requests(),public.cancel_own_staff_leave(uuid),public.get_operations_staff_leave_requests(),public.operations_review_staff_leave(uuid,text,text) to authenticated;

commit;
