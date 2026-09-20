-- Delete only the content record. Storage objects are intentionally untouched.
create function public.delete_discover_hero(p_id uuid, p_expected_version integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version integer;
begin
 if auth.uid() is null or not coalesce(public.is_operations(),false) then
   raise exception 'operations only' using errcode='42501';
 end if;
 if p_id is null or p_expected_version is null or p_expected_version<1 then
   raise exception 'invalid version' using errcode='22023';
 end if;
 -- Same per-Hero lock as save_discover_hero; serialize save/delete races.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select version into current_version from public.discover_heroes where id=p_id for update;
 if not found or current_version<>p_expected_version then
   raise exception 'Discover version conflict; reload before deleting' using errcode='40001';
 end if;
 delete from public.discover_heroes where id=p_id;
 return p_id;
end;
$$;
revoke all on function public.delete_discover_hero(uuid,integer) from public,anon;
grant execute on function public.delete_discover_hero(uuid,integer) to authenticated;
