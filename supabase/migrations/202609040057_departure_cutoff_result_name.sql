begin;

drop function if exists public.process_due_departure_cutoffs(timestamptz);
create function public.process_due_departure_cutoffs(p_now timestamptz default now())
returns table(processed_departure_id uuid,passenger_count integer,result text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record;seats integer;
begin
  update public.trip_rooms set status='open' where status='frozen' and opens_at is not null and opens_at<=p_now;
  for item in select d.id from public.departures d where d.status='open' and d.booking_closes_at is not null and d.booking_closes_at<=p_now order by d.booking_closes_at for update skip locked
  loop
    select coalesce(sum(o.seat_count),0)::integer into seats from public.orders o where o.departure_id=item.id and o.status in ('paid','confirmed');
    update public.departures set status='closed',dispatch_planning_status=case when seats<4 then 'needs_manual_review' else 'ready_for_planning' end,updated_at=p_now where id=item.id;
    if seats<4 then
      insert into public.departure_operations_alerts(departure_id,kind,passenger_count,threshold,detail)
      values(item.id,'low_booking_count',seats,4,jsonb_build_object('reason','cutoff_reached_below_review_threshold','automaticCancellation',false,'occurredAt',p_now))
      on conflict(departure_id,kind) do update set passenger_count=excluded.passenger_count,detail=excluded.detail,updated_at=p_now;
      processed_departure_id:=item.id;passenger_count:=seats;result:='needs_manual_review';
    else
      processed_departure_id:=item.id;passenger_count:=seats;result:='ready_for_planning';
    end if;
    return next;
  end loop;
end$$;

revoke all on function public.process_due_departure_cutoffs(timestamptz) from public,anon,authenticated;
grant execute on function public.process_due_departure_cutoffs(timestamptz) to service_role;

commit;
