begin;
create or replace function public.tm_internal_reason(p_account uuid,p_order uuid) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_order record;
begin
 select o.id,o.account_id,o.status,o.is_test_order,j.status as journey_status into v_order from public.orders o
 left join public.vehicle_group_orders vgo on vgo.order_id=o.id
 left join public.vehicle_group_journey_state j on j.vehicle_group_id=vgo.vehicle_group_id where o.id=p_order;
 if not found then return 'TRIP_NOT_FOUND'; end if;
 if v_order.account_id<>p_account then return 'TRIP_MISMATCH'; end if;
 if coalesce(v_order.is_test_order,false) then return 'TEST_ORDER'; end if;
 if v_order.status='refunded' then return 'ORDER_REFUNDED'; end if;
 if v_order.status not in ('paid','confirmed') then return 'ORDER_UNPAID'; end if;
 if v_order.journey_status is distinct from 'completed' then return 'TRIP_NOT_COMPLETED'; end if;
 return null;
end $$;
revoke all on function public.tm_internal_reason(uuid,uuid) from public,anon;
grant execute on function public.tm_internal_reason(uuid,uuid) to authenticated,service_role;
commit;
