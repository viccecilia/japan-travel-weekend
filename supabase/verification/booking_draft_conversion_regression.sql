-- Disposable remote test only. All fictional fixture writes are rolled back.
begin;
do $$
declare v_account uuid;v_trip uuid;v_departure uuid;v_draft uuid;v_result record;v_retry record;v_key text:='draft-convert-'||txid_current()::text;v_status text;v_link uuid;v_hold_status text;v_manifest_count integer;v_child_seats integer;v_assignment uuid;v_group uuid;v_room uuid;v_work_status text;v_group_count integer;v_booked integer;v_payment_applied boolean;v_boarding uuid;v_credential_revoked timestamptz;v_share_stopped timestamptz;
begin
  select id into v_account from public.profiles order by created_at limit 1;
  if v_account is null then raise exception 'SETUP FAIL: fictional profile required'; end if;
  insert into public.trips(slug,title,status,content) values(v_key,'Draft conversion regression','published',jsonb_build_object(
    'itinerary',jsonb_build_array('test'),'included',jsonb_build_array('test'),'excluded',jsonb_build_array('test'),
    'description','Fictional regression route content only.','childPolicy','Fictional child policy.','luggagePolicy','Fictional luggage policy.',
    'accessibilityInfo','Fictional accessibility info.','mealInfo','Fictional meal information.','weatherPolicy','Fictional weather policy.',
    'cancellationPolicyVersion','test-v1')) returning id into v_trip;
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,meeting_name,meeting_address,map_lat,map_lng,seat_price_jpy,sales_open_at,sales_close_at,minimum_guests)
    values(v_trip,now()+interval '10 days',now()+interval '10 days 10 hours',4,'open','测试集合点','测试集合地址 1-2-3',34.68,135.50,100,now()-interval '1 day',now()+interval '9 days',1) returning id into v_departure;
  insert into public.booking_drafts(account_id,departure_id,idempotency_key,adults,children,infants,seat_impact,passenger_private,assistance_private,assistance_summary,operational_review_status,accepted_cancellation,accepted_terms,expires_at)
    values(v_account,v_departure,v_key||'-draft',1,1,0,2,jsonb_build_object('name','虚构乘客','phone','000','emergency','虚构联系人'),jsonb_build_object('childSeat',jsonb_build_object('quantity',0,'status','不需要')),'{}','not_requested',true,true,now()+interval '1 day') returning id into v_draft;
  begin
    perform public.reserve_inventory_from_draft(v_draft,v_account,v_departure,1,v_key||'-checkout',now()+interval '15 minutes');
    raise exception 'FAIL mismatched seat count accepted';
  exception when others then if sqlerrm='FAIL mismatched seat count accepted' then raise; end if; end;
  select * into v_result from public.reserve_inventory_from_draft(v_draft,v_account,v_departure,2,v_key||'-checkout',now()+interval '15 minutes');
  select status,converted_order_id into v_status,v_link from public.booking_drafts where id=v_draft;
  if v_status<>'converted' or v_link<>v_result.order_id then raise exception 'FAIL draft was not linked atomically'; end if;
  select * into v_retry from public.reserve_inventory_from_draft(v_draft,v_account,v_departure,2,v_key||'-checkout',now()+interval '14 minutes');
  if v_retry.order_id<>v_result.order_id or v_retry.hold_id<>v_result.hold_id then raise exception 'FAIL idempotent conversion changed order'; end if;
  if not public.cancel_pending_order(v_result.order_id,v_account) then raise exception 'FAIL pending order cancellation'; end if;
  select status,converted_order_id into v_status,v_link from public.booking_drafts where id=v_draft;
  select status into v_hold_status from public.inventory_locks where id=v_result.hold_id;
  if v_status<>'payment_not_started' or v_link is not null or v_hold_status<>'released' then raise exception 'FAIL compensation did not reopen draft'; end if;
  select * into v_result from public.reserve_inventory_from_draft(v_draft,v_account,v_departure,2,v_key||'-paid',now()+interval '15 minutes');
  insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,vehicle_label,capacity,booked_seats)
    values(v_departure,1,'alphard-6','TEST fulfilment vehicle',6,0) returning id into v_assignment;
  insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(v_departure,v_assignment) returning id into v_group;
  insert into public.trip_rooms(vehicle_group_id,opens_at,status) values(v_group,now()+interval '1 day','frozen') returning id into v_room;
  select public.apply_payment_event(v_key||'-event',v_result.order_id,'succeeded',now(),'fictional-payload-digest') into v_payment_applied;
  if not v_payment_applied then raise exception 'FAIL payment event was not applied'; end if;
  select count(*)::integer into v_manifest_count from public.passengers where order_id=v_result.order_id;
  select child_seat_count into v_child_seats from public.passenger_assistance_staff_projection where order_id=v_result.order_id;
  if v_manifest_count<>2 then raise exception 'FAIL paid passenger manifest count'; end if;
  if v_child_seats<>0 then raise exception 'FAIL assistance projection mismatch'; end if;
  select count(*)::integer into v_group_count from public.vehicle_group_orders where order_id=v_result.order_id and vehicle_group_id=v_group;
  select status into v_work_status from public.fulfilment_work_items where order_id=v_result.order_id and kind='paid_order_ready';
  select booked_seats into v_booked from public.vehicle_assignments where id=v_assignment;
  select id,status into v_boarding,v_hold_status from public.boardings where order_id=v_result.order_id;
  if v_group_count<>1 or v_work_status<>'completed' or v_booked<>2 or v_boarding is null or v_hold_status<>'not_issued' then raise exception 'FAIL paid order was not made fulfilment-ready'; end if;
  if public.apply_payment_event(v_key||'-event',v_result.order_id,'succeeded',now(),'fictional-payload-digest') then raise exception 'FAIL duplicate payment event accepted'; end if;
  select count(*)::integer into v_group_count from public.vehicle_group_orders where order_id=v_result.order_id;
  if v_group_count<>1 then raise exception 'FAIL duplicate payment changed vehicle allocation'; end if;
  update public.boardings set status='issued',updated_at=now() where id=v_boarding;
  insert into public.boarding_credentials(boarding_id,vehicle_group_id,token_digest,expires_at)
    values(v_boarding,v_group,decode(repeat('ab',32),'hex'),now()+interval '1 day');
  insert into public.location_shares(vehicle_group_id,subject_id,scope,started_at,expires_at)
    values(v_group,v_account,'assigned_staff_only',now(),now()+interval '15 minutes');
  if not public.apply_payment_event(v_key||'-refund',v_result.order_id,'refunded',now()+interval '1 second','fictional-refund-digest') then raise exception 'FAIL refund event was not applied'; end if;
  select count(*)::integer into v_group_count from public.vehicle_group_orders where order_id=v_result.order_id;
  select booked_seats into v_booked from public.vehicle_assignments where id=v_assignment;
  select status into v_status from public.orders where id=v_result.order_id;
  select status into v_hold_status from public.boardings where id=v_boarding;
  select revoked_at into v_credential_revoked from public.boarding_credentials where boarding_id=v_boarding;
  select stopped_at into v_share_stopped from public.location_shares where vehicle_group_id=v_group and subject_id=v_account;
  if v_status<>'refunded' or v_group_count<>0 or v_booked<>0 or v_hold_status<>'revoked' or v_credential_revoked is null or v_share_stopped is null then raise exception 'FAIL refunded order retained fulfilment access, credential, location share or capacity'; end if;
  raise notice 'PASS booking draft conversion regression';
end$$;
rollback;
