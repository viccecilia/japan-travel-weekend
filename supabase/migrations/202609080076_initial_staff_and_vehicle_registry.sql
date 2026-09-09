begin;

alter table public.driver_resources add column if not exists employee_code text unique check(employee_code is null or length(trim(employee_code)) between 2 and 40);
alter table public.driver_resources add column if not exists employment_base text check(employment_base is null or length(trim(employment_base)) between 1 and 80);
alter table public.driver_resources add column if not exists private_phone text check(private_phone is null or length(trim(private_phone)) between 5 and 40);

alter table public.fleet_vehicles add column if not exists model_name text check(model_name is null or length(trim(model_name)) between 1 and 120);
alter table public.fleet_vehicles add column if not exists inspection_required boolean not null default false;
alter table public.fleet_vehicles add column if not exists operations_note text not null default '' check(length(operations_note)<=500);

insert into public.vehicle_type_configs(type_key,label,sellable_capacity,cost_units,active)
values ('unclassified-manual','座位数待确认（禁止自动派单）',1,999,false)
on conflict(type_key) do update set label=excluded.label,active=false,updated_at=now();

insert into public.driver_resources(employee_code,display_name,employment_base,private_phone,languages,status,service_role)
values
 ('12225','姚博','本社','090-6058-7891',array['zh-CN','ja'],'unavailable','driver_guide'),
 ('12232','李力','本社','080-4238-1388',array['zh-CN','ja'],'unavailable','driver_guide'),
 ('12266','万強','本社','070-2303-6669',array['zh-CN','ja'],'unavailable','driver_guide'),
 ('12257','夏天忻','本社','080-4034-1775',array['zh-CN','ja'],'unavailable','driver_guide'),
 ('12256','姜小涛','本社','070-8508-9919',array['zh-CN','ja'],'unavailable','driver_guide'),
 ('12293','呂雲龍','本社','080-2952-0888',array['zh-CN','ja'],'unavailable','driver_guide')
on conflict(employee_code) do update set display_name=excluded.display_name,employment_base=excluded.employment_base,private_phone=excluded.private_phone,updated_at=now();

insert into public.fleet_vehicles(registration_identifier,vehicle_type_key,status,public_color,model_name,inspection_required,operations_note)
values
 ('なにわ330 い 7707','unclassified-manual','inactive','黑','40系アルファード',false,'座位数确认后启用'),
 ('なにわ300あ7577','unclassified-manual','inactive','黑','30系アルファード',false,'座位数确认后启用'),
 ('なにわ300あ7286','unclassified-manual','maintenance','黑','30系アルファード',true,'车检完成并确认座位数后启用'),
 ('なにわ300あ7312','unclassified-manual','inactive','银','ハイエース',false,'座位数确认后启用'),
 ('なにわ300あ7621','unclassified-manual','maintenance','白','ハイエース',true,'车检完成并确认座位数后启用'),
 ('なにわ300あ7634','unclassified-manual','maintenance','白','ハイエース',true,'车检完成并确认座位数后启用')
on conflict(registration_identifier) do update set public_color=excluded.public_color,model_name=excluded.model_name,inspection_required=excluded.inspection_required,status=excluded.status,operations_note=excluded.operations_note,updated_at=now();

commit;
