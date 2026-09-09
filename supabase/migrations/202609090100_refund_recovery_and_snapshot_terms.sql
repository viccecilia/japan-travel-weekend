begin;

-- Fail visibly if historical data already contains two live refund attempts for
-- one request. An operator must reconcile those records before this safeguard
-- can be installed; the migration never guesses which financial record wins.
do $$begin
  if exists(
    select 1 from public.refund_operations
    where status in ('prepared','submitted','awaiting_manual_refund','provider_result_unknown')
    group by cancellation_request_id having count(*)>1
  ) then raise exception 'multiple active refund operations require reconciliation'; end if;
end$$;
create unique index if not exists refund_operations_one_active_per_request
  on public.refund_operations(cancellation_request_id)
  where status in ('prepared','submitted','awaiting_manual_refund','provider_result_unknown');

create or replace function public.operations_prepare_refund(p_request uuid,p_actor uuid,p_client_request_key text,p_channel text)
returns table(operation_id uuid,provider_idempotency_key text,operation_status text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare req public.order_cancellation_requests%rowtype;op public.refund_operations%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if length(trim(coalesce(p_client_request_key,''))) not between 8 and 100 or p_channel not in ('stripe','manual','none') then raise exception 'invalid refund operation'; end if;
  if not exists(select 1 from public.profiles where id=p_actor and role='operations') then raise exception 'operations only'; end if;
  select * into req from public.order_cancellation_requests where id=p_request for update;
  if not found then raise exception 'cancellation request unavailable'; end if;

  -- Resume the one live operation before validating the request's derived
  -- status. This makes refresh, response loss and a second operator converge.
  select * into op from public.refund_operations
  where cancellation_request_id=p_request
    and status in ('prepared','submitted','awaiting_manual_refund','provider_result_unknown')
  order by created_at limit 1 for update;
  if found then
    if op.channel<>p_channel or op.requested_amount<>req.estimated_refund_amount then raise exception 'refund operation already active'; end if;
    return query select op.id,op.provider_idempotency_key,op.status;
    return;
  end if;

  select * into op from public.refund_operations
  where cancellation_request_id=p_request and client_request_key=trim(p_client_request_key);
  if found then
    if op.channel<>p_channel or op.requested_amount<>req.estimated_refund_amount then raise exception 'refund idempotency mismatch'; end if;
    return query select op.id,op.provider_idempotency_key,op.status;
    return;
  end if;

  if req.status not in ('requested','reviewing','refund_prepared','refund_processing','manual_refund_required','provider_result_unknown') then raise exception 'cancellation request unavailable'; end if;
  insert into public.refund_operations(cancellation_request_id,order_id,actor_id,client_request_key,provider_idempotency_key,channel,requested_amount,status)
  values(req.id,req.order_id,p_actor,trim(p_client_request_key),'refund:'||gen_random_uuid()::text,p_channel,req.estimated_refund_amount,case when p_channel='manual' then 'awaiting_manual_refund' else 'prepared' end)
  returning * into op;
  update public.order_cancellation_requests set status=case when p_channel='manual' then 'manual_refund_required' else 'refund_prepared' end,reviewed_by=p_actor,reviewed_at=coalesce(reviewed_at,now()),updated_at=now() where id=req.id;
  return query select op.id,op.provider_idempotency_key,op.status;
end$$;

alter table public.order_snapshots add column if not exists cancellation_policy_version text;
alter table public.order_snapshots add column if not exists commercial_terms jsonb;
alter table public.order_snapshots add column if not exists source_kind text not null default 'captured'
  check(source_kind in ('captured','legacy_unknown'));

create or replace function public.capture_paid_order_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    insert into public.order_snapshots(order_id,trip_id,product_revision_id,departure_id,departure_version,title,departs_at,meeting_name,meeting_address,seat_count,unit_price_jpy,gross_amount_jpy,paid_amount_jpy,cancellation_policy,cancellation_policy_version,commercial_terms,source_kind)
    select new.id,d.trip_id,new.quoted_product_revision_id,d.id,coalesce(new.quoted_departure_version,d.schedule_version),coalesce(r.title,t.title),d.departs_at,d.meeting_name,d.meeting_address,new.seat_count,coalesce(new.quoted_unit_price_jpy,d.seat_price_jpy),coalesce(new.quoted_gross_amount_jpy,d.seat_price_jpy*new.seat_count),coalesce(new.amount,new.quoted_gross_amount_jpy,d.seat_price_jpy*new.seat_count),coalesce(r.content,t.content)->>'cancellationPolicy',coalesce(r.content,t.content)->>'cancellationPolicyVersion',jsonb_build_object(
      'currency',d.currency,'taxIncluded',d.tax_included,'childPriceJpy',d.child_price_jpy,'infantPriceJpy',d.infant_price_jpy,
      'included',coalesce(r.content,t.content)->'included','excluded',coalesce(r.content,t.content)->'excluded',
      'childPolicy',coalesce(r.content,t.content)->>'childPolicy','luggagePolicy',coalesce(r.content,t.content)->>'luggagePolicy',
      'weatherPolicy',coalesce(r.content,t.content)->>'weatherPolicy','mealInfo',coalesce(r.content,t.content)->>'mealInfo'
    ),'captured'
    from public.departures d join public.trips t on t.id=d.trip_id left join public.product_revisions r on r.id=new.quoted_product_revision_id where d.id=new.departure_id
    on conflict(order_id) do nothing;
  end if;
  return new;
end$$;

update public.order_snapshots set source_kind='legacy_unknown'
where cancellation_policy_version is null and commercial_terms is null;

revoke all on function public.operations_prepare_refund(uuid,uuid,text,text),public.capture_paid_order_snapshot() from public,anon,authenticated;
revoke all on function public.capture_paid_order_snapshot() from service_role;
grant execute on function public.operations_prepare_refund(uuid,uuid,text,text) to service_role;

commit;
