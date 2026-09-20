begin;

-- Consolidates only the fail-closed authorization intent of the archived 0920/0970/0980 patches.
-- Return contracts and business queries are retained from the final registered 0001-0147 chain.

-- Preserves final definition from 202609120129_v11_vehicle_capacity_orders_and_ranges.sql
create or replace function public.get_operations_dashboard_departures(p_from date default ((now() at time zone 'Asia/Tokyo')::date-30),p_to date default ((now() at time zone 'Asia/Tokyo')::date+365))
returns table(id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,capacity integer,status text,meeting_name text,order_count bigint,booked_seats bigint,pending_orders bigint,gross_amount_jpy bigint,booking_closes_at timestamptz,chat_opens_at timestamptz,dispatch_planning_status text,requires_manual_review boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select d.id,t.title,d.departs_at,d.ends_at,d.capacity,d.status,d.meeting_name,count(o.id),coalesce(sum(case when o.status in('paid','confirmed') then o.seat_count else 0 end),0)::bigint,count(o.id) filter(where o.status='pending_payment'),coalesce(sum(case when o.status in('paid','confirmed') and o.currency='JPY' then o.amount else 0 end),0)::bigint,d.booking_closes_at,d.chat_opens_at,d.dispatch_planning_status,d.dispatch_planning_status='needs_manual_review'
 from public.departures d join public.trips t on t.id=d.trip_id left join public.orders o on o.departure_id=d.id where public.is_operations() and (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to group by d.id,t.title order by d.departs_at nulls last;
end;
$$;

-- Preserves final definition from 202609080074_single_role_staff_approval.sql
create or replace function public.get_operations_staff_applications()
returns table(id uuid,account_id uuid,email text,applicant_name text,requested_role text,status text,review_note text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select a.id,a.account_id,u.email::text,a.applicant_name,a.requested_role,a.status,a.review_note,a.created_at,a.updated_at
  from public.staff_account_applications a join auth.users u on u.id=a.account_id
  where public.is_operations()
  order by case a.status when 'pending' then 0 when 'needs_information' then 1 else 2 end,a.created_at;
end;
$$;

-- Preserves final definition from 202609080075_staff_leave_workflow.sql
create or replace function public.get_operations_staff_leave_requests()
returns table(id uuid,account_id uuid,email text,display_name text,starts_at timestamptz,ends_at timestamptz,reason text,status text,review_note text,reviewed_at timestamptz,conflicting_tasks bigint,created_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select l.id,l.account_id,u.email::text,p.display_name,l.starts_at,l.ends_at,l.reason,l.status,l.review_note,l.reviewed_at,
    (select count(*) from public.dispatch_tasks dt join public.driver_resources dr on dr.id=dt.driver_id where dr.account_id=l.account_id and dt.status in ('draft','confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress') and nullif(dt.payload->>'startsAt','')::timestamptz<l.ends_at and nullif(dt.payload->>'endsAt','')::timestamptz>l.starts_at),l.created_at
  from public.staff_leave_requests l join public.profiles p on p.id=l.account_id join auth.users u on u.id=l.account_id where public.is_operations() order by case l.status when 'pending' then 0 else 1 end,l.starts_at;
end;
$$;

-- Preserves final definition from 202609090091_product_revision_publication.sql
create or replace function public.get_operations_products()
returns table(id uuid,slug text,status text,catalog_version integer,published_revision integer,draft_revision integer,title text,content jsonb,hero_image_url text,gallery jsonb,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select t.id,t.slug,t.status,t.catalog_version,pub.revision_number,draft.revision_number,
    coalesce(draft.title,pub.title,t.title),coalesce(draft.content,pub.content,t.content),coalesce(draft.hero_image_url,pub.hero_image_url,t.hero_image_url),coalesce(draft.gallery,pub.gallery,t.gallery),t.updated_at
  from public.trips t left join public.product_revisions pub on pub.id=t.current_published_revision_id left join public.product_revisions draft on draft.id=t.current_draft_revision_id
  where public.is_operations() order by t.updated_at desc,t.slug;
end;
$$;

-- Preserves final definition from 202609140132_dispatch_plan_consistency.sql
create or replace function public.get_operations_daily_run_board(p_service_date date)
returns table(departure_id uuid,trip_title text,departs_at timestamptz,departure_status text,vehicle_group_id uuid,vehicle_label text,driver_name text,capacity integer,booked_seats bigint,arrived bigint,boarded bigint,journey_status text,current_stop text,open_incidents bigint,last_event_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select d.id,t.title,d.departs_at,d.status,vg.id,coalesce(fv.registration_identifier,va.vehicle_type||' #'||va.sequence),dr.display_name,coalesce(va.capacity,d.capacity),
    case when vg.id is null then coalesce(departure_bookings.seats,0) else coalesce(group_bookings.seats,0) end,
    coalesce(attendance.arrived,0),coalesce(attendance.boarded,0),
    case
      when js.updated_at is not null and js.updated_at<((d.departs_at at time zone 'Asia/Tokyo')::date::timestamp at time zone 'Asia/Tokyo') then 'data_inconsistent'
      else coalesce(js.status,'preparing')
    end,
    case
      when js.updated_at is not null and js.updated_at<((d.departs_at at time zone 'Asia/Tokyo')::date::timestamp at time zone 'Asia/Tokyo') then null
      else js.current_stop_name
    end,
    coalesce(incidents.open_count,0),events.last_event_at
  from public.departures d join public.trips t on t.id=d.trip_id
  left join public.vehicle_groups vg on vg.departure_id=d.id left join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id
  left join lateral(select dt.* from public.dispatch_tasks dt where dt.vehicle_assignment_id=va.id and dt.status not in ('draft','rejected','cancelled','failed') order by dt.updated_at desc limit 1) dt on true
  left join public.fleet_vehicles fv on fv.id=dt.fleet_vehicle_id left join public.driver_resources dr on dr.id=dt.driver_id left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
  left join lateral(select sum(o.seat_count)::bigint seats from public.orders o where o.departure_id=d.id and o.status in ('paid','confirmed')) departure_bookings on true
  left join lateral(select sum(o.seat_count)::bigint seats from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=vg.id and o.status in ('paid','confirmed')) group_bookings on true
  left join lateral(select count(distinct pc.passenger_id) filter(where pc.status in ('arrived','boarded'))::bigint arrived,count(distinct pc.passenger_id) filter(where pc.status='boarded')::bigint boarded from public.passenger_checkins pc join public.orders o on o.id=pc.order_id where pc.vehicle_group_id=vg.id and o.status in ('paid','confirmed')) attendance on true
  left join lateral(select count(*)::bigint open_count from public.operational_incidents oi where (oi.vehicle_group_id=vg.id or (oi.vehicle_group_id is null and oi.departure_id=d.id)) and oi.resolved_at is null) incidents on true
  left join lateral(select max(se.created_at) last_event_at from public.staff_execution_events se where se.vehicle_group_id=vg.id) events on true
  where public.is_operations() and (d.departs_at at time zone 'Asia/Tokyo')::date=p_service_date order by d.departs_at,va.sequence nulls first;
end;
$$;

-- Preserves final definition from 202609090096_product_merchandising.sql
create or replace function public.get_operations_merchandising() returns table(trip_id uuid,slug text,title text,featured_rank integer,campaign_key text,visible_from timestamptz,visible_until timestamptz,travel_from date,travel_until date,locale_readiness jsonb,version integer,updated_at timestamptz) language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select t.id,t.slug,t.title,m.featured_rank,m.campaign_key,m.visible_from,m.visible_until,m.travel_from,m.travel_until,m.locale_readiness,m.version,m.updated_at from public.trips t left join public.product_merchandising m on m.trip_id=t.id where public.is_operations() order by m.featured_rank nulls last,t.title;
end;
$$;

-- Preserves final definition from 202609100114_departure_reschedule.sql
create or replace function public.get_operations_editable_departures(p_from timestamptz default now()-interval '1 day',p_to timestamptz default now()+interval '365 days')
returns table(id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,seat_price_jpy integer,capacity integer,sales_open_at timestamptz,sales_close_at timestamptz,status text,schedule_version integer,committed_seats bigint,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,paid_orders bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select d.id,t.title,d.departs_at,d.ends_at,d.seat_price_jpy,d.capacity,d.sales_open_at,d.sales_close_at,d.status,d.schedule_version,
 coalesce(inv.committed_seats,0),d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,coalesce(ord.paid_orders,0)
 from public.departures d join public.trips t on t.id=d.trip_id
 left join lateral(select coalesce(sum(l.seats),0)::bigint committed_seats from public.inventory_locks l where l.departure_id=d.id and(l.status='committed' or(l.status='held' and l.expires_at>now()))) inv on true
 left join lateral(select count(*)::bigint paid_orders from public.orders o where o.departure_id=d.id and o.status in('paid','confirmed')) ord on true
 where public.is_operations() and d.departs_at between p_from and p_to order by d.departs_at;
end;
$$;

-- Preserves final definition from 202609090098_departure_edit_and_driver_statistics.sql
create or replace function public.get_operations_driver_statistics(p_from date,p_to date) returns table(driver_id uuid,driver_name text,assigned_runs bigint,completed_runs bigint,open_incidents bigint,last_location_at timestamptz) language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select dr.id,dr.display_name,count(distinct dt.id) filter(where d.id is not null),count(distinct dt.id) filter(where d.id is not null and js.status='completed'),count(distinct oi.id) filter(where d.id is not null and oi.resolved_at is null),max(lp.recorded_at) from public.driver_resources dr left join public.dispatch_tasks dt on dt.driver_id=dr.id left join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id left join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id left join public.departures d on d.id=vg.departure_id and (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id left join public.operational_incidents oi on oi.vehicle_group_id=vg.id left join lateral(select recorded_at from public.driver_location_points where vehicle_group_id=vg.id order by recorded_at desc limit 1) lp on true where public.is_operations() and dr.status<>'suspended' group by dr.id,dr.display_name order by 4 desc,3 desc,dr.display_name;
end;
$$;

-- Preserves final definition from 202609090099_publication_scope_and_release_manifest.sql
create or replace function public.get_operations_release_status()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return (select case when public.is_operations() then jsonb_build_object(
    'requiredDatabaseMigration','202609090099',
    'latestManifest',(select to_jsonb(m) - 'recorded_by' from public.release_manifests m order by m.deployed_at desc limit 1),
    'functionChecksums',jsonb_build_object(
      'list_public_product_catalog',md5(pg_get_functiondef('public.list_public_product_catalog()'::regprocedure)),
      'list_sellable_departures',md5(pg_get_functiondef('public.list_sellable_departures()'::regprocedure)),
      'is_departure_sellable',md5(pg_get_functiondef('public.is_departure_sellable(uuid,timestamp with time zone)'::regprocedure))
    )
  ) else null end);
end;
$$;

-- Preserves final definition from 202609090107_transport_aggregation_and_location_lifecycle.sql
create or replace function public.get_operations_driver_transport_statistics(p_from date,p_to date)
returns table(driver_id uuid,driver_name text,service_role text,assigned_runs bigint,completed_runs bigint,sold_passengers bigint,assigned_passengers bigint,boarded_passengers bigint,completed_passengers bigint,available_seats bigint,load_factor numeric,open_incidents bigint,last_location_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query with current_tasks as (
    select distinct on (va.id) dt.id,dt.driver_id,va.capacity,vg.id vehicle_group_id,d.id departure_id,js.status journey_status
    from public.vehicle_assignments va join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id join public.departures d on d.id=vg.departure_id
    join public.dispatch_tasks dt on dt.vehicle_assignment_id=va.id left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
    where (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to and dt.status not in ('draft','rejected','cancelled','failed')
    order by va.id,case when dt.status='completed' then 0 else 1 end,dt.updated_at desc
  ),metrics as (
    select a.*,coalesce(s.sold,0) sold,coalesce(g.assigned,0) assigned,coalesce(b.boarded,0) boarded,coalesce(i.open_count,0) open_count,l.recorded_at
    from current_tasks a
    left join lateral(select count(distinct p.id)::bigint sold from public.orders o join public.passengers p on p.order_id=o.id where o.departure_id=a.departure_id and o.status in ('paid','confirmed')) s on true
    left join lateral(select count(distinct p.id)::bigint assigned from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id join public.passengers p on p.order_id=o.id where vgo.vehicle_group_id=a.vehicle_group_id and o.status in ('paid','confirmed')) g on true
    left join lateral(select count(distinct pc.passenger_id)::bigint boarded from public.passenger_checkins pc join public.passenger_checkin_events e on e.checkin_id=pc.id and e.status='boarded' join public.orders o on o.id=pc.order_id where pc.vehicle_group_id=a.vehicle_group_id and o.status in ('paid','confirmed')) b on true
    left join lateral(select count(*)::bigint open_count from public.operational_incidents oi where oi.vehicle_group_id=a.vehicle_group_id and oi.resolved_at is null) i on true
    left join lateral(select max(p.recorded_at) recorded_at from public.driver_location_points p join public.driver_resources drx on drx.account_id=p.staff_id where p.vehicle_group_id=a.vehicle_group_id and drx.id=a.driver_id) l on true
  )
  select dr.id,dr.display_name,dr.service_role::text,count(m.id),count(m.id) filter(where m.journey_status='completed'),coalesce(sum(m.sold),0)::bigint,coalesce(sum(m.assigned),0)::bigint,coalesce(sum(m.boarded),0)::bigint,coalesce(sum(m.boarded) filter(where m.journey_status='completed'),0)::bigint,coalesce(sum(m.capacity),0),case when coalesce(sum(m.capacity),0)>0 then round(100.0*sum(m.boarded)/sum(m.capacity),1) else 0 end,coalesce(sum(m.open_count),0)::bigint,max(m.recorded_at)
  from public.driver_resources dr left join metrics m on m.driver_id=dr.id
  where public.is_operations() group by dr.id,dr.display_name,dr.service_role order by 5 desc,4 desc,dr.display_name;
end;
$$;

-- Preserves final definition from 202609100113_product_lifecycle.sql
create or replace function public.get_operations_product_revisions(p_trip uuid)
returns table(revision_number integer,state text,title text,created_at timestamptz,published_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select r.revision_number,r.state,r.title,r.created_at,r.published_at from public.product_revisions r
  where r.trip_id=p_trip and public.is_operations() order by r.revision_number desc;
end;
$$;

-- Preserves final definition from 202609110125_operations_tokyo_dashboard_metrics.sql
create or replace function public.get_operations_payment_metrics(p_service_date date)
returns table(paid_orders bigint,paid_amount_jpy bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select count(*)::bigint,coalesce(sum(o.amount) filter(where o.currency='JPY'),0)::bigint
  from public.orders o
  where public.is_operations() and exists(
    select 1 from public.payment_events pe where pe.order_id=o.id and pe.status='succeeded'
      and (pe.event_created_at at time zone 'Asia/Tokyo')::date=p_service_date
  );
end;
$$;

-- Preserves final definition from 202609140146_vip_charter_quote_requests.sql
create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;

  return query select '20260919100111'::text,now() where public.is_operations();
end$$;

-- Preserves final definition from 202609120129_v11_vehicle_capacity_orders_and_ranges.sql
create or replace function public.get_operations_orders(p_from date default null,p_to date default null,p_status text default null,p_order uuid default null)
returns table(order_id uuid,created_at timestamptz,order_status text,departure_id uuid,trip_title text,departs_at timestamptz,passenger_count bigint,seat_count integer,amount_jpy integer,gross_amount_jpy integer,discount_amount_jpy integer,referral_code text,vehicle_group_id uuid,vehicle_label text,driver_name text,refund_status text,refunded_amount_jpy integer)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select o.id,o.created_at,o.status::text,d.id,t.title,d.departs_at,count(distinct p.id),o.seat_count,coalesce(o.amount,0),coalesce(o.gross_amount,o.amount,0),coalesce(o.discount_amount,0),rr.referral_code,vg.id,va.vehicle_label,dr.display_name,ocr.status,coalesce(o.refunded_amount_jpy,0)
 from public.orders o join public.departures d on d.id=o.departure_id join public.trips t on t.id=d.trip_id left join public.passengers p on p.order_id=o.id left join public.referral_relationships rr on rr.invitee_account_id=o.account_id left join public.vehicle_group_orders vgo on vgo.order_id=o.id left join public.vehicle_groups vg on vg.id=vgo.vehicle_group_id left join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id left join public.staff_assignments sa on sa.vehicle_group_id=vg.id and sa.role='driver' left join public.driver_resources dr on dr.account_id=sa.staff_id left join lateral(select r.status::text from public.order_cancellation_requests r where r.order_id=o.id order by r.requested_at desc limit 1) ocr on true
 where public.is_operations() and (p_from is null or (d.departs_at at time zone 'Asia/Tokyo')::date>=p_from) and (p_to is null or (d.departs_at at time zone 'Asia/Tokyo')::date<=p_to) and (p_status is null or o.status::text=p_status) and (p_order is null or o.id=p_order)
 group by o.id,d.id,t.id,rr.referral_code,vg.id,va.id,dr.id,ocr.status order by o.created_at desc;
end;
$$;

-- Preserves final definition from 202609140136_confirmed_vehicle_group_reassignment.sql
create or replace function public.get_operations_departure_calendar(p_from date,p_to date)
returns table(
  id uuid,trip_id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,
  seat_price_jpy integer,capacity integer,sales_open_at timestamptz,sales_close_at timestamptz,
  booking_closes_at timestamptz,status text,schedule_version integer,paid_passengers bigint,
  paid_orders bigint,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,
  dispatch_planning_status text,vehicles jsonb
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select d.id,d.trip_id,t.title,d.departs_at,d.ends_at,d.seat_price_jpy,d.capacity,
    d.sales_open_at,d.sales_close_at,d.booking_closes_at,d.status,d.schedule_version,
    coalesce(ord.paid_passengers,0),coalesce(ord.paid_orders,0),d.meeting_name,
    d.meeting_address,d.map_lat,d.map_lng,d.dispatch_planning_status,
    coalesce(assignments.vehicles,'[]'::jsonb)
  from public.departures d join public.trips t on t.id=d.trip_id
  left join lateral(
    select coalesce(sum(o.seat_count),0)::bigint paid_passengers,count(*)::bigint paid_orders
    from public.orders o where o.departure_id=d.id and o.status in('paid','confirmed')
  ) ord on true
  left join lateral(
    select jsonb_agg(jsonb_build_object(
      'assignmentId',va.id,'sequence',va.sequence,'plannedPassengers',va.planned_passengers,
      'bookedPassengers',coalesce(va.booked_seats,0),'assignmentCapacity',va.capacity,
      'vehicleType',va.vehicle_type,'vehicleLabel',va.vehicle_label,'taskId',task.id,
      'taskStatus',task.status,'driverId',task.driver_id,'vehicleId',task.fleet_vehicle_id,
      'startsAt',task.payload->>'startsAt','endsAt',task.payload->>'endsAt',
      'vehicleCode',fv.registration_identifier,'vehicleModel',fv.model_name,
      'sellableCapacity',fv.sellable_capacity,'driverName',dr.display_name,
      'vehicleGroupId',vg.id,'roomId',tr.id,'groupVersion',coalesce(vg.operations_version,1),
      'journeyStatus',js.status
    ) order by va.sequence) vehicles
    from public.vehicle_assignments va
    left join lateral(select dt.* from public.dispatch_tasks dt where dt.vehicle_assignment_id=va.id order by dt.created_at desc,dt.id desc limit 1) task on true
    left join public.fleet_vehicles fv on fv.id=task.fleet_vehicle_id
    left join public.driver_resources dr on dr.id=task.driver_id
    left join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id
    left join public.trip_rooms tr on tr.vehicle_group_id=vg.id
    left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
    where va.departure_id=d.id
  ) assignments on true
  where public.is_operations() and (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to
  order by d.departs_at,d.id;
end;
$$;

-- Preserves final definition from 202609140136_confirmed_vehicle_group_reassignment.sql
create or replace function public.get_operations_vehicle_group_changes(p_vehicle_group uuid)
returns table(
  id uuid,vehicle_group_id uuid,expected_group_version integer,status text,reason text,
  prior_vehicle_id uuid,prior_vehicle_code text,requested_vehicle_id uuid,requested_vehicle_code text,
  prior_driver_id uuid,prior_driver_name text,requested_driver_id uuid,requested_driver_name text,
  requested_at timestamptz,applied_at timestamptz,applied_group_version integer,
  notification_status text,notification_attempts integer,notification_last_error text
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select r.id,r.vehicle_group_id,r.expected_group_version,r.status,r.reason,
    r.prior_vehicle_id,r.prior_vehicle_code,r.requested_vehicle_id,r.requested_vehicle_code,
    r.prior_driver_id,r.prior_driver_name,r.requested_driver_id,r.requested_driver_name,
    r.requested_at,r.applied_at,r.applied_group_version,
    r.notification_status,r.notification_attempts,r.notification_last_error
  from public.vehicle_group_change_requests r
  where public.is_operations() and r.vehicle_group_id=p_vehicle_group
  order by r.requested_at desc,r.id desc;
end;
$$;

-- Preserves final definition from 202609140146_vip_charter_quote_requests.sql
create or replace function public.get_operations_vip_charter_requests()
returns table(request_id uuid,account_id uuid,departure_id uuid,trip_id uuid,trip_title text,service_date date,passenger_count integer,vehicle_type text,base_seat_price_jpy integer,pricing_factor integer,pickup_fee_jpy integer,total_jpy integer,pickup_ward text,pickup_address text,return_address text,special_requests text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then raise exception 'operations only' using errcode='42501'; end if;
  return query select r.id,r.account_id,r.departure_id,r.trip_id,t.title,r.service_date,r.passenger_count,r.vehicle_type,r.base_seat_price_jpy,r.pricing_factor,r.pickup_fee_jpy,r.total_jpy,r.pickup_ward,r.pickup_address,r.return_address,r.special_requests,r.status,r.created_at
  from public.vip_charter_requests r join public.trips t on t.id=r.trip_id where public.is_operations() order by r.created_at desc;
end;
$$;

commit;
