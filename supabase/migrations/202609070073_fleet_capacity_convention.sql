begin;

-- Vehicle labels use legal physical seats including the driver. Inventory uses
-- passenger seats, so 7/10/14-seat vehicles sell at most 6/9/13 seats.
update public.vehicle_type_configs set active=false,updated_at=now()
where type_key in ('alphard-6','hiace-13','coaster-20','bus-55','vehicle-7');

insert into public.vehicle_type_configs(type_key,label,sellable_capacity,cost_units,active)
values
  ('vehicle-10','10座车（含司机，游客9席）',9,36,true),
  ('vehicle-14','14座车（含司机，游客13席）',13,44,true),
  ('vehicle-20-manual','20座以上车辆（手动派单）',19,60,false),
  ('large-bus-manual','大巴车（手动派单）',44,100,false)
on conflict(type_key) do update set
  label=excluded.label,
  sellable_capacity=excluded.sellable_capacity,
  cost_units=excluded.cost_units,
  active=true,
  updated_at=now();

commit;
