begin;

-- Strict topic parsing plus the 003 security-definer helpers avoids querying RLS business tables here.
drop policy if exists vehicle_group_private_receive on realtime.messages;
create policy vehicle_group_private_receive on realtime.messages for select to authenticated using (
  case
    when realtime.topic() ~ '^private:vehicle-group:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_receive_vehicle_group(split_part(realtime.topic(), ':', 3)::uuid)
    else false
  end
);

drop policy if exists vehicle_group_private_send on realtime.messages;
create policy vehicle_group_private_send on realtime.messages for insert to authenticated with check (
  case
    when realtime.topic() ~ '^private:vehicle-group:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_send_vehicle_group_chat(split_part(realtime.topic(), ':', 3)::uuid)
    else false
  end
);

commit;
