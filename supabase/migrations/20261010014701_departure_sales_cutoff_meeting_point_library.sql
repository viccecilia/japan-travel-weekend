begin;

create table public.meeting_point_templates(
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name))>=2),
  address text not null check(length(trim(address))>=5),
  latitude numeric(9,6) not null check(latitude between -90 and 90),
  longitude numeric(9,6) not null check(longitude between -180 and 180),
  meeting_note text,
  active boolean not null default true,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id)
);
create unique index meeting_point_templates_name_key on public.meeting_point_templates(lower(trim(name)));
alter table public.meeting_point_templates enable row level security;
revoke all on public.meeting_point_templates from public,anon,authenticated;
grant all on public.meeting_point_templates to service_role;

alter table public.departures add column if not exists meeting_point_template_id uuid references public.meeting_point_templates(id) on delete set null;
alter table public.departures add column if not exists meeting_instruction text;
alter table public.order_quotes add column if not exists meeting_point_template_id uuid;
alter table public.order_quotes add column if not exists meeting_instruction text;
alter table public.order_quotes add column if not exists meeting_latitude numeric(9,6);
alter table public.order_quotes add column if not exists meeting_longitude numeric(9,6);
alter table public.order_snapshots add column if not exists meeting_point_template_id uuid;
alter table public.order_snapshots add column if not exists meeting_instruction text;
alter table public.order_snapshots add column if not exists meeting_latitude numeric(9,6);
alter table public.order_snapshots add column if not exists meeting_longitude numeric(9,6);

alter table public.account_audit_events drop constraint if exists account_audit_events_action_check;
alter table public.account_audit_events add constraint account_audit_events_action_check check(action in (
 'profile_updated','draft_abandoned','draft_expired',
 'staff_application_approved','staff_application_rejected','staff_application_needs_information','staff_application_suspended','staff_access_revoked',
 'route_catalog_patched','product_draft_saved','product_published','product_created','product_archived','product_restored','product_copied',
 'commission_payout_approved','commission_payout_rejected','commission_payout_paid',
 'driver_resource_updated','fleet_vehicle_updated','payment_resumed','expired_payment_checkout_reset',
 'meeting_point_created','meeting_point_updated','meeting_point_activated','meeting_point_deactivated'
));

