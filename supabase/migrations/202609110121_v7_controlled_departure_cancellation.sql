begin;
alter table public.notification_outbox drop constraint if exists notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check(event_type in('order-confirmed','bank-transfer-pending','meeting-updated','trip-room-opened','departure-reminder','departure-delayed','boarding-completed','checkin-reminder','passenger-contact-escalation','meeting-started','trip-progress','trip-completed','free-time-started','refund-completed','departure-rescheduled','departure-cancelled'));
create or replace function public.guard_controlled_departure_cancellation() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin if new.status='cancelled' and old.status is distinct from new.status and coalesce(current_setting('app.controlled_departure_cancel',true),'')<>'1' then raise exception 'use controlled departure cancellation';end if;return new;end$$;
drop trigger if exists guard_controlled_departure_cancellation_trigger on public.departures;
create trigger guard_controlled_departure_cancellation_trigger before update of status on public.departures for each row execute function public.guard_controlled_departure_cancellation();
create or replace function public.operations_cancel_departure(p_departure uuid,p_expected_version integer,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.departures%rowtype;affected integer;created_requests integer;new_version integer;
begin
 if not public.is_operations() or length(trim(coalesce(p_reason,'')))<5 then raise exception 'operations reason required';end if;
 select * into d from public.departures where id=p_departure for update;if not found or d.schedule_version<>p_expected_version then raise exception 'departure version conflict';end if;
 if d.status='cancelled' then return jsonb_build_object('newVersion',d.schedule_version,'affectedPaidOrders',0,'refundRequestsCreated',0,'replayed',true);end if;
 if d.status='completed' or d.departs_at<=now() then raise exception 'started or completed departure cannot use this flow';end if;
 select count(*) into affected from public.orders where departure_id=d.id and status in('paid','confirmed');perform set_config('app.controlled_departure_cancel','1',true);
 update public.departures set status='cancelled',schedule_version=schedule_version+1,updated_at=now() where id=d.id returning schedule_version into new_version;
 insert into public.departure_change_audit(departure_id,actor_id,from_version,to_version,prior_values,new_values,affected_paid_orders) values(d.id,auth.uid(),d.schedule_version,new_version,to_jsonb(d),jsonb_build_object('status','cancelled','reason',trim(p_reason)),affected);
 insert into public.order_cancellation_requests(order_id,account_id,reason_code,customer_note,status,refund_percent,estimated_refund_amount,operations_note)
 select o.id,o.account_id,'other','运营方取消班次','requested',100,coalesce(o.amount,0),trim(p_reason) from public.orders o where o.departure_id=d.id and o.status in('paid','confirmed') and not exists(select 1 from public.order_cancellation_requests r where r.order_id=o.id and r.status in('requested','reviewing','refund_prepared','refund_processing','manual_refund_required','provider_result_unknown'));
 get diagnostics created_requests=row_count;update public.trip_rooms set status='frozen' where vehicle_group_id in(select id from public.vehicle_groups where departure_id=d.id) and status='open';
 insert into public.notification_outbox(event_id,event_type,recipient_id,order_id,necessary,payload,status) select 'departure-cancelled:'||d.id||':'||new_version||':'||o.id,'departure-cancelled',o.account_id,o.id,true,jsonb_build_object('departureId',d.id,'reason',trim(p_reason),'refundReviewRequired',true,'contractSnapshotUnchanged',true),'pending' from public.orders o where o.departure_id=d.id and o.status in('paid','confirmed') on conflict(event_id) do nothing;
 return jsonb_build_object('newVersion',new_version,'affectedPaidOrders',affected,'refundRequestsCreated',created_requests,'replayed',false);
end$$;
revoke all on function public.guard_controlled_departure_cancellation(),public.operations_cancel_departure(uuid,integer,text) from public,anon;
grant execute on function public.operations_cancel_departure(uuid,integer,text) to authenticated,service_role;
commit;
