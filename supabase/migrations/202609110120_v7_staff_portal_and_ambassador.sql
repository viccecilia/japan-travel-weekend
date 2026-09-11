begin;

create or replace function public.sync_staff_ambassador_qualification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.status='approved' then
  insert into public.ambassador_qualifications(account_id,status,source,approved_at,updated_at)
  values(new.account_id,'approved','staff_approval',coalesce(new.reviewed_at,now()),now())
  on conflict(account_id) do update set status='approved',source='staff_approval',approved_at=coalesce(public.ambassador_qualifications.approved_at,excluded.approved_at),updated_at=now();
 elsif new.status='suspended' then
  update public.ambassador_qualifications set status='suspended',review_note='staff account suspended',updated_at=now() where account_id=new.account_id;
 end if;return new;
end$$;
drop trigger if exists sync_staff_ambassador_qualification_trigger on public.staff_account_applications;
create trigger sync_staff_ambassador_qualification_trigger after insert or update of status on public.staff_account_applications for each row execute function public.sync_staff_ambassador_qualification();

create or replace function public.apply_for_ambassador(p_note text default '') returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$declare v_id uuid;begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='passenger') then raise exception 'passenger account required';end if;
 insert into public.ambassador_qualifications(account_id,status,source,review_note) values(auth.uid(),'pending','passenger_application',left(trim(coalesce(p_note,'')),500))
 on conflict(account_id) do update set status=case when public.ambassador_qualifications.status in('rejected','suspended') then 'pending' else public.ambassador_qualifications.status end,source='passenger_application',review_note=excluded.review_note,applied_at=now(),updated_at=now()
 returning account_id into v_id;return v_id;
end$$;

create or replace function public.operations_review_ambassador(p_account uuid,p_decision text,p_note text default '') returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if not public.is_operations() or p_decision not in('approved','rejected','suspended') then raise exception 'operations role required';end if;
 update public.ambassador_qualifications set status=p_decision,reviewed_by=auth.uid(),review_note=left(trim(coalesce(p_note,'')),500),approved_at=case when p_decision='approved' then now() else approved_at end,updated_at=now() where account_id=p_account;
 return found;
end$$;

drop function if exists public.get_staff_portal_tasks();
create function public.get_staff_portal_tasks()
returns table(staff_assignment_id uuid,assignment_role text,vehicle_group_id uuid,room_id uuid,room_status text,departure_id uuid,trip_title text,departs_at timestamptz,chat_opens_at timestamptz,meeting_name text,meeting_address text,map_lat numeric,map_lng numeric,vehicle_sequence integer,vehicle_type text,vehicle_label text,vehicle_capacity integer,booked_seats integer,passenger_count integer,boarded_count integer,journey_status text)
language sql stable security definer set search_path=public,pg_temp as $$
 select sa.id,sa.role::text,vg.id,tr.id,tr.status,d.id,t.title,d.departs_at,d.chat_opens_at,d.meeting_name,d.meeting_address,d.map_lat,d.map_lng,va.sequence,va.vehicle_type,va.vehicle_label,va.capacity,
 coalesce((select sum(o2.seat_count) from public.vehicle_group_orders vgo2 join public.orders o2 on o2.id=vgo2.order_id where vgo2.vehicle_group_id=vg.id and o2.status in('paid','confirmed')),0)::integer,
 count(distinct p.id)filter(where o.status in('paid','confirmed'))::integer,count(distinct p.id)filter(where o.status in('paid','confirmed')and pc.status='boarded')::integer,coalesce(js.status,'pending')
 from public.staff_assignments sa join public.vehicle_groups vg on vg.id=sa.vehicle_group_id join public.vehicle_assignments va on va.id=vg.vehicle_assignment_id join public.departures d on d.id=vg.departure_id join public.trips t on t.id=d.trip_id
 left join public.trip_rooms tr on tr.vehicle_group_id=vg.id left join public.vehicle_group_journey_state js on js.vehicle_group_id=vg.id left join public.vehicle_group_orders vgo on vgo.vehicle_group_id=vg.id left join public.orders o on o.id=vgo.order_id left join public.passengers p on p.order_id=o.id left join public.passenger_checkins pc on pc.passenger_id=p.id
 where sa.staff_id=auth.uid() and public.is_group_staff(vg.id) group by sa.id,vg.id,tr.id,d.id,t.id,va.id,js.status order by d.departs_at nulls last,va.sequence
$$;

create or replace function public.get_own_cash_commission_summary() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('qualificationStatus',coalesce((select status from public.ambassador_qualifications where account_id=auth.uid()),'not_applied'),'pendingJpy',coalesce(sum(amount_jpy)filter(where status='pending'),0),'availableJpy',coalesce(sum(amount_jpy)filter(where status='available'),0),'lockedJpy',coalesce(sum(amount_jpy)filter(where status='locked'),0),'paidJpy',coalesce(sum(amount_jpy)filter(where status='paid'),0),'recoveryDueJpy',coalesce(sum(greatest(coalesce(original_amount_jpy,amount_jpy)-amount_jpy,0))filter(where status='recovery_due'),0),'entries',coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceOrderId',source_order_id,'basisAmountJpy',basis_amount_jpy,'commissionPercent',commission_percent,'amountJpy',amount_jpy,'status',status,'unlockedAt',unlocked_at)order by created_at desc),'[]'::jsonb),'payouts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'weekStart',week_start,'amountJpy',amount_jpy,'status',status,'requestedAt',requested_at)order by requested_at desc)from public.commission_payout_requests where account_id=auth.uid()),'[]'::jsonb)) from public.cash_commission_entries where beneficiary_account_id=auth.uid()
$$;

revoke all on function public.sync_staff_ambassador_qualification(),public.apply_for_ambassador(text),public.operations_review_ambassador(uuid,text,text),public.get_staff_portal_tasks() from public,anon;
grant execute on function public.apply_for_ambassador(text),public.get_staff_portal_tasks(),public.get_own_cash_commission_summary() to authenticated;
grant execute on function public.operations_review_ambassador(uuid,text,text) to authenticated,service_role;

commit;
