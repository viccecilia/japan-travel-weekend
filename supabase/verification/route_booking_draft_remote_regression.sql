-- Remote TEST-project regression. The route fixture must use the fixed TEST slug below.
-- This transaction rolls back every booking draft it creates.
begin;

create temporary table test_booking_context (
  owner_id uuid,
  other_id uuid,
  operations_id uuid,
  departure_id uuid,
  draft_id uuid
) on commit drop;

insert into test_booking_context(owner_id,other_id,operations_id,departure_id)
select
  (select p.id from public.profiles p where p.role='passenger' order by p.created_at limit 1),
  (select p.id from public.profiles p where p.role='passenger' order by p.created_at offset 1 limit 1),
  (select p.id from public.profiles p where p.role='operations' order by p.created_at limit 1),
  d.id
from public.departures d
join public.trips t on t.id=d.trip_id
where t.slug='test-golden-path-remote-validation'
  and d.status='open'
  and d.departs_at>now()
limit 1;

do $$
begin
  if not exists(
    select 1 from test_booking_context c
    where c.owner_id is not null and c.other_id is not null
      and c.operations_id is not null and c.departure_id is not null
  ) then
    raise exception 'FAIL: required fictitious roles or TEST departure missing';
  end if;
end $$;

grant select,update on test_booking_context to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select c.owner_id::text from test_booking_context c),'true');
select set_config('request.jwt.claim.role','authenticated','true');

update test_booking_context c
set draft_id=public.save_own_booking_draft(
  c.departure_id,2,1,1,
  '{"name":"TEST passenger","phone":"TEST-NOT-A-PHONE","emergency":"TEST-EMERGENCY"}'::jsonb,
  '{"childSeat":{"quantity":1,"status":"确认中"},"stroller":{"quantity":1},"wheelchair":{"needed":true,"requiresAccessibleVehicle":true},"other":{"largeLuggage":1,"privateNote":"TEST PRIVATE NOTE"}}'::jsonb,
  'reviewing',true,true,'test-remote-draft-idempotency'
);

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.booking_drafts bd
  where bd.id=(select c.draft_id from test_booking_context c);
  if v_count<>1 then raise exception 'FAIL: owner cannot read own draft'; end if;
end $$;

select set_config('request.jwt.claim.sub',(select c.other_id::text from test_booking_context c),'true');
do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.booking_drafts bd
  where bd.id=(select c.draft_id from test_booking_context c);
  if v_count<>0 then raise exception 'FAIL: unrelated passenger can read draft'; end if;
end $$;

select set_config('request.jwt.claim.sub',(select c.operations_id::text from test_booking_context c),'true');
do $$
declare v_row record; v_text text;
begin
  select * into v_row
  from public.get_operations_booking_drafts() d
  where d.draft_id=(select c.draft_id from test_booking_context c);
  if v_row.draft_id is null or v_row.seat_impact<>4 or v_row.operational_review_status<>'reviewing' then
    raise exception 'FAIL: operations safe projection missing or incorrect';
  end if;
  v_text:=row_to_json(v_row)::text;
  if v_text like '%TEST-NOT-A-PHONE%' or v_text like '%TEST-EMERGENCY%' or v_text like '%TEST PRIVATE NOTE%' then
    raise exception 'FAIL: operations projection leaks private fields';
  end if;
end $$;

reset role;
select 'PASS: owner read, unrelated isolation and operations safe projection' as result;
rollback;
