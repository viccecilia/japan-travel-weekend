begin;

-- QA-01C: new quotes derive policy text solely from immutable module versions.
-- Existing quotes, orders, and snapshots are intentionally untouched.
create or replace function public.lock_quote_policy_modules()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  t public.trips%rowtype;
  route_content jsonb;
  global_version public.policy_template_versions%rowtype;
  service_version public.policy_template_versions%rowtype;
  cancellation_version public.policy_template_versions%rowtype;
  global_sections jsonb;
  service_sections jsonb;
  cancellation_sections jsonb;
  selected_locale text:=coalesce(new.accepted_locale,'zh-CN');
begin
  select * into t from public.trips where id=new.trip_id;
  if not found then raise exception 'trip unavailable for quote policy lock'; end if;
  select content into route_content from public.product_revisions where id=new.product_revision_id and state='published';
  route_content:=coalesce(route_content,t.content,'{}'::jsonb);
  select * into global_version from public.policy_template_versions where template_id=t.policy_template_id and state='published' order by version_number desc limit 1;
  select * into service_version from public.policy_template_versions where template_id=t.service_time_policy_template_id and state='published' order by version_number desc limit 1;
  select * into cancellation_version from public.policy_template_versions where template_id=t.cancellation_policy_template_id and state='published' order by version_number desc limit 1;
  if global_version.id is null or service_version.id is null or cancellation_version.id is null then raise exception 'published policy modules required'; end if;
  select sections into global_sections from public.policy_template_localizations where policy_version_id=global_version.id and locale in (selected_locale,'zh-CN') order by case when locale=selected_locale then 0 else 1 end limit 1;
  select sections into service_sections from public.policy_template_localizations where policy_version_id=service_version.id and locale in (selected_locale,'zh-CN') order by case when locale=selected_locale then 0 else 1 end limit 1;
  select sections into cancellation_sections from public.policy_template_localizations where policy_version_id=cancellation_version.id and locale in (selected_locale,'zh-CN') order by case when locale=selected_locale then 0 else 1 end limit 1;
  if global_sections is null or service_sections is null or cancellation_sections is null then raise exception 'route policy module locale unavailable'; end if;
  new.policy_template_version_id:=global_version.id;
  new.service_time_policy_version_id:=service_version.id;
  new.cancellation_policy_version_id:=cancellation_version.id;
  new.accepted_locale:=selected_locale;
  -- These two legacy columns remain for compatibility, but their new values now
  -- come from the cancellation module, never from Route legacy content.
  new.cancellation_policy:=coalesce(cancellation_sections->'cancellation'->>'body','');
  new.cancellation_policy_version:=cancellation_version.version_number::text;
  new.commercial_terms:=jsonb_build_object('routeSpecific',jsonb_build_object(
    'included',coalesce(route_content->'included','[]'::jsonb),
    'excluded',coalesce(route_content->'excluded','[]'::jsonb),
    'preparation',coalesce(route_content->'preparation','[]'::jsonb),
    'routeReminders',coalesce(route_content->'routeReminders','[]'::jsonb)
  ));
  new.agreement_snapshot:=jsonb_build_object(
    'routeRevisionId',new.product_revision_id,
    'route',jsonb_build_object('title',new.title),
    'routeSpecific',new.commercial_terms->'routeSpecific',
    'meeting',coalesce(new.agreement_snapshot->'meeting','{}'::jsonb),
    'policyModules',jsonb_build_object(
      'global',jsonb_build_object('versionId',global_version.id,'version',global_version.version_number,'sections',global_sections),
      'serviceTime',jsonb_build_object('versionId',service_version.id,'version',service_version.version_number,'sections',service_sections),
      'cancellation',jsonb_build_object('versionId',cancellation_version.id,'version',cancellation_version.version_number,'sections',cancellation_sections)
    ),
    'acceptedLocale',selected_locale,
    'acceptedAt',coalesce(new.agreement_accepted_at,now())
  );
  new.agreement_accepted_at:=coalesce(new.agreement_accepted_at,now());
  return new;
end$$;

commit;
