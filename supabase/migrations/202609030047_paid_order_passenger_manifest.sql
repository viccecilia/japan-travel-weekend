begin;

alter table public.passengers add column if not exists source_index integer;
alter table public.passengers drop constraint if exists passengers_passenger_type_check;
alter table public.passengers add constraint passengers_passenger_type_check check(passenger_type in ('adult','child','infant'));
create unique index if not exists passengers_order_source_index_key on public.passengers(order_id,source_index) where source_index is not null;

create or replace function public.materialize_paid_order_manifest(p_order uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order public.orders%rowtype;v_draft public.booking_drafts%rowtype;v_count integer;
begin
  select * into v_order from public.orders where id=p_order for update;
  if v_order.id is null or v_order.status not in ('paid','confirmed') then return 0; end if;
  select * into v_draft from public.booking_drafts where converted_order_id=p_order;
  if v_draft.id is null then return 0; end if;
  if v_draft.seat_impact<>v_order.seat_count then raise exception 'paid manifest seat mismatch'; end if;

  insert into public.passengers(order_id,display_name,passenger_type,source_index)
  select p_order,
    case when i=1 then left(v_draft.passenger_private->>'name',100) else '同行成人 '||i end,
    'adult',i from generate_series(1,v_draft.adults) i
  on conflict(order_id,source_index) where source_index is not null do nothing;
  insert into public.passengers(order_id,display_name,passenger_type,source_index)
  select p_order,'儿童 '||i,'child',v_draft.adults+i from generate_series(1,v_draft.children) i
  on conflict(order_id,source_index) where source_index is not null do nothing;
  insert into public.passengers(order_id,display_name,passenger_type,source_index)
  select p_order,'婴儿 '||i,'infant',v_draft.adults+v_draft.children+i from generate_series(1,v_draft.infants) i
  on conflict(order_id,source_index) where source_index is not null do nothing;

  insert into public.passenger_assistance_staff_projection(order_id,vehicle_space_required,child_seat_count,wheelchair_type,accessible_vehicle_required,lift_required,staff_assistance_required,large_luggage_count,service_dog,operational_note)
  values(p_order,
    coalesce((v_draft.assistance_summary->>'wheelchair')::boolean,false) or coalesce((v_draft.assistance_summary->>'strollerCount')::integer,0)>0 or coalesce((v_draft.assistance_summary->>'largeLuggage')::integer,0)>0,
    coalesce((v_draft.assistance_summary->>'childSeatCount')::integer,0),nullif(v_draft.assistance_private#>>'{wheelchair,type}',''),
    coalesce((v_draft.assistance_summary->>'accessibleVehicle')::boolean,false),coalesce((v_draft.assistance_summary->>'lift')::boolean,false),coalesce((v_draft.assistance_summary->>'staffAssistance')::boolean,false),
    coalesce((v_draft.assistance_summary->>'largeLuggage')::integer,0),coalesce((v_draft.assistance_summary->>'serviceDog')::boolean,false),'审核状态：'||v_draft.operational_review_status)
  on conflict(order_id) do update set vehicle_space_required=excluded.vehicle_space_required,child_seat_count=excluded.child_seat_count,wheelchair_type=excluded.wheelchair_type,accessible_vehicle_required=excluded.accessible_vehicle_required,lift_required=excluded.lift_required,staff_assistance_required=excluded.staff_assistance_required,large_luggage_count=excluded.large_luggage_count,service_dog=excluded.service_dog,operational_note=excluded.operational_note,updated_at=now();
  select count(*)::integer into v_count from public.passengers where order_id=p_order;
  if v_count<>v_order.seat_count then raise exception 'paid manifest count mismatch'; end if;
  return v_count;
end$$;

create or replace function public.materialize_manifest_on_paid_order()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.materialize_paid_order_manifest(new.id);return new;end$$;
drop trigger if exists materialize_manifest_on_paid_order_trigger on public.orders;
create trigger materialize_manifest_on_paid_order_trigger after update of status on public.orders for each row when(new.status in ('paid','confirmed') and old.status is distinct from new.status) execute function public.materialize_manifest_on_paid_order();

revoke all on function public.materialize_paid_order_manifest(uuid),public.materialize_manifest_on_paid_order() from public,anon,authenticated;
grant execute on function public.materialize_paid_order_manifest(uuid) to service_role;
revoke all on function public.materialize_manifest_on_paid_order() from service_role;

commit;
