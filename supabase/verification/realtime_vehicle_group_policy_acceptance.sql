-- Read-only and repeatable. Confirms 006 is installed without embedding any environment identifier.
do $$
declare
  receive_count integer;
  send_count integer;
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

  if receive_count <> 1 then raise exception 'FAIL receive policy boundary'; end if;
  if send_count <> 1 then raise exception 'FAIL send policy boundary'; end if;
end $$;

select policyname,cmd,roles from pg_policies where schemaname='realtime' and tablename='messages' and policyname in ('vehicle_group_private_receive','vehicle_group_private_send') order by policyname;
