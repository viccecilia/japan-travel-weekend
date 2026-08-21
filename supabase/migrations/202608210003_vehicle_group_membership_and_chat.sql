begin;

create or replace function public.is_vehicle_group_member(target_group uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=target_group and o.account_id=auth.uid())$$;
create or replace function public.can_receive_vehicle_group(target_group uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select public.is_operations() or public.is_group_staff(target_group) or public.is_vehicle_group_member(target_group)$$;
create or replace function public.can_send_vehicle_group_chat(target_group uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select public.can_receive_vehicle_group(target_group) and exists(select 1 from public.trip_rooms r where r.vehicle_group_id=target_group and r.status='open')$$;
create or replace function public.can_read_assistance_projection(target_order uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select public.is_order_owner(target_order) or public.is_operations() or exists(select 1 from public.vehicle_group_orders vgo join public.staff_assignments sa on sa.vehicle_group_id=vgo.vehicle_group_id where vgo.order_id=target_order and sa.staff_id=auth.uid())$$;

revoke all on function public.is_operations(),public.is_order_owner(uuid),public.is_group_staff(uuid),public.is_vehicle_group_member(uuid),public.can_receive_vehicle_group(uuid),public.can_send_vehicle_group_chat(uuid),public.can_read_assistance_projection(uuid) from public,anon;
grant execute on function public.is_operations(),public.is_order_owner(uuid),public.is_group_staff(uuid),public.is_vehicle_group_member(uuid),public.can_receive_vehicle_group(uuid),public.can_send_vehicle_group_chat(uuid),public.can_read_assistance_projection(uuid) to authenticated;

drop policy if exists groups_member_staff_ops on public.vehicle_groups;
create policy groups_member_staff_ops on public.vehicle_groups for select to authenticated using(public.can_receive_vehicle_group(id));
drop policy if exists rooms_member_staff_ops on public.trip_rooms;
create policy rooms_member_staff_ops on public.trip_rooms for select to authenticated using(public.can_receive_vehicle_group(vehicle_group_id));
drop policy if exists messages_room_members on public.trip_room_messages;
create policy messages_room_members on public.trip_room_messages for select to authenticated using(exists(select 1 from public.trip_rooms r where r.id=trip_room_id and public.can_receive_vehicle_group(r.vehicle_group_id)));
create policy messages_open_room_insert on public.trip_room_messages for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.trip_rooms r where r.id=trip_room_id and public.can_send_vehicle_group_chat(r.vehicle_group_id)));
grant insert on public.trip_room_messages to authenticated;

drop policy if exists assistance_projection_owner_ops_staff on public.passenger_assistance_staff_projection;
create policy assistance_projection_owner_ops_staff on public.passenger_assistance_staff_projection for select to authenticated using(public.can_read_assistance_projection(order_id));

drop policy if exists vehicle_group_private_receive on realtime.messages;
create policy vehicle_group_private_receive on realtime.messages for select to authenticated using(realtime.topic() like 'private:vehicle-group:%' and exists(select 1 from public.vehicle_groups vg where 'private:vehicle-group:'||vg.id::text=realtime.topic() and public.can_receive_vehicle_group(vg.id)));
drop policy if exists vehicle_group_private_send on realtime.messages;
create policy vehicle_group_private_send on realtime.messages for insert to authenticated with check(realtime.topic() like 'private:vehicle-group:%' and exists(select 1 from public.vehicle_groups vg where 'private:vehicle-group:'||vg.id::text=realtime.topic() and public.can_send_vehicle_group_chat(vg.id)));

commit;
