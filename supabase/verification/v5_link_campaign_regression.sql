-- Disposable remote test only. All fictional writes are rolled back.
begin;
do $$
declare v_owner uuid;v_ops uuid;v_trip uuid;v_departure uuid;v_order uuid;v_assignment uuid;v_group uuid;v_campaign uuid;v_submission uuid;v_prefix text:='v5-e-'||txid_current()::text||'-';v_result integer;
begin
  select p.id into v_owner from public.profiles p where p.role='passenger' limit 1;select p.id into v_ops from public.profiles p where p.role='operations' limit 1;
  if v_owner is null or v_ops is null then raise exception 'SETUP FAIL: passenger and operations profiles required'; end if;
  insert into public.trips(slug,title,status) values(v_prefix||'trip','V5 campaign regression','draft') returning id into v_trip;
  insert into public.departures(trip_id,departs_at,ends_at,capacity,status,seat_price_jpy) values(v_trip,now()-interval '2 days',now()-interval '1 day',6,'completed',7000) returning id into v_departure;
  insert into public.orders(account_id,departure_id,idempotency_key,seat_count,status,amount) values(v_owner,v_departure,v_prefix||'order',1,'confirmed',7000) returning id into v_order;
  insert into public.vehicle_assignments(departure_id,sequence,vehicle_type,capacity) values(v_departure,1,'test-6',6) returning id into v_assignment;
  insert into public.vehicle_groups(departure_id,vehicle_assignment_id) values(v_departure,v_assignment) returning id into v_group;
  insert into public.vehicle_group_orders(vehicle_group_id,order_id) values(v_group,v_order);
  insert into public.vehicle_group_journey_state(vehicle_group_id,status,updated_by,completed_at) values(v_group,'completed',v_ops,now()-interval '1 day');
  insert into public.link_campaigns(campaign_month,status,scoring_rules,official_handles,opens_at,closes_at) values(date_trunc('month',now())::date,'open',jsonb_build_object('method','manual_verified_metrics'),jsonb_build_object('tiktok','@official-test'),now()-interval '1 day',now()+interval '1 day') returning id into v_campaign;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
  begin perform public.submit_travel_share_link(v_campaign,v_order,'tiktok','https://127.0.0.1/private','@traveler','share-link-v1','{}');raise exception 'FAIL unsafe link accepted';exception when others then if sqlerrm='FAIL unsafe link accepted' then raise; end if;end;
  v_submission:=public.submit_travel_share_link(v_campaign,v_order,'tiktok','https://www.tiktok.com/@traveler/video/123','@traveler','share-link-v1',jsonb_build_object('repost',true));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ops,'role','authenticated')::text,true);
  if not public.operations_verify_travel_share_link(v_submission,'valid',true,true,true,jsonb_build_object('likes',123),now(),'Fictional manual verification') then raise exception 'FAIL verification'; end if;
  update public.link_campaigns set status='verifying' where id=v_campaign;
  v_result:=public.operations_finalize_link_campaign(v_campaign,jsonb_build_array(jsonb_build_object('rank',1,'submissionId',v_submission)));
  if v_result<>1 then raise exception 'FAIL ranking finalization'; end if;
  v_result:=public.operations_finalize_link_campaign(v_campaign,jsonb_build_array(jsonb_build_object('rank',1,'submissionId',v_submission)));
  if (select count(*) from public.discount_coupons c where c.source_type='link_campaign' and c.source_id=v_campaign::text||':1')<>1 then raise exception 'FAIL duplicate campaign coupon'; end if;
  if (select c.discount_percent from public.discount_coupons c where c.source_type='link_campaign' and c.source_id=v_campaign::text||':1')<>100 then raise exception 'FAIL rank reward percentage'; end if;
  raise notice 'PASS V5 link-only campaign validates URL, authorization evidence and idempotent award';
end$$;
rollback;
