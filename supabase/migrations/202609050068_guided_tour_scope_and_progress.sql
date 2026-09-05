begin;
drop policy if exists guided_assignments_scope on public.vehicle_group_guided_tours;
create policy guided_assignments_scope on public.vehicle_group_guided_tours for select to authenticated using(
  public.is_operations() or public.is_group_staff(vehicle_group_id) or exists(
    select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id
    where vgo.vehicle_group_id=public.vehicle_group_guided_tours.vehicle_group_id and o.account_id=auth.uid() and o.status in ('paid','confirmed')
  )
);
create or replace function public.save_own_guided_tour_progress(p_assignment uuid,p_branch_key text,p_completed_node_keys text[],p_last_acknowledged_node_key text)
returns public.guided_tour_progress language plpgsql security definer set search_path=public,pg_temp as $$
declare v_assignment public.vehicle_group_guided_tours%rowtype;v_result public.guided_tour_progress%rowtype;
begin
  if auth.uid() is null or p_branch_key not in ('meal-first','sightseeing-first') or cardinality(coalesce(p_completed_node_keys,'{}'))>100 then raise exception 'invalid guided progress';end if;
  select * into v_assignment from public.vehicle_group_guided_tours a where a.id=p_assignment and exists(
    select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=a.vehicle_group_id and o.account_id=auth.uid() and o.status in ('paid','confirmed')
  );
  if v_assignment.id is null then raise exception 'guided tour access denied';end if;
  if exists(select 1 from unnest(coalesce(p_completed_node_keys,'{}')) k where not exists(select 1 from public.guided_tour_nodes n where n.plan_id=v_assignment.plan_id and n.node_key=k)) then raise exception 'unknown guided node';end if;
  insert into public.guided_tour_progress(assignment_id,account_id,branch_key,completed_node_keys,last_acknowledged_node_key,updated_at)
  values(p_assignment,auth.uid(),p_branch_key,coalesce(p_completed_node_keys,'{}'),nullif(trim(coalesce(p_last_acknowledged_node_key,'')),''),now())
  on conflict(assignment_id,account_id) do update set branch_key=excluded.branch_key,completed_node_keys=excluded.completed_node_keys,last_acknowledged_node_key=excluded.last_acknowledged_node_key,updated_at=now() returning * into v_result;
  return v_result;
end$$;
revoke all on function public.save_own_guided_tour_progress(uuid,text,text[],text) from public,anon;grant execute on function public.save_own_guided_tour_progress(uuid,text,text[],text) to authenticated,service_role;
commit;
