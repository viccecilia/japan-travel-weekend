begin;
create or replace function public.tm_content_id(p_platform text,p_url text) returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare m text[];
begin
 if p_platform='instagram' then m:=regexp_match(p_url,'instagram[.]com/(?:p|reel|reels)/([^/]+)');if m is not null then return 'instagram:'||m[1];end if;end if;
 if p_platform='tiktok' then m:=regexp_match(p_url,'tiktok[.]com/@[^/]+/video/([0-9]+)');if m is not null then return 'tiktok:'||m[1];end if;end if;
 return null;
end $$;
revoke all on function public.tm_content_id(text,text) from public,anon;
grant execute on function public.tm_content_id(text,text) to authenticated,service_role;
commit;
