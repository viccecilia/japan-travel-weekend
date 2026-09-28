begin;

-- A quote is the confirmation boundary.  Lock the customer-facing route and
-- policy here so a later publish cannot change a pending order's agreement.
alter table public.order_quotes add column if not exists policy_template_version_id uuid references public.policy_template_versions(id) on delete restrict;
alter table public.order_quotes add column if not exists accepted_locale text check(accepted_locale in ('zh-CN','ja','en','ko','vi','ne','es'));
alter table public.order_quotes add column if not exists agreement_snapshot jsonb;
alter table public.order_quotes add column if not exists agreement_accepted_at timestamptz;

create or replace function public.create_order_quote(
  p_account uuid,p_departure uuid,p_seats integer,p_coupon uuid default null,p_accepted_locale text default 'zh-CN'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.departures%rowtype;t public.trips%rowtype;r public.product_revisions%rowtype;c public.discount_coupons%rowtype;
  v_policy public.policy_template_versions%rowtype;v_policy_sections jsonb;v_content jsonb;v_id uuid;v_gross integer;v_discount integer:=0;v_percent integer:=0;v_source text;v_rules text;v_revision uuid;v_terms jsonb;v_items jsonb;v_expires timestamptz:=now()+interval '10 minutes';
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_account is null or p_seats<1 or p_accepted_locale not in ('zh-CN','ja','en','ko','vi','ne','es') then raise exception 'invalid quote request'; end if;
  select dep.* into d from public.departures dep where dep.id=p_departure;
  if not found or not public.is_departure_sellable(p_departure,now()) then return null; end if;
  select tr.* into t from public.trips tr where tr.id=d.trip_id; v_revision:=t.current_published_revision_id;
  if v_revision is not null then select pr.* into r from public.product_revisions pr where pr.id=v_revision and pr.state='published'; end if;
  v_content:=coalesce(r.content,t.content,'{}'::jsonb);
  select p.* into v_policy from public.policy_template_versions p where p.template_id=t.policy_template_id and p.state='published' order by p.version_number desc limit 1;
  if v_policy.id is null then raise exception 'published policy required'; end if;
  select l.sections into v_policy_sections from public.policy_template_localizations l where l.policy_version_id=v_policy.id and l.locale in (p_accepted_locale,'zh-CN') order by case when l.locale=p_accepted_locale then 0 else 1 end limit 1;
  if v_policy_sections is null then raise exception 'policy locale unavailable'; end if;
  v_gross:=d.seat_price_jpy*p_seats;
  if p_coupon is not null then
    select dc.* into c from public.discount_coupons dc where dc.id=p_coupon and dc.account_id=p_account;
    if not found or c.status<>'active' or c.expires_at<=now() or c.max_discounted_seats<>1 then return null; end if;
    v_percent:=c.discount_percent;v_source:=c.source_type;v_rules:=c.rules_version;v_discount:=floor((d.seat_price_jpy::numeric*v_percent/100)+0.5)::integer;
  end if;
  v_terms:=jsonb_build_object('currency',d.currency,'taxIncluded',d.tax_included,'included',v_content->'included','excluded',v_content->'excluded','childPolicy',v_content->>'childPolicy','luggagePolicy',v_content->>'luggagePolicy','weatherPolicy',v_content->>'weatherPolicy','mealInfo',v_content->>'mealInfo');
  v_items:=jsonb_build_array(jsonb_build_object('kind','base_fare','label',coalesce(r.title,t.title)||'座位费','quantity',p_seats,'unitPriceJpy',d.seat_price_jpy,'amountJpy',v_gross),jsonb_build_object('kind','coupon','label',case when p_coupon is null then '无优惠券' else '单席优惠券' end,'quantity',case when p_coupon is null then 0 else 1 end,'unitPriceJpy',d.seat_price_jpy,'amountJpy',-v_discount));
  insert into public.order_quotes(account_id,departure_id,departure_version,product_revision_id,seat_count,unit_price_jpy,base_fare_jpy,coupon_id,coupon_source_type,coupon_rules_version,discount_percent,discounted_seats,discount_amount_jpy,amount_due_jpy,expires_at,trip_id,title,departs_at,meeting_name,meeting_address,cancellation_policy,cancellation_policy_version,commercial_terms,line_items,policy_template_version_id,accepted_locale,agreement_snapshot,agreement_accepted_at)
  values(p_account,d.id,d.schedule_version,v_revision,p_seats,d.seat_price_jpy,v_gross,p_coupon,v_source,v_rules,v_percent,case when p_coupon is null then 0 else 1 end,v_discount,v_gross-v_discount,v_expires,t.id,coalesce(r.title,t.title),d.departs_at,d.meeting_name,d.meeting_address,coalesce(v_policy_sections->>'cancellation_policy',v_content->>'cancellationPolicy'),v_policy.version_number::text,v_terms,v_items,v_policy.id,p_accepted_locale,jsonb_build_object('routeRevisionId',v_revision,'route',jsonb_build_object('title',coalesce(r.title,t.title),'content',v_content),'meeting',jsonb_build_object('name',d.meeting_name,'address',d.meeting_address,'meetingTime',d.departs_at,'departureTime',d.departs_at),'routeReminders',coalesce(v_content->'routeReminders','[]'::jsonb),'policy',jsonb_build_object('versionId',v_policy.id,'version',v_policy.version_number,'sections',v_policy_sections),'locale',p_accepted_locale),now()) returning id into v_id;
  return jsonb_build_object('quoteId',v_id,'version','immutable-billing-v3','currency','JPY','seatCount',p_seats,'unitPrice',d.seat_price_jpy,'baseFare',v_gross,'addOnTotal',0,'couponId',p_coupon,'couponSource',v_source,'discountPercent',v_percent,'discountedSeats',case when p_coupon is null then 0 else 1 end,'discountAmount',v_discount,'amountDue',v_gross-v_discount,'expiresAt',v_expires);
end$$;

create or replace function public.begin_checkout_attempt(
  p_account uuid,p_key text,p_draft uuid,p_departure uuid,p_seats integer,p_method text,p_quote uuid,p_accepted_locale text default 'zh-CN'
) returns table(attempt_id uuid,attempt_status text,attempt_order_id uuid,response_payload jsonb)
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.checkout_attempts%rowtype;q public.order_quotes%rowtype;
begin
  if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if;
  if p_account is null or length(trim(coalesce(p_key,'')))<8 or p_departure is null or p_seats<1 or p_method not in ('card','bank_transfer') or p_accepted_locale not in ('zh-CN','ja','en','ko','vi','ne','es') then raise exception 'invalid checkout attempt'; end if;
  if p_quote is not null then select * into q from public.order_quotes where id=p_quote and account_id=p_account for update; if not found or q.departure_id<>p_departure or q.seat_count<>p_seats or q.expires_at<=now() or q.accepted_locale<>p_accepted_locale then raise exception 'quote changed'; end if; end if;
  select x.* into a from public.checkout_attempts x where x.account_id=p_account and x.idempotency_key=trim(p_key) for update;
  if found then
    if a.draft_id is distinct from p_draft or a.departure_id<>p_departure or a.seat_count<>p_seats or a.payment_method<>p_method or a.quote_id is distinct from p_quote then raise exception 'checkout idempotency mismatch'; end if;
    return query select a.id,a.status,a.order_id,a.response_payload; return;
  end if;
  insert into public.checkout_attempts(account_id,idempotency_key,draft_id,departure_id,seat_count,payment_method,quote_id) values(p_account,trim(p_key),p_draft,p_departure,p_seats,p_method,p_quote) returning * into a;
  return query select a.id,a.status,a.order_id,a.response_payload;
end$$;

create or replace function public.capture_paid_order_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    insert into public.order_snapshots(order_id,trip_id,product_revision_id,departure_id,departure_version,title,departs_at,meeting_name,meeting_address,seat_count,unit_price_jpy,gross_amount_jpy,paid_amount_jpy,cancellation_policy,cancellation_policy_version,commercial_terms,source_kind,line_items,coupon_id,coupon_source_type,coupon_rules_version,discount_percent,discounted_seats,discounted_unit_price_jpy,discount_amount_jpy,payment_kind,payment_status_text,user_confirmed_at,quote_id,policy_template_version_id,accepted_locale,agreement_snapshot,agreement_accepted_at)
    select new.id,q.trip_id,q.product_revision_id,q.departure_id,q.departure_version,q.title,q.departs_at,q.meeting_name,q.meeting_address,q.seat_count,q.unit_price_jpy,q.base_fare_jpy,new.amount,q.cancellation_policy,q.cancellation_policy_version,q.commercial_terms,'captured',q.line_items,q.coupon_id,q.coupon_source_type,q.coupon_rules_version,q.discount_percent,nullif(q.discounted_seats,0),case when q.coupon_id is null then null else q.unit_price_jpy end,q.discount_amount_jpy,new.payment_kind,new.payment_status_text,coalesce(new.quote_confirmed_at,q.confirmed_at),q.id,q.policy_template_version_id,q.accepted_locale,q.agreement_snapshot,q.agreement_accepted_at
    from public.order_quotes q where q.id=new.quote_id on conflict(order_id) do nothing;
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
  return jsonb_build_object('orderId',o.id,'status',o.status,'currency',o.currency,'amountPaidJpy',coalesce(s.paid_amount_jpy,o.amount),'grossAmountJpy',coalesce(s.gross_amount_jpy,o.gross_amount),'discountAmountJpy',coalesce(s.discount_amount_jpy,o.discount_amount,0),'lineItems',coalesce(s.line_items,'[]'::jsonb),'paymentKind',coalesce(s.payment_kind,o.payment_kind),'paymentStatus',coalesce(s.payment_status_text,o.payment_status_text),'userConfirmedAt',s.user_confirmed_at,'title',s.title,'departsAt',s.departs_at,'meetingName',s.meeting_name,'meetingAddress',s.meeting_address,'cancellationPolicy',s.cancellation_policy,'cancellationPolicyVersion',s.cancellation_policy_version,'policyVersionId',s.policy_template_version_id,'acceptedLocale',s.accepted_locale,'agreementSnapshot',s.agreement_snapshot,'agreementAcceptedAt',s.agreement_accepted_at,'refunds',v_refunds,'snapshotAvailable',s.order_id is not null);
end$$;

revoke all on function public.create_order_quote(uuid,uuid,integer,uuid,text),public.begin_checkout_attempt(uuid,text,uuid,uuid,integer,text,uuid,text),public.capture_paid_order_snapshot(),public.get_own_order_billing(uuid) from public,anon;
grant execute on function public.create_order_quote(uuid,uuid,integer,uuid,text),public.begin_checkout_attempt(uuid,text,uuid,uuid,integer,text,uuid,text) to service_role;
grant execute on function public.get_own_order_billing(uuid) to authenticated,service_role;

commit;
