begin;

alter table public.trip_room_messages
  add column if not exists source_language text not null default 'und',
  add column if not exists template_key text;

create table if not exists public.chat_translation_preferences (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  target_language text not null default 'en' check(target_language in ('zh-CN','ja','en','vi','ne')),
  auto_translate boolean not null default true,
  follow_device_language boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_room_message_translations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.trip_room_messages(id) on delete cascade,
  target_language text not null check(target_language in ('zh-CN','ja','en','vi','ne')),
  translated_content text not null check(length(translated_content) between 1 and 4000),
  provider text not null,
  quality text not null check(quality in ('pretranslated','machine','reviewed')),
  created_at timestamptz not null default now(),
  unique(message_id,target_language)
);

alter table public.chat_translation_preferences enable row level security;
alter table public.trip_room_message_translations enable row level security;
revoke all on public.chat_translation_preferences,public.trip_room_message_translations from public,anon,authenticated;
grant select,insert,update on public.chat_translation_preferences to authenticated;
grant select on public.trip_room_message_translations to authenticated;
grant all on public.chat_translation_preferences,public.trip_room_message_translations to service_role;

create policy own_chat_translation_preference on public.chat_translation_preferences
  for all to authenticated using(account_id=auth.uid()) with check(account_id=auth.uid());
create policy vehicle_group_message_translation_read on public.trip_room_message_translations
  for select to authenticated using(exists(
    select 1 from public.trip_room_messages m join public.trip_rooms r on r.id=m.trip_room_id
    where m.id=message_id and public.can_receive_vehicle_group(r.vehicle_group_id)
  ));

create or replace function public.update_own_chat_translation_preference(p_target_language text,p_auto_translate boolean,p_follow_device_language boolean)
returns public.chat_translation_preferences language plpgsql security invoker set search_path=public,pg_temp as $$
declare result public.chat_translation_preferences;
begin
  if auth.uid() is null or p_target_language not in ('zh-CN','ja','en','vi','ne') then raise exception 'invalid translation preference'; end if;
  insert into public.chat_translation_preferences(account_id,target_language,auto_translate,follow_device_language)
    values(auth.uid(),p_target_language,p_auto_translate,p_follow_device_language)
    on conflict(account_id) do update set target_language=excluded.target_language,auto_translate=excluded.auto_translate,follow_device_language=excluded.follow_device_language,updated_at=now()
    returning * into result;
  return result;
end$$;

revoke all on function public.update_own_chat_translation_preference(text,boolean,boolean) from public,anon;
grant execute on function public.update_own_chat_translation_preference(text,boolean,boolean) to authenticated,service_role;

create or replace function public.send_staff_trip_room_template(p_room uuid,p_template_key text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare group_id uuid;message_id uuid;content_value text;
begin
  select vehicle_group_id into group_id from public.trip_rooms where id=p_room and status='open';
  if group_id is null then raise exception 'trip room is not open'; end if;
  if not(public.is_operations() or public.is_group_staff(group_id)) then raise exception 'assigned staff only'; end if;
  content_value:=case p_template_key
    when 'introduce' then '大家好，我是本车工作人员。明天我会在群内协助大家集合与乘车。'
    when 'confirm_meeting' then '请确认明天的集合时间与置顶集合地点，并提前到达。'
    when 'vehicle_arrived' then '车辆已经到达集合点，请按置顶车辆信息寻找本车。'
    when 'departing_10' then '车辆将在 10 分钟后出发，请尽快返回。'
    when 'departing_5' then '车辆将在 5 分钟后出发，请立即返回。'
    when 'return_vehicle' then '请返回车辆；如已走散，可主动临时共享位置。'
    when 'traffic_delay' then '因交通情况行程有所延误，请关注置顶信息。'
    when 'meeting_changed' then '集合地点已经变更，请以最新置顶集合信息为准。'
    else null end;
  if content_value is null then raise exception 'unknown template'; end if;
  insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content,translated_content,source_language,template_key)
    values(p_room,auth.uid(),content_value,true,'text',content_value,null,'zh-CN',p_template_key) returning id into message_id;
  return message_id;
end$$;

revoke all on function public.send_staff_trip_room_template(uuid,text) from public,anon;
grant execute on function public.send_staff_trip_room_template(uuid,text) to authenticated,service_role;

create or replace function public.get_message_translation_context(p_account uuid,p_message uuid,p_target_language text)
returns table(message_id uuid,source_content text,source_language text,cached_translation text)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.id,coalesce(m.original_content,m.content),m.source_language,t.translated_content
  from public.trip_room_messages m
  join public.trip_rooms r on r.id=m.trip_room_id
  left join public.trip_room_message_translations t on t.message_id=m.id and t.target_language=p_target_language
  where m.id=p_message and p_target_language in ('zh-CN','ja','en','vi','ne') and (
    exists(select 1 from public.profiles p where p.id=p_account and p.role='operations')
    or exists(select 1 from public.staff_assignments sa where sa.vehicle_group_id=r.vehicle_group_id and sa.staff_id=p_account)
    or exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=r.vehicle_group_id and o.account_id=p_account)
  );
$$;

create or replace function public.store_message_translation(p_message uuid,p_target_language text,p_content text,p_provider text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if current_user not in ('service_role','postgres') or p_target_language not in ('zh-CN','ja','en','vi','ne') or length(trim(p_content)) not between 1 and 4000 or length(p_provider) not between 1 and 100 then raise exception 'trusted translation service only'; end if;
  insert into public.trip_room_message_translations(message_id,target_language,translated_content,provider,quality)
    values(p_message,p_target_language,trim(p_content),p_provider,'machine')
    on conflict(message_id,target_language) do nothing;
  return true;
end$$;

revoke all on function public.get_message_translation_context(uuid,uuid,text),public.store_message_translation(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.get_message_translation_context(uuid,uuid,text),public.store_message_translation(uuid,text,text,text) to service_role;

commit;
