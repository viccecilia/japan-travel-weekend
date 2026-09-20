begin;

create or replace function public.get_operations_products()
returns table(id uuid,slug text,status text,catalog_version integer,published_revision integer,draft_revision integer,title text,content jsonb,hero_image_url text,gallery jsonb,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select t.id,t.slug,t.status,t.catalog_version,pub.revision_number,draft.revision_number,
      coalesce(draft.title,pub.title,t.title),coalesce(draft.content,pub.content,t.content),coalesce(draft.hero_image_url,pub.hero_image_url,t.hero_image_url),coalesce(draft.gallery,pub.gallery,t.gallery),t.updated_at
    from public.trips t
    left join public.product_revisions pub on pub.id=t.current_published_revision_id
    left join public.product_revisions draft on draft.id=t.current_draft_revision_id
    order by t.updated_at desc,t.slug;
end;
$$;

create or replace function public.get_operations_product_revisions(p_trip uuid)
returns table(revision_number integer,state text,title text,created_at timestamptz,published_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select r.revision_number,r.state,r.title,r.created_at,r.published_at
    from public.product_revisions r
    where r.trip_id=p_trip
    order by r.revision_number desc;
end;
$$;

create or replace function public.get_operations_editable_departures(p_from timestamptz default now()-interval '1 day',p_to timestamptz default now()+interval '365 days')
returns table(id uuid,trip_title text,departs_at timestamptz,ends_at timestamptz,seat_price_jpy integer,capacity integer,sales_open_at timestamptz,sales_close_at timestamptz,status text,schedule_version integer,committed_seats bigint,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,paid_orders bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select d.id,t.title,d.departs_at,d.ends_at,d.seat_price_jpy,d.capacity,d.sales_open_at,d.sales_close_at,d.status,d.schedule_version,
      coalesce(inv.committed_seats,0),d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,coalesce(ord.paid_orders,0)
    from public.departures d
    join public.trips t on t.id=d.trip_id
    left join lateral(
      select coalesce(sum(l.seats),0)::bigint committed_seats
      from public.inventory_locks l
      where l.departure_id=d.id and (l.status='committed' or (l.status='held' and l.expires_at>now()))
    ) inv on true
    left join lateral(
      select count(*)::bigint paid_orders
      from public.orders o
      where o.departure_id=d.id and o.status in('paid','confirmed')
    ) ord on true
    where d.departs_at between p_from and p_to
    order by d.departs_at;
end;
$$;

create or replace function public.get_operations_driver_transport_statistics(p_from date,p_to date)
returns table(driver_id uuid,driver_name text,service_role text,assigned_runs bigint,completed_runs bigint,sold_passengers bigint,assigned_passengers bigint,boarded_passengers bigint,completed_passengers bigint,available_seats bigint,load_factor numeric,open_incidents bigint,last_location_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    with current_tasks as (
      select distinct on (va.id) dt.id,dt.driver_id,va.capacity,vg.id vehicle_group_id,js.status journey_status
      from public.vehicle_assignments va
      join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id
      join public.departures d on d.id=vg.departure_id
      join public.dispatch_tasks dt on dt.vehicle_assignment_id=va.id
      left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id
      where (d.departs_at at time zone 'Asia/Tokyo')::date between p_from and p_to
        and dt.status not in ('draft','rejected','cancelled','failed')
      order by va.id,dt.updated_at desc
    ), metrics as (
      select a.*,coalesce(s.people,0) people,coalesce(b.people,0) boarded
      from current_tasks a
      left join lateral(
        select count(distinct p.id) people
        from public.vehicle_group_orders vgo
        join public.orders o on o.id=vgo.order_id
        join public.passengers p on p.order_id=o.id
        where vgo.vehicle_group_id=a.vehicle_group_id and o.status in ('paid','confirmed')
      ) s on true
      left join lateral(
        select count(distinct pc.passenger_id) people
        from public.passenger_checkins pc
        join public.orders o on o.id=pc.order_id
        where pc.vehicle_group_id=a.vehicle_group_id and pc.status='boarded' and o.status in ('paid','confirmed')
      ) b on true
    )
    select dr.id,dr.display_name,dr.service_role::text,count(distinct m.id),count(distinct m.id) filter(where m.journey_status='completed'),
      coalesce(sum(m.people),0),coalesce(sum(m.people),0),coalesce(sum(m.boarded),0),coalesce(sum(m.boarded) filter(where m.journey_status='completed'),
      0),coalesce(sum(m.capacity),0),case when coalesce(sum(m.capacity),0)>0 then round(100.0*sum(m.boarded)/sum(m.capacity),1) else 0 end,
      count(distinct oi.id) filter(where oi.resolved_at is null),
      max(lp.recorded_at)
    from public.driver_resources dr
    left join metrics m on m.driver_id=dr.id
    left join public.operational_incidents oi on oi.vehicle_group_id=m.vehicle_group_id
    left join lateral(
      select max(p.recorded_at) recorded_at
      from public.driver_location_points p
      where p.vehicle_group_id=m.vehicle_group_id and p.staff_id=dr.account_id
    ) lp on true
    group by dr.id,dr.display_name,dr.service_role
    order by 5 desc,4 desc,dr.display_name;
end;
$$;

create or replace function public.get_operations_merchandising()
returns table(trip_id uuid,slug text,title text,featured_rank integer,campaign_key text,visible_from timestamptz,visible_until timestamptz,travel_from date,travel_until date,locale_readiness jsonb,version integer,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select t.id,t.slug,t.title,m.featured_rank,m.campaign_key,m.visible_from,m.visible_until,m.travel_from,m.travel_until,m.locale_readiness,m.version,m.updated_at
    from public.trips t
    left join public.product_merchandising m on m.trip_id=t.id
    order by m.featured_rank nulls last,t.title;
end;
$$;

create or replace function public.get_operations_staff_applications()
returns table(id uuid,account_id uuid,email text,applicant_name text,requested_role text,status text,review_note text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select a.id,a.account_id,u.email,a.applicant_name,a.requested_role,a.status,a.review_note,a.created_at,a.updated_at
    from public.staff_account_applications a
    join auth.users u on u.id=a.account_id
    order by case a.status when 'pending' then 0 when 'needs_information' then 1 else 2 end,a.created_at;
end;
$$;

create or replace function public.get_operations_staff_leave_requests()
returns table(id uuid,account_id uuid,email text,display_name text,starts_at timestamptz,ends_at timestamptz,reason text,status text,review_note text,reviewed_at timestamptz,conflicting_tasks bigint,created_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select l.id,l.account_id,u.email,p.display_name,l.starts_at,l.ends_at,l.reason,l.status,l.review_note,l.reviewed_at,
      (select count(*)
       from public.dispatch_tasks dt
       join public.driver_resources dr on dr.id=dt.driver_id
       where dr.account_id=l.account_id
         and dt.status in ('draft','confirmed','sent','delivered','viewed','accepted','en_route','arrived','passengers_onboard','in_progress')
         and nullif(dt.payload->>'startsAt','')::timestamptz<l.ends_at
         and nullif(dt.payload->>'endsAt','')::timestamptz>l.starts_at),
      l.created_at
    from public.staff_leave_requests l
    join public.profiles p on p.id=l.account_id
    join auth.users u on u.id=l.account_id
    order by case l.status when 'pending' then 0 else 1 end,l.starts_at;
end;
$$;

create or replace function public.get_operations_payment_metrics(p_service_date date)
returns table(paid_orders bigint,paid_amount_jpy bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query
    select count(*)::bigint,coalesce(sum(o.amount) filter(where o.currency='JPY'),0)::bigint
    from public.orders o
    where exists(
      select 1
      from public.payment_events pe
      where pe.order_id=o.id
        and pe.status='succeeded'
        and (pe.event_created_at at time zone 'Asia/Tokyo')::date=p_service_date
    );
end;
$$;

create or replace function public.get_operations_system_release_info()
returns table(migration_version text,database_time timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then
    raise exception 'operations only';
  end if;

  return query select '202609150970'::text,now();
end;
$$;

commit;
