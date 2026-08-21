alter type public.order_status add value if not exists 'payment_review';
begin;

alter table public.orders add column if not exists payment_intent_id text unique;
alter table public.orders add column if not exists payment_review_reason text;

create table public.passenger_assistance_staff_projection (
  order_id uuid primary key references public.orders(id) on delete cascade,
  vehicle_space_required boolean not null default false,
  child_seat_count integer not null default 0 check(child_seat_count>=0),
  wheelchair_type text,
  transfer_required boolean not null default false,
  accessible_vehicle_required boolean not null default false,
  lift_required boolean not null default false,
  staff_assistance_required boolean not null default false,
  large_luggage_count integer not null default 0 check(large_luggage_count>=0),
  service_dog boolean not null default false,
  operational_note text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.passenger_assistance_staff_projection enable row level security;
create policy assistance_projection_owner_ops_staff on public.passenger_assistance_staff_projection for select to authenticated using (
  public.is_order_owner(order_id) or public.is_operations() or exists (
    select 1 from public.vehicle_group_orders vgo join public.staff_assignments sa on sa.vehicle_group_id=vgo.vehicle_group_id
    where vgo.order_id=passenger_assistance_staff_projection.order_id and sa.staff_id=auth.uid()
  )
);

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.profiles(id,display_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''),'passenger'); return new; end$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_auth_user();

create or replace function public.update_own_profile(p_display_name text) returns public.profiles language plpgsql security invoker set search_path=public as $$declare result public.profiles; begin update profiles set display_name=left(coalesce(p_display_name,''),100),updated_at=now() where id=auth.uid() returning * into result; return result; end$$;

revoke all on all tables in schema public from anon,authenticated;
grant select on public.trips,public.departures to anon,authenticated;
grant select on public.profiles,public.orders,public.passengers,public.passenger_assistance,public.inventory_locks,public.vehicle_assignments,public.vehicle_groups,public.vehicle_group_orders,public.staff_assignments,public.trip_rooms,public.trip_room_messages,public.location_shares,public.boardings,public.payment_events,public.passenger_assistance_staff_projection to authenticated;
grant all on all tables in schema public to service_role;
revoke update(role) on public.profiles from anon,authenticated;
grant execute on function public.update_own_profile(text) to authenticated;
revoke all on function public.handle_new_auth_user() from public,anon,authenticated;
grant execute on function public.reserve_inventory(uuid,uuid,integer,text,timestamptz),public.apply_payment_event(text,uuid,public.payment_status,timestamptz,text),public.release_expired_inventory(),public.cancel_pending_order(uuid,uuid) to service_role;

create policy vehicle_group_private_receive on realtime.messages for select to authenticated using (
  realtime.topic() like 'private:vehicle-group:%' and exists (
    select 1 from public.vehicle_groups vg where 'private:vehicle-group:'||vg.id::text=realtime.topic() and (
      public.is_group_staff(vg.id) or public.is_operations() or exists(select 1 from public.vehicle_group_orders vgo join public.orders o on o.id=vgo.order_id where vgo.vehicle_group_id=vg.id and o.account_id=auth.uid())
    )
  )
);
create policy vehicle_group_private_send on realtime.messages for insert to authenticated with check (
  realtime.topic() like 'private:vehicle-group:%' and exists (
    select 1 from public.vehicle_groups vg where 'private:vehicle-group:'||vg.id::text=realtime.topic() and (public.is_group_staff(vg.id) or public.is_operations())
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('private-order-files','private-order-files',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy order_file_owner_insert on storage.objects for insert to authenticated with check(bucket_id='private-order-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy order_file_owner_select on storage.objects for select to authenticated using(bucket_id='private-order-files' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_operations()));
create policy order_file_owner_delete on storage.objects for delete to authenticated using(bucket_id='private-order-files' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.reserve_inventory(p_departure uuid,p_account uuid,p_seats integer,p_key text,p_expires timestamptz) returns table(order_id uuid,hold_id uuid) language plpgsql security definer set search_path=public as $$declare d departures%rowtype; used integer; existing orders%rowtype; existing_hold inventory_locks%rowtype; o uuid; h uuid; begin if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if; if p_seats<=0 or p_expires<=now() then raise exception 'invalid hold'; end if; select * into existing from orders where account_id=p_account and idempotency_key=p_key; if found then select * into existing_hold from inventory_locks where order_id=existing.id and idempotency_key=p_key; if existing.departure_id<>p_departure or existing.seat_count<>p_seats or existing_hold.expires_at<>p_expires then raise exception 'idempotency parameter mismatch'; end if; return query select existing.id,existing_hold.id; return; end if; select * into d from departures where id=p_departure for update; if not found or d.status<>'open' then raise exception 'departure unavailable'; end if; update inventory_locks set status='expired' where departure_id=p_departure and status='held' and expires_at<=now(); select coalesce(sum(seats),0) into used from inventory_locks where departure_id=p_departure and status in ('held','committed'); if used+p_seats>d.capacity then raise exception 'insufficient inventory'; end if; insert into orders(account_id,departure_id,idempotency_key,seat_count) values(p_account,p_departure,p_key,p_seats) returning id into o; insert into inventory_locks(departure_id,order_id,idempotency_key,seats,expires_at) values(p_departure,o,p_key,p_seats,p_expires) returning id into h; return query select o,h; end$$;

create or replace function public.apply_payment_event(p_event_id text,p_order uuid,p_status public.payment_status,p_created timestamptz,p_digest text) returns boolean language plpgsql security definer set search_path=public as $$declare latest payment_events%rowtype; hold inventory_locks%rowtype; begin if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if; if exists(select 1 from payment_events where provider_event_id=p_event_id) then return false; end if; select * into latest from payment_events where order_id=p_order order by event_created_at desc,received_at desc limit 1; insert into payment_events(provider,provider_event_id,order_id,status,event_created_at,payload_digest) values('stripe',p_event_id,p_order,p_status,p_created,p_digest); if latest.id is not null and p_created<latest.event_created_at then return true; end if; select * into hold from inventory_locks where order_id=p_order for update; if p_status='succeeded' then if hold.status='held' and hold.expires_at>now() then update inventory_locks set status='committed' where id=hold.id; update orders set status='paid',payment_review_reason=null,updated_at=now() where id=p_order and status='pending_payment'; else update orders set status='payment_review',payment_review_reason='payment_succeeded_without_valid_inventory',updated_at=now() where id=p_order and status in ('pending_payment','expired','cancelled'); end if; elsif p_status='refunded' then update orders set status='refunded',updated_at=now() where id=p_order and status in ('paid','confirmed','payment_review'); end if; return true; end$$;

commit;
