begin;

-- One policy system, three independently versioned modules.  Route content
-- never stores these bodies; a standard day trip references the templates.
alter table public.policy_templates add column if not exists policy_role text not null default 'global' check(policy_role in ('global','service_time','cancellation'));
alter table public.trips add column if not exists service_time_policy_template_id uuid references public.policy_templates(id) on delete restrict;
alter table public.trips add column if not exists cancellation_policy_template_id uuid references public.policy_templates(id) on delete restrict;

insert into public.policy_templates(template_key,product_kind,policy_role)
values
  ('standard-10h-v1','day_trip','service_time'),
  ('standard-24h-v1','day_trip','cancellation')
on conflict(template_key) do update set policy_role=excluded.policy_role;

update public.policy_templates set policy_role='global' where template_key='jtw-day-trip-standard';
update public.trips set
  service_time_policy_template_id=(select id from public.policy_templates where template_key='standard-10h-v1'),
  cancellation_policy_template_id=(select id from public.policy_templates where template_key='standard-24h-v1')
where service_time_policy_template_id is null or cancellation_policy_template_id is null;
alter table public.trips alter column service_time_policy_template_id set not null;
alter table public.trips alter column cancellation_policy_template_id set not null;

alter table public.order_quotes add column if not exists service_time_policy_version_id uuid references public.policy_template_versions(id) on delete restrict;
alter table public.order_quotes add column if not exists cancellation_policy_version_id uuid references public.policy_template_versions(id) on delete restrict;
alter table public.order_snapshots add column if not exists service_time_policy_version_id uuid references public.policy_template_versions(id) on delete restrict;
alter table public.order_snapshots add column if not exists cancellation_policy_version_id uuid references public.policy_template_versions(id) on delete restrict;

create or replace function public.get_public_route_policies(p_trip uuid,p_locale text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with route_templates as (
    select 'global'::text as role,r.policy_template_id as template_id from public.trips r where r.id=p_trip and r.status='published'
    union all select 'service_time',r.service_time_policy_template_id from public.trips r where r.id=p_trip and r.status='published'
    union all select 'cancellation',r.cancellation_policy_template_id from public.trips r where r.id=p_trip and r.status='published'
  ), published as (
    select rt.role,t.template_key,v.id,v.version_number,
      (select l.sections from public.policy_template_localizations l where l.policy_version_id=v.id and l.locale in (p_locale,'zh-CN') order by case when l.locale=p_locale then 0 else 1 end limit 1) as sections
    from route_templates rt join public.policy_templates t on t.id=rt.template_id and t.status='active'
    join lateral (select p.* from public.policy_template_versions p where p.template_id=t.id and p.state='published' order by p.version_number desc limit 1) v on true
  )
  select jsonb_object_agg(role,jsonb_build_object('templateKey',template_key,'versionId',id,'version',version_number,'sections',sections)) from published
$$;

revoke all on function public.get_public_route_policies(uuid,text) from public,anon;
grant execute on function public.get_public_route_policies(uuid,text) to anon,authenticated,service_role;

commit;
