begin;
drop policy if exists guided_assignments_scope on public.vehicle_group_guided_tours;
create policy guided_assignments_scope on public.vehicle_group_guided_tours for select to authenticated using(public.can_receive_vehicle_group(vehicle_group_id));
commit;
