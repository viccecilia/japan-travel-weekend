begin;
alter table public.trip_room_message_translations drop constraint trip_room_message_translations_target_language_check;
alter table public.trip_room_message_translations add constraint trip_room_message_translations_target_language_check
  check(target_language in ('zh-CN','zh-TW','ja','en','vi','ne','ko'));
-- 0088 replaced the context query with the older six-language whitelist.
-- Restore already configured Korean; Spanish is deliberately not enabled.
create or replace function public.get_message_translation_context(p_account uuid,p_message uuid,p_target_language text)
returns table(message_id uuid,source_content text,source_language text,cached_translation text)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.id,coalesce(m.original_content,m.content),m.source_language,t.translated_content
  from public.trip_room_messages m join public.trip_rooms r on r.id=m.trip_room_id
  left join public.trip_room_message_translations t on t.message_id=m.id and t.target_language=p_target_language
  where m.id=p_message and p_target_language in ('zh-CN','zh-TW','ja','en','vi','ne','ko')
  and (exists(select 1 from public.profiles p where p.id=p_account and p.role='operations')
    or public.is_active_group_staff(p_account,r.vehicle_group_id)
    or exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id
      where vgo.vehicle_group_id=r.vehicle_group_id and o.account_id=p_account and o.status in ('paid','confirmed')));
$$;
revoke all on function public.get_message_translation_context(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.get_message_translation_context(uuid,uuid,text) to service_role;
create or replace function public.store_message_translation(p_message uuid,p_target_language text,p_content text,p_provider text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_target_language is null or p_target_language not in ('zh-CN','zh-TW','ja','en','vi','ne','ko')
    or p_content is null or length(trim(p_content)) not between 1 and 4000
    or p_provider is null or length(p_provider) not between 1 and 100
    then raise exception 'unsupported or invalid translation'; end if;
  insert into public.trip_room_message_translations(message_id,target_language,translated_content,provider,quality)
  values(p_message,p_target_language,trim(p_content),p_provider,'machine') on conflict(message_id,target_language) do nothing;
  return true;
end $$;
-- Execution grant is the actual service boundary; current_user inside a
-- SECURITY DEFINER function is its owner, not the requesting API role.
revoke all on function public.store_message_translation(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.store_message_translation(uuid,text,text,text) to service_role;
create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select '20260919101135'::text,now();
end $$;
commit;
