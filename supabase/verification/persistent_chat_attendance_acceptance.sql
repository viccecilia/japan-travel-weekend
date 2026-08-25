-- Read-only, repeatable structure acceptance. Remote role behavior remains a separate gate.
do $$
begin
  if exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='vehicle_group_private_send') then raise exception 'FAIL direct broadcast send policy remains'; end if;
  if not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='send_trip_room_message') then raise exception 'FAIL durable message function missing'; end if;
  if not exists(select 1 from pg_tables where schemaname='public' and tablename='passenger_checkins' and rowsecurity) then raise exception 'FAIL passenger check-ins RLS missing'; end if;
  if not exists(select 1 from pg_tables where schemaname='public' and tablename='passenger_contact_actions' and rowsecurity) then raise exception 'FAIL contact actions RLS missing'; end if;
  if not exists(select 1 from public.trip_attendance_config where singleton and staff_contact_minutes_after=5) then raise exception 'FAIL attendance configuration missing'; end if;
  if (select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('trip_room_messages','trip_rooms','passenger_checkins'))<>3 then raise exception 'FAIL postgres changes publication missing'; end if;
end$$;
select 'PASS' as persistent_chat_attendance_structure;
