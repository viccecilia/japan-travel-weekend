-- Read-only and repeatable. Confirms 006 is installed without embedding any environment identifier.
do $$
declare receive_policy record; send_policy record;
begin
  select * into receive_policy from pg_policies where schemaname='realtime' and tablename='messages' and policyname='vehicle_group_private_receive';
  select * into send_policy from pg_policies where schemaname='realtime' and tablename='messages' and policyname='vehicle_group_private_send';
  if receive_policy.policyname is null then raise exception 'FAIL receive policy missing'; end if;
  if receive_policy.cmd <> 'SELECT' or receive_policy.roles <> array['authenticated']::name[] then raise exception 'FAIL receive policy command or role'; end if;
  if receive_policy.qual not like '%can_receive_vehicle_group%' or receive_policy.qual not like '%split_part%' or receive_policy.qual like '%vehicle_groups%' then raise exception 'FAIL receive policy membership boundary'; end if;
  if send_policy.policyname is null then raise exception 'FAIL send policy missing'; end if;
  if send_policy.cmd <> 'INSERT' or send_policy.roles <> array['authenticated']::name[] then raise exception 'FAIL send policy command or role'; end if;
  if send_policy.with_check not like '%can_send_vehicle_group_chat%' or send_policy.with_check not like '%split_part%' or send_policy.with_check like '%vehicle_groups%' then raise exception 'FAIL send policy open-room boundary'; end if;
end $$;

select policyname,cmd,roles from pg_policies where schemaname='realtime' and tablename='messages' and policyname in ('vehicle_group_private_receive','vehicle_group_private_send') order by policyname;