create function public.operations_list_meeting_point_templates(p_include_inactive boolean default true)
returns table(id uuid,name text,address text,latitude numeric,longitude numeric,meeting_note text,active boolean,version integer,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  return query
    select m.id,m.name,m.address,m.latitude,m.longitude,m.meeting_note,m.active,m.version,m.updated_at
    from public.meeting_point_templates m
    where p_include_inactive or m.active
    order by m.active desc,lower(m.name),m.id;
end$$;

create function public.operations_create_meeting_point_template(
  p_name text,p_address text,p_latitude numeric,p_longitude numeric,p_meeting_note text,p_active boolean default true
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if length(trim(coalesce(p_name,'')))<2 or length(trim(coalesce(p_address,'')))<5
     or p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'invalid meeting point template' using errcode='22023';
  end if;
  insert into public.meeting_point_templates(name,address,latitude,longitude,meeting_note,active,created_by,updated_by)
  values(trim(p_name),trim(p_address),p_latitude,p_longitude,nullif(trim(coalesce(p_meeting_note,'')),''),coalesce(p_active,true),auth.uid(),auth.uid())
  returning id into v_id;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'meeting_point_created','meeting_point_template',v_id,jsonb_build_object('name',trim(p_name),'active',coalesce(p_active,true)));
  return v_id;
end$$;

create function public.operations_update_meeting_point_template(
  p_id uuid,p_expected_version integer,p_name text,p_address text,p_latitude numeric,p_longitude numeric,p_meeting_note text
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.meeting_point_templates%rowtype;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into v_item from public.meeting_point_templates where id=p_id for update;
  if not found or v_item.version<>p_expected_version then raise exception 'meeting point version conflict' using errcode='40001'; end if;
  if length(trim(coalesce(p_name,'')))<2 or length(trim(coalesce(p_address,'')))<5
     or p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'invalid meeting point template' using errcode='22023';
  end if;
  update public.meeting_point_templates
  set name=trim(p_name),address=trim(p_address),latitude=p_latitude,longitude=p_longitude,
      meeting_note=nullif(trim(coalesce(p_meeting_note,'')),''),version=version+1,updated_at=now(),updated_by=auth.uid()
  where id=p_id;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'meeting_point_updated','meeting_point_template',p_id,jsonb_build_object('fromVersion',v_item.version,'toVersion',v_item.version+1));
  return v_item.version+1;
end$$;

create function public.operations_set_meeting_point_template_active(p_id uuid,p_expected_version integer,p_active boolean)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item public.meeting_point_templates%rowtype;v_action text;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into v_item from public.meeting_point_templates where id=p_id for update;
  if not found or v_item.version<>p_expected_version then raise exception 'meeting point version conflict' using errcode='40001'; end if;
  if v_item.active=p_active then return v_item.version; end if;
  v_action:=case when p_active then 'meeting_point_activated' else 'meeting_point_deactivated' end;
  update public.meeting_point_templates set active=p_active,version=version+1,updated_at=now(),updated_by=auth.uid() where id=p_id;
  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),v_action,'meeting_point_template',p_id,jsonb_build_object('fromActive',v_item.active,'toActive',p_active));
  return v_item.version+1;
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
  if p_start is not null and p_end is not null and p_start<=p_end and p_departure_time is not null and coalesce(array_length(p_weekdays,1),0)>0 then
    select min(((day::date)+p_departure_time) at time zone 'Asia/Tokyo') into v_first_departure
    from generate_series(p_start,p_end,interval '1 day') day
    where extract(isodow from day)::integer=any(p_weekdays);
    if v_first_departure is null then v_missing:=v_missing||'"date_range"'::jsonb;
    elsif p_close_hours is not null and (p_sales_open is null or p_sales_open>=v_first_departure-make_interval(hours=>p_close_hours)) then
      v_missing:=v_missing||'"sales_window"'::jsonb;
    end if;
  end if;
  return jsonb_build_object('ready',jsonb_array_length(v_missing)=0,'missing',v_missing);
end$$;

drop function if exists public.operations_create_departure_batch(uuid,uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,text,text,numeric,numeric);
drop function if exists public.operations_preview_departure_batch(uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,text,text,numeric,numeric);

create function public.operations_preview_departure_batch(
  p_trip uuid,p_start date,p_end date,p_weekdays integer[],p_departure_time time,p_duration_minutes integer,
  p_price integer,p_capacity integer,p_sales_open timestamptz,p_close_hours integer,p_meeting_template uuid,
  p_meeting_name text,p_meeting_address text,p_map_lat numeric,p_map_lng numeric,p_meeting_instruction text
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;readiness jsonb;v_name text:=p_meeting_name;v_address text:=p_meeting_address;v_lat numeric:=p_map_lat;v_lng numeric:=p_map_lng;v_instruction text:=p_meeting_instruction;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if p_meeting_template is not null then
    select name,address,latitude,longitude,meeting_note into v_name,v_address,v_lat,v_lng,v_instruction
    from public.meeting_point_templates where id=p_meeting_template and active;
    if not found then raise exception 'DEPARTURE_READINESS_MISSING:["meeting_template"]' using errcode='22023'; end if;
  end if;
  readiness:=public.operations_departure_readiness(p_trip,p_start,p_end,p_weekdays,p_departure_time,p_duration_minutes,p_price,p_capacity,p_sales_open,p_close_hours,v_name,v_address,v_lat,v_lng);
  if jsonb_array_length(readiness->'missing')>0 then raise exception 'DEPARTURE_READINESS_MISSING:%',readiness->'missing' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object(
    'serviceDate',day::date,
    'departsAt',(((day::date)+p_departure_time) at time zone 'Asia/Tokyo'),
    'endsAt',(((day::date)+p_departure_time+make_interval(mins=>p_duration_minutes)) at time zone 'Asia/Tokyo'),
    'salesOpenAt',p_sales_open,
    'salesCloseAt',(((day::date)+p_departure_time) at time zone 'Asia/Tokyo')-make_interval(hours=>p_close_hours),
    'price',p_price,'capacity',p_capacity,
    'meetingPointTemplateId',p_meeting_template,'meetingName',trim(v_name),'meetingAddress',trim(v_address),
    'meetingLatitude',v_lat,'meetingLongitude',v_lng,'meetingInstruction',nullif(trim(coalesce(v_instruction,'')),''),
    'duplicate',exists(select 1 from public.departures d where d.trip_id=p_trip and d.departs_at=(((day::date)+p_departure_time) at time zone 'Asia/Tokyo'))
  ) order by day)
  into result from generate_series(p_start,p_end,interval '1 day') day where extract(isodow from day)::integer=any(p_weekdays);
  return coalesce(result,'[]'::jsonb);
