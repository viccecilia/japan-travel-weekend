alter table public.chat_translation_preferences drop constraint if exists chat_translation_preferences_target_language_check;
alter table public.chat_translation_preferences add constraint chat_translation_preferences_target_language_check check(target_language in ('zh-CN','zh-TW','ja','en','vi','ne','ko'));

alter table public.trip_room_message_translations drop constraint if exists trip_room_message_translations_target_language_check;
alter table public.trip_room_message_translations add constraint trip_room_message_translations_target_language_check check(target_language in ('zh-CN','zh-TW','ja','en','vi','ne','ko'));
