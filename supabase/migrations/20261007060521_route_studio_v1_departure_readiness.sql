begin;

-- Route Studio V1 creates a draft with the same reviewed commerce defaults
-- already used by the existing product-revision migration. Editors can then
-- replace route-specific content without inventing or duplicating Attraction data.
create or replace function public.operations_create_product(
  p_slug text,p_title text,p_content jsonb,p_hero_image_url text,p_gallery jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_trip uuid;v_revision uuid;v_content jsonb;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if trim(coalesce(p_slug,'')) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(trim(coalesce(p_title,'')))<3 then raise exception 'invalid product identity'; end if;
  if jsonb_typeof(coalesce(p_gallery,'[]'::jsonb))<>'array' then raise exception 'gallery must be an array'; end if;
  v_content:=jsonb_build_object(
    'childPolicy','儿童价格与座位规则以所选班次和结账页显示为准。',
    'luggagePolicy','大件行李、婴儿车及行动辅助设备须在乘客资料中申报并由运营确认。',
    'accessibilityInfo','路线可能包含台阶和坡道，需要无障碍协助时请提前确认。',
    'mealInfo','餐食默认不包含，用餐安排以当天运营通知为准。',
    'weatherPolicy','天气或交通可能调整顺序与停留时间，重大变更由运营另行通知。',
    'cancellationPolicyVersion','2026-09-v1'
  )||coalesce(p_content,'{}'::jsonb);
  insert into public.trips(slug,title,status,content,hero_image_url,gallery,catalog_version)
  values(lower(trim(p_slug)),trim(p_title),'draft',v_content,nullif(trim(coalesce(p_hero_image_url,'')),''),coalesce(p_gallery,'[]'::jsonb),1)
  returning id into v_trip;
  insert into public.product_revisions(trip_id,revision_number,state,title,content,hero_image_url,gallery,created_by)
  values(v_trip,1,'draft',trim(p_title),v_content,nullif(trim(coalesce(p_hero_image_url,'')),''),coalesce(p_gallery,'[]'::jsonb),auth.uid()) returning id into v_revision;
  update public.trips set current_draft_revision_id=v_revision where id=v_trip;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'product_created','trip',v_trip,jsonb_build_object('slug',lower(trim(p_slug))));
  return v_trip;
end$$;

create or replace function public.operations_departure_readiness(
  p_trip uuid,p_start date,p_end date,p_weekdays integer[],p_departure_time time,
  p_duration_minutes integer,p_price integer,p_capacity integer,p_sales_open timestamptz,
  p_close_hours integer,p_meeting_name text,p_meeting_address text,p_map_lat numeric,p_map_lng numeric
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_trip public.trips%rowtype;v_missing jsonb:='[]'::jsonb;v_first_departure timestamptz;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into v_trip from public.trips where id=p_trip;
  if not found then v_missing:=v_missing||'"product_not_found"'::jsonb;
  else
    if v_trip.status<>'published' or v_trip.current_published_revision_id is null then v_missing:=v_missing||'"product_not_published"'::jsonb; end if;
    if jsonb_typeof(coalesce(v_trip.content->'itinerary','null'::jsonb))<>'array' or jsonb_array_length(coalesce(v_trip.content->'itinerary','[]'::jsonb))=0 then v_missing:=v_missing||'"itinerary"'::jsonb; end if;
    if jsonb_typeof(coalesce(v_trip.content->'included','null'::jsonb))<>'array' or jsonb_array_length(coalesce(v_trip.content->'included','[]'::jsonb))=0 then v_missing:=v_missing||'"included"'::jsonb; end if;
    if jsonb_typeof(coalesce(v_trip.content->'excluded','null'::jsonb))<>'array' then v_missing:=v_missing||'"excluded"'::jsonb; end if;
    if length(trim(coalesce(v_trip.content->>'description','')))<20 then v_missing:=v_missing||'"description"'::jsonb; end if;
    if not public.route_catalog_complete(v_trip.content) then v_missing:=v_missing||'"commerce_policy"'::jsonb; end if;
  end if;
  if p_start is null or p_end is null or p_start>p_end or p_end-p_start>93 then v_missing:=v_missing||'"date_range"'::jsonb; end if;
  if coalesce(array_length(p_weekdays,1),0)=0 then v_missing:=v_missing||'"weekdays"'::jsonb; end if;
  if p_departure_time is null then v_missing:=v_missing||'"departure_time"'::jsonb; end if;
  if p_duration_minutes is null or p_duration_minutes not between 60 and 1440 then v_missing:=v_missing||'"duration"'::jsonb; end if;
  if p_price is null or p_price<1 then v_missing:=v_missing||'"price"'::jsonb; end if;
  if p_capacity is null or p_capacity<1 then v_missing:=v_missing||'"capacity"'::jsonb; end if;
  if p_close_hours is null or p_close_hours<1 then v_missing:=v_missing||'"sales_close"'::jsonb; end if;
  if length(trim(coalesce(p_meeting_name,'')))<2 then v_missing:=v_missing||'"meeting_name"'::jsonb; end if;
  if length(trim(coalesce(p_meeting_address,'')))<5 then v_missing:=v_missing||'"meeting_address"'::jsonb; end if;
  if p_map_lat is null or p_map_lat not between -90 and 90 or p_map_lng is null or p_map_lng not between -180 and 180 then v_missing:=v_missing||'"meeting_coordinates"'::jsonb; end if;
  if p_start is not null and p_departure_time is not null and p_close_hours is not null then
    v_first_departure:=((p_start+p_departure_time) at time zone 'Asia/Tokyo');
    if p_sales_open is null or p_sales_open>=v_first_departure-make_interval(hours=>p_close_hours) then v_missing:=v_missing||'"sales_window"'::jsonb; end if;
  end if;
  return jsonb_build_object('ready',jsonb_array_length(v_missing)=0,'missing',v_missing);
end$$;

create or replace function public.operations_preview_departure_batch(p_trip uuid,p_start date,p_end date,p_weekdays integer[],p_departure_time time,p_duration_minutes integer,p_price integer,p_capacity integer,p_sales_open timestamptz,p_close_hours integer,p_meeting_name text,p_meeting_address text,p_map_lat numeric,p_map_lng numeric)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;readiness jsonb;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  readiness:=public.operations_departure_readiness(p_trip,p_start,p_end,p_weekdays,p_departure_time,p_duration_minutes,p_price,p_capacity,p_sales_open,p_close_hours,p_meeting_name,p_meeting_address,p_map_lat,p_map_lng);
  if jsonb_array_length(readiness->'missing')>0 then raise exception 'DEPARTURE_READINESS_MISSING:%',readiness->'missing' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('serviceDate',day::date,'departsAt',(((day::date)+p_departure_time) at time zone 'Asia/Tokyo'),'endsAt',(((day::date)+p_departure_time+make_interval(mins=>p_duration_minutes)) at time zone 'Asia/Tokyo'),'price',p_price,'capacity',p_capacity,'duplicate',exists(select 1 from public.departures d where d.trip_id=p_trip and d.departs_at=(((day::date)+p_departure_time) at time zone 'Asia/Tokyo')) ) order by day)
  into result from generate_series(p_start,p_end,interval '1 day') day where extract(isodow from day)::integer=any(p_weekdays);
  return coalesce(result,'[]'::jsonb);
end$$;

revoke all on function public.operations_departure_readiness(uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,text,text,numeric,numeric) from public,anon;
grant execute on function public.operations_departure_readiness(uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,text,text,numeric,numeric) to authenticated,service_role;

commit;
