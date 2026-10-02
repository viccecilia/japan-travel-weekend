begin;

-- System templates are generated operational events.  A rapid replay of the
-- same effective state must not create another passenger-visible chat row.
-- Human messages deliberately have no template_key and are never deduplicated.
create or replace function public.suppress_duplicate_trip_room_system_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.template_key is not null and exists(
    select 1 from public.trip_room_messages prior
    where prior.trip_room_id=new.trip_room_id
      and prior.template_key=new.template_key
      and prior.content=new.content
      and prior.created_at>=now()-interval '15 minutes'
  ) then
    return null;
  end if;
  return new;
end$$;

drop trigger if exists suppress_duplicate_trip_room_system_message_trigger on public.trip_room_messages;
create trigger suppress_duplicate_trip_room_system_message_trigger
before insert on public.trip_room_messages
for each row execute function public.suppress_duplicate_trip_room_system_message();

commit;
