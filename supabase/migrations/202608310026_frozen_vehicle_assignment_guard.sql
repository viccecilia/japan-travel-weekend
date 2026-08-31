begin;

create or replace function public.guard_frozen_vehicle_assignment()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (old.vehicle_type is distinct from new.vehicle_type or old.capacity is distinct from new.capacity)
    and exists(select 1 from public.vehicle_groups where vehicle_assignment_id=old.id) then
    raise exception 'frozen vehicle assignment cannot be changed';
  end if;
  return new;
end$$;

drop trigger if exists guard_frozen_vehicle_assignment on public.vehicle_assignments;
create trigger guard_frozen_vehicle_assignment before update of vehicle_type,capacity on public.vehicle_assignments for each row execute function public.guard_frozen_vehicle_assignment();
revoke all on function public.guard_frozen_vehicle_assignment() from public,anon,authenticated;

commit;
