begin;

alter table public.chat_translation_preferences drop constraint if exists chat_translation_preferences_target_language_check;
alter table public.chat_translation_preferences add constraint chat_translation_preferences_target_language_check check(target_language in ('zh-CN','zh-TW','ja','en','vi','ne'));
alter table public.trip_room_message_translations drop constraint if exists trip_room_message_translations_target_language_check;
alter table public.trip_room_message_translations add constraint trip_room_message_translations_target_language_check check(target_language in ('zh-CN','zh-TW','ja','en','vi','ne'));

create or replace function public.update_own_chat_translation_preference(p_target_language text,p_auto_translate boolean,p_follow_device_language boolean)
returns public.chat_translation_preferences language plpgsql security invoker set search_path=public,pg_temp as $$
declare result public.chat_translation_preferences;
begin
  if auth.uid() is null or p_target_language not in ('zh-CN','zh-TW','ja','en','vi','ne') then raise exception 'invalid translation preference'; end if;
  insert into public.chat_translation_preferences(account_id,target_language,auto_translate,follow_device_language)
    values(auth.uid(),p_target_language,p_auto_translate,p_follow_device_language)
    on conflict(account_id) do update set target_language=excluded.target_language,auto_translate=excluded.auto_translate,follow_device_language=excluded.follow_device_language,updated_at=now()
    returning * into result;
  return result;
end$$;

create or replace function public.get_message_translation_context(p_account uuid,p_message uuid,p_target_language text)
returns table(message_id uuid,source_content text,source_language text,cached_translation text)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.id,coalesce(m.original_content,m.content),m.source_language,t.translated_content
  from public.trip_room_messages m join public.trip_rooms r on r.id=m.trip_room_id
  left join public.trip_room_message_translations t on t.message_id=m.id and t.target_language=p_target_language
  where m.id=p_message and p_target_language in ('zh-CN','zh-TW','ja','en','vi','ne') and (
    exists(select 1 from public.profiles p where p.id=p_account and p.role='operations')
    or exists(select 1 from public.staff_assignments sa where sa.vehicle_group_id=r.vehicle_group_id and sa.staff_id=p_account)
    or exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=r.vehicle_group_id and o.account_id=p_account and o.status in ('paid','confirmed'))
  );
$$;

create or replace function public.store_message_translation(p_message uuid,p_target_language text,p_content text,p_provider text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') or p_target_language not in ('zh-CN','zh-TW','ja','en','vi','ne') or length(trim(p_content)) not between 1 and 4000 or length(p_provider) not between 1 and 100 then raise exception 'trusted translation service only'; end if;
  insert into public.trip_room_message_translations(message_id,target_language,translated_content,provider,quality)
    values(p_message,p_target_language,trim(p_content),p_provider,'machine') on conflict(message_id,target_language) do nothing;
  return true;
end$$;

revoke all on function public.update_own_chat_translation_preference(text,boolean,boolean) from public,anon;
grant execute on function public.update_own_chat_translation_preference(text,boolean,boolean) to authenticated,service_role;
revoke all on function public.get_message_translation_context(uuid,uuid,text),public.store_message_translation(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.get_message_translation_context(uuid,uuid,text),public.store_message_translation(uuid,text,text,text) to service_role;

commit;