end$$;

create function public.operations_create_departure_batch(
  p_operation uuid,p_trip uuid,p_start date,p_end date,p_weekdays integer[],p_departure_time time,p_duration_minutes integer,
  p_price integer,p_capacity integer,p_sales_open timestamptz,p_close_hours integer,p_meeting_template uuid,
  p_meeting_name text,p_meeting_address text,p_map_lat numeric,p_map_lng numeric,p_meeting_instruction text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare digest text;existing jsonb;created integer:=0;skipped integer:=0;day date;depart_at timestamptz;v_name text:=p_meeting_name;v_address text:=p_meeting_address;v_lat numeric:=p_map_lat;v_lng numeric:=p_map_lng;v_instruction text:=p_meeting_instruction;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if p_meeting_template is not null then
    select name,address,latitude,longitude,meeting_note into v_name,v_address,v_lat,v_lng,v_instruction
    from public.meeting_point_templates where id=p_meeting_template and active;
    if not found then raise exception 'DEPARTURE_READINESS_MISSING:["meeting_template"]' using errcode='22023'; end if;
  end if;
  digest:=md5(concat_ws('|',p_trip,p_start,p_end,p_weekdays,p_departure_time,p_duration_minutes,p_price,p_capacity,p_sales_open,p_close_hours,p_meeting_template,v_name,v_address,v_lat,v_lng,v_instruction));
  select result into existing from public.departure_batch_operations where operation_id=p_operation and actor_id=auth.uid() and request_digest=digest;
  if found then return existing; end if;
  if exists(select 1 from public.departure_batch_operations where operation_id=p_operation) then raise exception 'operation id mismatch'; end if;
  perform public.operations_preview_departure_batch(p_trip,p_start,p_end,p_weekdays,p_departure_time,p_duration_minutes,p_price,p_capacity,p_sales_open,p_close_hours,p_meeting_template,v_name,v_address,v_lat,v_lng,v_instruction);
  for day in select value::date from generate_series(p_start,p_end,interval '1 day') value where extract(isodow from value)::integer=any(p_weekdays) loop
    depart_at:=((day+p_departure_time) at time zone 'Asia/Tokyo');
    if exists(select 1 from public.departures d where d.trip_id=p_trip and d.departs_at=depart_at) then skipped:=skipped+1;continue;end if;
    insert into public.departures(
      trip_id,departs_at,ends_at,capacity,status,seat_price_jpy,sales_open_at,sales_close_at,booking_closes_at,chat_opens_at,
      minimum_guests,currency,tax_included,meeting_point_template_id,meeting_name,meeting_address,map_lat,map_lng,meeting_instruction
    ) values(
      p_trip,depart_at,depart_at+make_interval(mins=>p_duration_minutes),p_capacity,'open',p_price,p_sales_open,
      depart_at-make_interval(hours=>p_close_hours),depart_at-make_interval(hours=>p_close_hours),
      ((((depart_at at time zone 'Asia/Tokyo')::date-1)+time '12:00') at time zone 'Asia/Tokyo'),1,'JPY',true,
      p_meeting_template,trim(v_name),trim(v_address),v_lat,v_lng,nullif(trim(coalesce(v_instruction,'')),'')
    );
    created:=created+1;
  end loop;
  existing:=jsonb_build_object('created',created,'skippedDuplicates',skipped);
  insert into public.departure_batch_operations(operation_id,actor_id,request_digest,result) values(p_operation,auth.uid(),digest,existing);
  return existing;
end$$;

-- The quote remains the commercial agreement boundary.  Copy the departure
-- meeting snapshot before the existing policy trigger extends the same
-- agreement_snapshot; later template or departure edits cannot alter it.
create or replace function public.lock_quote_meeting_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.departures%rowtype;
begin
  select x.* into d from public.departures x where x.id=new.departure_id;
  if not found then raise exception 'departure unavailable for quote meeting snapshot'; end if;
  new.meeting_point_template_id:=d.meeting_point_template_id;
  new.meeting_instruction:=d.meeting_instruction;
  new.meeting_latitude:=d.map_lat;
  new.meeting_longitude:=d.map_lng;
  new.agreement_snapshot:=coalesce(new.agreement_snapshot,'{}'::jsonb)||jsonb_build_object(
    'meeting',jsonb_build_object(
      'templateId',d.meeting_point_template_id,'name',d.meeting_name,'address',d.meeting_address,
      'instruction',d.meeting_instruction,'latitude',d.map_lat,'longitude',d.map_lng,
      'meetingTime',d.departs_at,'departureTime',d.departs_at
    )
  );
  return new;
end$$;

drop trigger if exists lock_order_quote_meeting_snapshot on public.order_quotes;
create trigger lock_order_quote_meeting_snapshot before insert on public.order_quotes
for each row execute function public.lock_quote_meeting_snapshot();

create or replace function public.capture_paid_order_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    insert into public.order_snapshots(
      order_id,trip_id,product_revision_id,departure_id,departure_version,title,departs_at,
      meeting_point_template_id,meeting_name,meeting_address,meeting_instruction,meeting_latitude,meeting_longitude,
      seat_count,unit_price_jpy,gross_amount_jpy,paid_amount_jpy,cancellation_policy,cancellation_policy_version,
      commercial_terms,source_kind,line_items,coupon_id,coupon_source_type,coupon_rules_version,discount_percent,
      discounted_seats,discounted_unit_price_jpy,discount_amount_jpy,payment_kind,payment_status_text,user_confirmed_at,
      quote_id,policy_template_version_id,service_time_policy_version_id,cancellation_policy_version_id,
      accepted_locale,agreement_snapshot,agreement_accepted_at
    )
    select new.id,q.trip_id,q.product_revision_id,q.departure_id,q.departure_version,q.title,q.departs_at,
      q.meeting_point_template_id,q.meeting_name,q.meeting_address,q.meeting_instruction,q.meeting_latitude,q.meeting_longitude,
      q.seat_count,q.unit_price_jpy,q.base_fare_jpy,new.amount,q.cancellation_policy,q.cancellation_policy_version,
      q.commercial_terms,'captured',q.line_items,q.coupon_id,q.coupon_source_type,q.coupon_rules_version,q.discount_percent,
      nullif(q.discounted_seats,0),case when q.coupon_id is null then null else q.unit_price_jpy end,q.discount_amount_jpy,
      new.payment_kind,new.payment_status_text,coalesce(new.quote_confirmed_at,q.confirmed_at),q.id,
      q.policy_template_version_id,q.service_time_policy_version_id,q.cancellation_policy_version_id,
      q.accepted_locale,q.agreement_snapshot,q.agreement_accepted_at
    from public.order_quotes q where q.id=new.quote_id
    on conflict(order_id) do nothing;
  end if;
  return new;
end$$;

create or replace function public.operations_update_departure_v2(p_departure uuid,p_expected_version integer,p_departs_at timestamptz,p_ends_at timestamptz,p_price integer,p_capacity integer,p_sales_open timestamptz,p_sales_close timestamptz,p_status text,p_meeting_name text,p_meeting_address text,p_map_lat numeric,p_map_lng numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.departures%rowtype;committed integer;affected integer;changed boolean;meeting_changed boolean;
begin
 if not public.is_operations() then raise exception 'operations role required';end if;
 select * into item from public.departures where id=p_departure for update;
 if not found or item.schedule_version<>p_expected_version then raise exception 'departure version conflict';end if;
 select coalesce(sum(seats),0)::integer into committed from public.inventory_locks where departure_id=item.id and(status='committed' or(status='held' and expires_at>now()));
 select count(*)::integer into affected from public.orders where departure_id=item.id and status in('paid','confirmed');
 if p_capacity<committed or p_price<1 or p_ends_at<=p_departs_at or p_sales_open>=p_sales_close or p_sales_close>=p_departs_at or p_status not in('draft','open','closed','cancelled') or length(trim(coalesce(p_meeting_name,'')))<2 or length(trim(coalesce(p_meeting_address,'')))<5 or p_map_lat not between -90 and 90 or p_map_lng not between -180 and 180 then raise exception 'invalid departure update';end if;
 meeting_changed:=item.meeting_name is distinct from trim(p_meeting_name) or item.meeting_address is distinct from trim(p_meeting_address) or item.map_lat is distinct from p_map_lat or item.map_lng is distinct from p_map_lng;
 changed:=item.departs_at is distinct from p_departs_at or item.ends_at is distinct from p_ends_at or meeting_changed;
 update public.departures set departs_at=p_departs_at,ends_at=p_ends_at,seat_price_jpy=p_price,capacity=p_capacity,sales_open_at=p_sales_open,sales_close_at=p_sales_close,booking_closes_at=p_sales_close,status=p_status,meeting_name=trim(p_meeting_name),meeting_address=trim(p_meeting_address),map_lat=p_map_lat,map_lng=p_map_lng,meeting_point_template_id=case when meeting_changed then null else meeting_point_template_id end,meeting_instruction=case when meeting_changed then null else meeting_instruction end,schedule_version=schedule_version+1,updated_at=now() where id=item.id;
 insert into public.departure_change_audit(departure_id,actor_id,from_version,to_version,prior_values,new_values,affected_paid_orders) values(item.id,auth.uid(),item.schedule_version,item.schedule_version+1,to_jsonb(item),jsonb_build_object('departsAt',p_departs_at,'endsAt',p_ends_at,'price',p_price,'capacity',p_capacity,'salesOpenAt',p_sales_open,'salesCloseAt',p_sales_close,'status',p_status,'meetingName',trim(p_meeting_name),'meetingAddress',trim(p_meeting_address),'mapLat',p_map_lat,'mapLng',p_map_lng,'meetingTemplateDetached',meeting_changed),affected);
 if changed and affected>0 then
  insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
  select 'departure-rescheduled:'||item.id::text||':'||(item.schedule_version+1)::text||':'||o.id::text,'departure-rescheduled',o.account_id,o.id,true,jsonb_build_object('departureId',item.id,'priorDepartureAt',item.departs_at,'newDepartureAt',p_departs_at,'meetingName',trim(p_meeting_name),'meetingAddress',trim(p_meeting_address),'contractSnapshotUnchanged',true),'pending' from public.orders o where o.departure_id=item.id and o.status in('paid','confirmed') on conflict(event_id) do nothing;
 end if;
 return jsonb_build_object('newVersion',item.schedule_version+1,'affectedPaidOrders',affected,'notificationRequired',changed and affected>0);
end$$;

revoke all on function public.operations_list_meeting_point_templates(boolean),public.operations_create_meeting_point_template(text,text,numeric,numeric,text,boolean),public.operations_update_meeting_point_template(uuid,integer,text,text,numeric,numeric,text),public.operations_set_meeting_point_template_active(uuid,integer,boolean),public.operations_preview_departure_batch(uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,uuid,text,text,numeric,numeric,text),public.operations_create_departure_batch(uuid,uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,uuid,text,text,numeric,numeric,text) from public,anon;
revoke all on function public.lock_quote_meeting_snapshot(),public.capture_paid_order_snapshot() from public,anon,authenticated,service_role;
grant execute on function public.operations_list_meeting_point_templates(boolean),public.operations_create_meeting_point_template(text,text,numeric,numeric,text,boolean),public.operations_update_meeting_point_template(uuid,integer,text,text,numeric,numeric,text),public.operations_set_meeting_point_template_active(uuid,integer,boolean),public.operations_preview_departure_batch(uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,uuid,text,text,numeric,numeric,text),public.operations_create_departure_batch(uuid,uuid,date,date,integer[],time,integer,integer,integer,timestamptz,integer,uuid,text,text,numeric,numeric,text) to authenticated,service_role;

commit;
