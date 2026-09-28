begin;

create or replace function public.get_public_route_policies_by_slug(p_slug text,p_locale text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select public.get_public_route_policies(t.id,p_locale)
  from public.trips t
  where t.slug=trim(p_slug) and t.status='published'
  limit 1
$$;

revoke all on function public.get_public_route_policies_by_slug(text,text) from public,anon;
grant execute on function public.get_public_route_policies_by_slug(text,text) to anon,authenticated,service_role;

commit;
