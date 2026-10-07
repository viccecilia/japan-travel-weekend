begin;

-- Product creation happens after all three policy references became required.
-- Resolve the active standard templates inside the formal operations RPC so a
-- newly-created draft has the same policy authority as an existing day trip.
create or replace function public.operations_create_product(
  p_slug text,p_title text,p_content jsonb,p_hero_image_url text,p_gallery jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_trip uuid;
  v_revision uuid;
  v_content jsonb;
  v_policy_template uuid;
  v_service_time_policy_template uuid;
  v_cancellation_policy_template uuid;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if trim(coalesce(p_slug,'')) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(trim(coalesce(p_title,'')))<3 then raise exception 'invalid product identity'; end if;
  if jsonb_typeof(coalesce(p_gallery,'[]'::jsonb))<>'array' then raise exception 'gallery must be an array'; end if;

  select id into v_policy_template from public.policy_templates where template_key='jtw-day-trip-standard' and status='active';
  select id into v_service_time_policy_template from public.policy_templates where template_key='standard-10h-v1' and status='active';
  select id into v_cancellation_policy_template from public.policy_templates where template_key='standard-24h-v1' and status='active';
  if v_policy_template is null or v_service_time_policy_template is null or v_cancellation_policy_template is null then
    raise exception 'standard route policy templates are not active';
  end if;

  v_content:=jsonb_build_object(
    'childPolicy','儿童价格与座位规则以所选班次和结账页显示为准。',
    'luggagePolicy','大件行李、婴儿车及行动辅助设备须在乘客资料中申报并由运营确认。',
    'accessibilityInfo','路线可能包含台阶和坡道，需要无障碍协助时请提前确认。',
    'mealInfo','餐食默认不包含，用餐安排以当天运营通知为准。',
    'weatherPolicy','天气或交通可能调整顺序与停留时间，重大变更由运营另行通知。',
    'cancellationPolicyVersion','2026-09-v1'
  )||coalesce(p_content,'{}'::jsonb);

  insert into public.trips(
    slug,title,status,content,hero_image_url,gallery,catalog_version,
    policy_template_id,service_time_policy_template_id,cancellation_policy_template_id
  ) values(
    lower(trim(p_slug)),trim(p_title),'draft',v_content,
    nullif(trim(coalesce(p_hero_image_url,'')),''),coalesce(p_gallery,'[]'::jsonb),1,
    v_policy_template,v_service_time_policy_template,v_cancellation_policy_template
  ) returning id into v_trip;

  insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,created_by)
  values(v_trip,1,'draft',trim(p_title),v_content,nullif(trim(coalesce(p_hero_image_url,'')),''),coalesce(p_gallery,'[]'::jsonb),auth.uid()) returning id into v_revision;
  update public.trips set current_draft_revision_id=v_revision where id=v_trip;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'product_created','trip',v_trip,jsonb_build_object('slug',lower(trim(p_slug))));
  return v_trip;
end$$;

revoke all on function public.operations_create_product(text,text,jsonb,text,jsonb) from public,anon;
grant execute on function public.operations_create_product(text,text,jsonb,text,jsonb) to authenticated,service_role;

commit;
