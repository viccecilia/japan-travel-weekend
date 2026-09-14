begin;

-- V12-DEMO: a trip room opens exactly 24 hours before the real departure.
-- Booking cutoff remains an independent lifecycle value.
update public.departures
set chat_opens_at=departs_at-interval '24 hours',updated_at=now()
where departs_at is not null
  and departs_at>=now()
  and status in ('draft','open','closed')
  and chat_opens_at is distinct from departs_at-interval '24 hours';

create or replace function public.set_departure_lifecycle_defaults()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.departs_at is not null then
    if new.booking_closes_at is null or (
      tg_op='UPDATE'
      and new.departs_at is distinct from old.departs_at
      and new.booking_closes_at=old.booking_closes_at
    ) then
      new.booking_closes_at:=new.departs_at-interval '24 hours';
    end if;

    -- This is intentionally not configurable: changing the service time creates
    -- a new room-opening boundary based on the new departure version.
    new.chat_opens_at:=new.departs_at-interval '24 hours';
  end if;
  return new;
end
$$;

create or replace function public.sync_departure_room_opening()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.departs_at is null or new.status='cancelled' then
    return new;
  end if;

  update public.trip_rooms tr
  set opens_at=new.chat_opens_at,
      status=case
        when tr.status='closed' then 'closed'
        when new.chat_opens_at<=now() then 'open'
        else 'frozen'
      end
  where tr.vehicle_group_id in (
    select vg.id from public.vehicle_groups vg where vg.departure_id=new.id
  );

  return new;
end
$$;

drop trigger if exists departure_room_opening_sync on public.departures;
create trigger departure_room_opening_sync
after insert or update of departs_at,chat_opens_at on public.departures
for each row execute function public.sync_departure_room_opening();

update public.trip_rooms tr
set opens_at=d.chat_opens_at,
    status=case
      when tr.status='closed' then 'closed'
      when d.chat_opens_at<=now() then 'open'
      else 'frozen'
    end
from public.vehicle_groups vg
join public.departures d on d.id=vg.departure_id
where tr.vehicle_group_id=vg.id
  and d.departs_at>=now()
  and d.status in ('draft','open','closed')
  and (
    tr.opens_at is distinct from d.chat_opens_at
    or (tr.status='frozen' and d.chat_opens_at<=now())
  );

create or replace function public.operations_set_departure_lifecycle(
  p_departure uuid,p_booking_closes_at timestamptz,p_chat_opens_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_departs timestamptz;v_expected_chat_open timestamptz;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;

  select departs_at into v_departs
  from public.departures
  where id=p_departure
  for update;

  if v_departs is null then raise exception 'departure time required'; end if;
  v_expected_chat_open:=v_departs-interval '24 hours';

  if p_booking_closes_at>v_departs then raise exception 'invalid booking cutoff'; end if;
  if p_chat_opens_at is distinct from v_expected_chat_open then
    raise exception 'trip room must open exactly 24 hours before departure';
  end if;

  update public.departures
  set booking_closes_at=p_booking_closes_at,
      chat_opens_at=v_expected_chat_open,
      updated_at=now()
  where id=p_departure;
  return found;
end
$$;

revoke all on function public.operations_set_departure_lifecycle(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.operations_set_departure_lifecycle(uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select '202609140137',now() where public.is_operations()
$$;

revoke all on function public.get_operations_system_release_info() from public,anon;
grant execute on function public.get_operations_system_release_info() to authenticated,service_role;

commit;
