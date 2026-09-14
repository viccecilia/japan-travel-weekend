begin;

-- Reconcile the denormalized per-vehicle booked count from the authoritative
-- whole-order allocation table. Preserve orders, vehicle groups and history.
with authoritative_bookings as (
  select
    va.id,
    coalesce(sum(o.seat_count) filter(where o.status in('paid','confirmed')),0)::integer as booked
  from public.vehicle_assignments va
  left join public.vehicle_groups vg on vg.vehicle_assignment_id=va.id
  left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id
  left join public.orders o on o.id=vgo.order_id
  group by va.id
)
update public.vehicle_assignments va
set booked_seats=bookings.booked
from authoritative_bookings bookings
where bookings.id=va.id and va.booked_seats is distinct from bookings.booked;

commit;
