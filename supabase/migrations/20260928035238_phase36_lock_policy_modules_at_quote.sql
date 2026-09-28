begin;

-- The quote is the agreement boundary.  Lock the two route-level policy
-- modules here; the paid-order trigger copies only this stored quote snapshot.
create or replace function public.lock_quote_policy_modules()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.trips%rowtype; service_version public.policy_template_versions%rowtype; cancellation_version public.policy_template_versions%rowtype; service_sections jsonb; cancellation_sections jsonb; selected_locale text:=coalesce(new.accepted_locale,'zh-CN');
begin
  select * into t from public.trips where id=new.trip_id;
  if not found then raise exception 'trip unavailable for quote policy lock'; end if;
  select * into service_version from public.policy_template_versions where template_id=t.service_time_policy_template_id and state='published' order by version_number desc limit 1;
  select * into cancellation_version from public.policy_template_versions where template_id=t.cancellation_policy_template_id and state='published' order by version_number desc limit 1;
  if service_version.id is null or cancellation_version.id is null then raise exception 'published route policy modules required'; end if;
  select sections into service_sections from public.policy_template_localizations where policy_version_id=service_version.id and locale in (selected_locale,'zh-CN') order by case when locale=selected_locale then 0 else 1 end limit 1;
  select sections into cancellation_sections from public.policy_template_localizations where policy_version_id=cancellation_version.id and locale in (selected_locale,'zh-CN') order by case when locale=selected_locale then 0 else 1 end limit 1;
  if service_sections is null or cancellation_sections is null then raise exception 'route policy module locale unavailable'; end if;
  new.service_time_policy_version_id:=service_version.id;
  new.cancellation_policy_version_id:=cancellation_version.id;
  new.agreement_snapshot:=coalesce(new.agreement_snapshot,'{}'::jsonb)||jsonb_build_object('policyModules',jsonb_build_object('global',coalesce(new.agreement_snapshot->'policy','{}'::jsonb),'serviceTime',jsonb_build_object('versionId',service_version.id,'version',service_version.version_number,'sections',service_sections),'cancellation',jsonb_build_object('versionId',cancellation_version.id,'version',cancellation_version.version_number,'sections',cancellation_sections)));
  return new;
end$$;

drop trigger if exists lock_order_quote_policy_modules on public.order_quotes;
create trigger lock_order_quote_policy_modules before insert on public.order_quotes for each row execute function public.lock_quote_policy_modules();

create or replace function public.capture_paid_order_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    insert into public.order_snapshots(order_id,trip_id,product_revision_id,departure_id,departure_version,title,departs_at,meeting_name,meeting_address,seat_count,unit_price_jpy,gross_amount_jpy,paid_amount_jpy,cancellation_policy,cancellation_policy_version,commercial_terms,source_kind,line_items,coupon_id,coupon_source_type,coupon_rules_version,discount_percent,discounted_seats,discounted_unit_price_jpy,discount_amount_jpy,payment_kind,payment_status_text,user_confirmed_at,quote_id,policy_template_version_id,service_time_policy_version_id,cancellation_policy_version_id,accepted_locale,agreement_snapshot,agreement_accepted_at)
    select new.id,q.trip_id,q.product_revision_id,q.departure_id,q.departure_version,q.title,q.departs_at,q.meeting_name,q.meeting_address,q.seat_count,q.unit_price_jpy,q.base_fare_jpy,new.amount,q.cancellation_policy,q.cancellation_policy_version,q.commercial_terms,'captured',q.line_items,q.coupon_id,q.coupon_source_type,q.coupon_rules_version,q.discount_percent,nullif(q.discounted_seats,0),case when q.coupon_id is null then null else q.unit_price_jpy end,q.discount_amount_jpy,new.payment_kind,new.payment_status_text,coalesce(new.quote_confirmed_at,q.confirmed_at),q.id,q.policy_template_version_id,q.service_time_policy_version_id,q.cancellation_policy_version_id,q.accepted_locale,q.agreement_snapshot,q.agreement_accepted_at from public.order_quotes q where q.id=new.quote_id on conflict(order_id) do nothing;
  end if; return new;
end$$;

create or replace function public.get_own_order_billing(p_order uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.order_snapshots%rowtype;o public.orders%rowtype;v_refunds jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select x.* into o from public.orders x where x.id=p_order and (x.account_id=auth.uid() or public.is_operations()); if not found then raise exception 'order unavailable'; end if;
  select x.* into s from public.order_snapshots x where x.order_id=p_order;
  select coalesce(jsonb_agg(jsonb_build_object('status',r.status,'amountJpy',r.actual_refund_amount,'completedAt',r.completed_at,'channel',r.channel) order by r.created_at),'[]'::jsonb) into v_refunds from public.refund_operations r where r.order_id=p_order;
  return jsonb_build_object('orderId',o.id,'status',o.status,'currency',o.currency,'amountPaidJpy',coalesce(s.paid_amount_jpy,o.amount),'grossAmountJpy',coalesce(s.gross_amount_jpy,o.gross_amount),'discountAmountJpy',coalesce(s.discount_amount_jpy,o.discount_amount,0),'lineItems',coalesce(s.line_items,'[]'::jsonb),'paymentKind',coalesce(s.payment_kind,o.payment_kind),'paymentStatus',coalesce(s.payment_status_text,o.payment_status_text),'userConfirmedAt',s.user_confirmed_at,'title',s.title,'departsAt',s.departs_at,'meetingName',s.meeting_name,'meetingAddress',s.meeting_address,'cancellationPolicy',s.cancellation_policy,'cancellationPolicyVersion',s.cancellation_policy_version,'policyVersionId',s.policy_template_version_id,'serviceTimePolicyVersionId',s.service_time_policy_version_id,'cancellationPolicyVersionId',s.cancellation_policy_version_id,'acceptedLocale',s.accepted_locale,'agreementSnapshot',s.agreement_snapshot,'agreementAcceptedAt',s.agreement_accepted_at,'refunds',v_refunds,'snapshotAvailable',s.order_id is not null);
end$$;

revoke all on function public.lock_quote_policy_modules(),public.capture_paid_order_snapshot(),public.get_own_order_billing(uuid) from public,anon;
grant execute on function public.get_own_order_billing(uuid) to authenticated,service_role;

commit;
