begin;

-- Starting the meeting is a shared duty for every active driver or guide
-- assigned to the vehicle group. Boarding and passenger check-in remain
-- guiding-only capabilities.
create or replace function public.record_staff_execution_event(
  p_vehicle_group uuid,
  p_event_type text,
  p_detail jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_room uuid;
  v_content text;
  v_order record;
begin
  if not coalesce(public.staff_assignment_allows(p_vehicle_group,'shared',auth.uid()),false) then
    raise exception 'assignment capability denied' using errcode='42501';
  end if;
  if auth.uid() is null or not(public.is_operations() or public.is_group_staff(p_vehicle_group)) then
    raise exception 'assigned staff only';
  end if;
  if p_event_type not in ('task_accepted','meeting_started','delay_reported','incident_reported','support_requested')
    or length(trim(p_idempotency_key))<8 then
    raise exception 'invalid event';
  end if;
  if p_event_type in ('delay_reported','incident_reported','support_requested')
    and length(trim(coalesce(p_detail->>'detail',''))) not between 3 and 800 then
    raise exception 'detail required';
  end if;

  select id into v_id
  from public.staff_execution_events
  where actor_id=auth.uid() and idempotency_key=p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.staff_execution_events(vehicle_group_id,actor_id,event_type,detail,idempotency_key)
  values(p_vehicle_group,auth.uid(),p_event_type,coalesce(p_detail,'{}'::jsonb),p_idempotency_key)
  returning id into v_id;

  if p_event_type='meeting_started' then
    update public.vehicle_group_meeting_state
    set status='active',updated_at=now()
    where vehicle_group_id=p_vehicle_group and status='scheduled';
    if not found then raise exception 'meeting point must be confirmed first'; end if;

    insert into public.vehicle_group_journey_state(vehicle_group_id,status,current_stop_name,updated_by)
    select p_vehicle_group,'meeting',m.meeting_name,auth.uid()
    from public.vehicle_group_meeting_state m where m.vehicle_group_id=p_vehicle_group
    on conflict(vehicle_group_id) do update set
      status='meeting',current_stop_name=excluded.current_stop_name,
      revision=public.vehicle_group_journey_state.revision+1,
      updated_by=excluded.updated_by,updated_at=now();

    select id into v_room from public.trip_rooms
    where vehicle_group_id=p_vehicle_group and status='open';
    if v_room is null then raise exception 'trip room is not open'; end if;
    v_content:='司导已发起集合，请到达集合点后点击“我已到达”。';
    insert into public.trip_room_messages(trip_room_id,author_id,content,important,kind,original_content,template_key)
    values(v_room,auth.uid(),v_content,true,'text',v_content,'vehicle_arrived');

    for v_order in
      select o.id,o.account_id
      from public.vehicle_group_orders vgo
      join public.orders o on o.id=vgo.order_id
      where vgo.vehicle_group_id=p_vehicle_group and o.status in ('paid','confirmed')
    loop
      insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status)
      values(
        'meeting-started:'||v_id::text||':'||v_order.id::text,
        'meeting-started',v_order.account_id,v_order.id,true,
        jsonb_build_object('vehicleGroupId',p_vehicle_group,'message',v_content),'pending'
      ) on conflict(event_id) do nothing;
    end loop;
  end if;
  return v_id;
end$$;

revoke all on function public.record_staff_execution_event(uuid,text,jsonb,text) from public,anon;
grant execute on function public.record_staff_execution_event(uuid,text,jsonb,text) to authenticated,service_role;

-- A narrow Operations-only repair for legacy staff records created before
-- staff applications became mandatory. It never changes roles or resources,
-- refuses accounts that already have an application, and writes the same
-- approval audit event as the normal review workflow.
create function public.operations_recover_legacy_staff_access(
  p_driver uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_resource public.driver_resources%rowtype;
  v_profile public.profiles%rowtype;
  v_application uuid;
begin
  if auth.uid() is null or not coalesce(public.is_operations(),false) then
    raise exception 'operations role required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'recovery reason required' using errcode='22023';
  end if;

  select * into v_resource from public.driver_resources where id=p_driver for update;
  if not found or v_resource.account_id is null or v_resource.status<>'available' then
    raise exception 'available linked staff resource required' using errcode='22023';
  end if;
  select * into v_profile from public.profiles where id=v_resource.account_id for update;
  if not found or v_profile.role not in ('driver','guide') then
    raise exception 'legacy staff profile required' using errcode='22023';
  end if;
  if (v_profile.role='driver' and v_resource.service_role not in ('driver','driver_guide'))
    or (v_profile.role='guide' and v_resource.service_role not in ('guide','driver_guide')) then
    raise exception 'staff role and resource duty do not match' using errcode='22023';
  end if;
  if exists(select 1 from public.staff_account_applications where account_id=v_resource.account_id) then
    raise exception 'existing staff application must use normal review' using errcode='22023';
  end if;

  insert into public.staff_account_applications(
    account_id,requested_role,status,applicant_name,review_note,reviewed_by,reviewed_at
  ) values(
    v_resource.account_id,v_profile.role::text,'approved',
    coalesce(nullif(trim(v_resource.display_name),''),nullif(trim(v_profile.display_name),''),'工作人员'),
    trim(p_reason),auth.uid(),now()
  ) returning id into v_application;

  insert into public.account_audit_events(actor_id,action,target_type,target_id,metadata)
  values(
    auth.uid(),'staff_application_approved','staff_application',v_application,
    jsonb_build_object(
      'accountId',v_resource.account_id,
      'requestedRole',v_profile.role::text,
      'source','legacy_staff_access_recovery',
      'driverResourceId',v_resource.id,
      'reason',trim(p_reason)
    )
  );
  return v_application;
end$$;

revoke all on function public.operations_recover_legacy_staff_access(uuid,text) from public,anon;
grant execute on function public.operations_recover_legacy_staff_access(uuid,text) to authenticated,service_role;

commit;
