begin;

create or replace function public.operations_finalize_dispatch_departure(p_departure uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare finalized boolean;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  select public.finalize_dispatch_departure(p_departure) into finalized;
  insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,from_status,to_status,detail)
    select dt.id,auth.uid(),'fulfilment_bridge',dt.status,dt.status,jsonb_build_object('finalized',finalized,'departureId',p_departure)
    from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id
    where va.departure_id=p_departure order by dt.created_at limit 1;
  return finalized;
end$$;

create or replace function public.operations_confirm_dispatch_tasks(p_task_ids uuid[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer; v_departure uuid;
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if coalesce(array_length(p_task_ids,1),0)=0 then raise exception 'no dispatch tasks'; end if;
  insert into public.dispatch_task_audit(dispatch_task_id,actor_id,action,from_status,to_status,detail)
    select id,auth.uid(),'confirmed','draft','confirmed','{}' from public.dispatch_tasks where id=any(p_task_ids) and status='draft';
  update public.dispatch_tasks set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now() where id=any(p_task_ids) and status='draft';
  get diagnostics changed=row_count;
  if changed<>array_length(p_task_ids,1) then raise exception 'all tasks must be draft'; end if;
  update public.fleet_vehicles set status='assigned',updated_at=now() where id in(select fleet_vehicle_id from public.dispatch_tasks where id=any(p_task_ids));
  for v_departure in select distinct va.departure_id from public.dispatch_tasks dt join public.vehicle_assignments va on va.id=dt.vehicle_assignment_id where dt.id=any(p_task_ids)
  loop perform public.operations_finalize_dispatch_departure(v_departure); end loop;
  return changed;
end$$;

revoke all on function public.operations_finalize_dispatch_departure(uuid),public.operations_confirm_dispatch_tasks(uuid[]) from public,anon;
grant execute on function public.operations_finalize_dispatch_departure(uuid),public.operations_confirm_dispatch_tasks(uuid[]) to authenticated;

commit;
