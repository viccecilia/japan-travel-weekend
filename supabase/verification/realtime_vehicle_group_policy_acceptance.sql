-- Read-only and repeatable. Confirms the final 019 durable-chat boundary.
do $$
declare
  receive_count integer;
  send_count integer;
  durable_send_count integer;
begin
  select count(*) into receive_count
  from pg_policies
  where schemaname = 'realtime'
    and tablename = 'messages'
    and policyname = 'vehicle_group_private_receive'
    and cmd = 'SELECT'
    and roles = array['authenticated']::name[]
    and qual like '%can_receive_vehicle_group%'
    and qual like '%split_part%'
    and qual not like '%vehicle_groups%';

  select count(*) into send_count
  from pg_policies
  where schemaname = 'realtime'
    and tablename = 'messages'
    and policyname = 'vehicle_group_private_send'
    and cmd = 'INSERT'
    and roles = array['authenticated']::name[]
    and with_check like '%can_send_vehicle_group_chat%'
    and with_check like '%split_part%'
    and with_check not like '%vehicle_groups%';

  select count(*) into durable_send_count
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname = 'send_trip_room_message';

  if receive_count <> 1 then raise exception 'FAIL receive policy boundary'; end if;
  if send_count <> 0 then raise exception 'FAIL direct client send policy remains'; end if;
  if durable_send_count <> 1 then raise exception 'FAIL durable message RPC missing'; end if;
end $$;

select policyname,cmd,roles from pg_policies where schemaname='realtime' and tablename='messages' and policyname='vehicle_group_private_receive';
