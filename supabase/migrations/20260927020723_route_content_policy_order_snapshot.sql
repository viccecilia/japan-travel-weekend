begin;

-- Route-specific content stays inside the existing immutable product-revision
-- stream.  Policies deliberately live outside routes so a published policy
-- version can be shared by every current day-trip product.
create table if not exists public.policy_templates(
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique check(template_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  product_kind text not null default 'day_trip',
  status text not null default 'active' check(status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.policy_template_versions(
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.policy_templates(id) on delete restrict,
  version_number integer not null check(version_number > 0),
  state text not null check(state in ('draft','published','superseded','archived')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(template_id,version_number)
);
create table if not exists public.policy_template_localizations(
  policy_version_id uuid not null references public.policy_template_versions(id) on delete cascade,
  locale text not null check(locale in ('zh-CN','ja','en','ko','vi','ne','es')),
  sections jsonb not null default '{}'::jsonb check(jsonb_typeof(sections)='object'),
  primary key(policy_version_id,locale)
);
alter table public.policy_templates enable row level security;
alter table public.policy_template_versions enable row level security;
alter table public.policy_template_localizations enable row level security;
revoke all on public.policy_templates,public.policy_template_versions,public.policy_template_localizations from public,anon,authenticated;
grant select on public.policy_templates,public.policy_template_versions,public.policy_template_localizations to authenticated;
grant all on public.policy_templates,public.policy_template_versions,public.policy_template_localizations to service_role;
create policy policy_template_operations_read on public.policy_templates for select to authenticated using(public.is_operations());
create policy policy_version_operations_read on public.policy_template_versions for select to authenticated using(public.is_operations());
create policy policy_localization_operations_read on public.policy_template_localizations for select to authenticated using(public.is_operations());

insert into public.policy_templates(template_key,product_kind)
values('jtw-day-trip-standard','day_trip')
on conflict(template_key) do nothing;

alter table public.trips add column if not exists policy_template_id uuid references public.policy_templates(id) on delete restrict;
update public.trips set policy_template_id=(select id from public.policy_templates where template_key='jtw-day-trip-standard') where policy_template_id is null;
alter table public.trips alter column policy_template_id set not null;

alter table public.order_snapshots add column if not exists policy_template_version_id uuid references public.policy_template_versions(id) on delete restrict;
alter table public.order_snapshots add column if not exists accepted_locale text check(accepted_locale in ('zh-CN','ja','en','ko','vi','ne','es'));
alter table public.order_snapshots add column if not exists agreement_snapshot jsonb;
alter table public.order_snapshots add column if not exists agreement_accepted_at timestamptz;

create or replace function public.get_public_policy_for_trip(p_trip uuid,p_locale text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('templateKey',t.template_key,'versionId',v.id,'version',v.version_number,'locale',l.locale,'sections',l.sections)
  from public.trips r
  join public.policy_templates t on t.id=r.policy_template_id and t.status='active'
  join lateral (select x.* from public.policy_template_versions x where x.template_id=t.id and x.state='published' order by x.version_number desc limit 1) v on true
  join lateral (select x.* from public.policy_template_localizations x where x.policy_version_id=v.id and x.locale in (p_locale,'zh-CN') order by case when x.locale=p_locale then 0 else 1 end limit 1) l on true
  where r.id=p_trip and r.status='published'
$$;

create or replace function public.get_operations_policy_templates()
returns table(template_id uuid,template_key text,status text,version_id uuid,version_number integer,version_state text,localizations jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
  select t.id,t.template_key,t.status,v.id,v.version_number,v.state,
    coalesce((select jsonb_object_agg(l.locale,l.sections) from public.policy_template_localizations l where l.policy_version_id=v.id),'{}'::jsonb)
  from public.policy_templates t left join lateral (
    select x.* from public.policy_template_versions x where x.template_id=t.id and x.state in ('draft','published') order by case when x.state='draft' then 0 else 1 end,x.version_number desc limit 1
  ) v on true where public.is_operations() order by t.template_key
$$;

create or replace function public.operations_save_policy_draft(p_template uuid,p_localizations jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_template public.policy_templates%rowtype;v_current public.policy_template_versions%rowtype;v_next integer;v_id uuid;v_locale text;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  if jsonb_typeof(coalesce(p_localizations,'{}'::jsonb))<>'object' then raise exception 'localizations must be object'; end if;
  select * into v_template from public.policy_templates where id=p_template and status='active' for update;
  if not found then raise exception 'policy template unavailable'; end if;
  select * into v_current from public.policy_template_versions where template_id=p_template and state='draft' order by version_number desc limit 1 for update;
  if found then delete from public.policy_template_localizations where policy_version_id=v_current.id; v_id:=v_current.id;
  else
    select coalesce(max(version_number),0)+1 into v_next from public.policy_template_versions where template_id=p_template;
    insert into public.policy_template_versions(template_id,version_number,state,created_by) values(p_template,v_next,'draft',auth.uid()) returning id into v_id;
  end if;
  for v_locale in select jsonb_object_keys(p_localizations) loop
    if v_locale not in ('zh-CN','ja','en','ko','vi','ne','es') then raise exception 'unsupported policy locale'; end if;
    insert into public.policy_template_localizations(policy_version_id,locale,sections) values(v_id,v_locale,coalesce(p_localizations->v_locale,'{}'::jsonb));
  end loop;
  update public.policy_templates set updated_at=now() where id=p_template;
  return v_id;
end$$;

create or replace function public.operations_publish_policy_draft(p_template uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_draft public.policy_template_versions%rowtype;v_count integer;
begin
  if not public.is_operations() then raise exception 'operations role required'; end if;
  select * into v_draft from public.policy_template_versions where template_id=p_template and state='draft' order by version_number desc limit 1 for update;
  if not found then raise exception 'policy draft not found'; end if;
  select count(*) into v_count from public.policy_template_localizations where policy_version_id=v_draft.id and locale in ('zh-CN','ja','en','ko','vi','ne','es') and sections<>'{}'::jsonb;
  if v_count<>7 then raise exception 'policy requires 7/7 localized sections before publish'; end if;
  update public.policy_template_versions set state='superseded' where template_id=p_template and state='published';
  update public.policy_template_versions set state='published',published_at=now() where id=v_draft.id;
  return v_draft.id;
end$$;

-- Capture rendered route-specific fields plus the specific immutable policy
-- version used at confirmation. Later Route/Policy edits cannot alter this row.
create or replace function public.capture_paid_order_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_policy public.policy_template_versions%rowtype;v_policy_sections jsonb;v_content jsonb;v_locale text;
begin
  if new.status in ('paid','confirmed') and old.status is distinct from new.status then
    select r.content into v_content from public.product_revisions r where r.id=new.quoted_product_revision_id;
    v_content:=coalesce(v_content,'{}'::jsonb);
    v_locale:=coalesce(nullif(v_content->>'acceptedLocale',''),'zh-CN');
    select p.* into v_policy from public.departures d join public.trips t on t.id=d.trip_id join public.policy_template_versions p on p.template_id=t.policy_template_id and p.state='published' where d.id=new.departure_id order by p.version_number desc limit 1;
    select l.sections into v_policy_sections from public.policy_template_localizations l where l.policy_version_id=v_policy.id and l.locale in (v_locale,'zh-CN') order by case when l.locale=v_locale then 0 else 1 end limit 1;
    insert into public.order_snapshots(order_id,trip_id,product_revision_id,departure_id,departure_version,title,departs_at,meeting_name,meeting_address,seat_count,unit_price_jpy,gross_amount_jpy,paid_amount_jpy,cancellation_policy,cancellation_policy_version,commercial_terms,source_kind,line_items,coupon_id,coupon_source_type,coupon_rules_version,discount_percent,discounted_seats,discounted_unit_price_jpy,discount_amount_jpy,payment_kind,payment_status_text,user_confirmed_at,quote_id,policy_template_version_id,accepted_locale,agreement_snapshot,agreement_accepted_at)
    select new.id,q.trip_id,q.product_revision_id,q.departure_id,q.departure_version,q.title,q.departs_at,q.meeting_name,q.meeting_address,q.seat_count,q.unit_price_jpy,q.base_fare_jpy,new.amount,coalesce(v_policy_sections->>'cancellation_policy',q.cancellation_policy),coalesce(v_policy.version_number::text,q.cancellation_policy_version),q.commercial_terms,'captured',q.line_items,q.coupon_id,q.coupon_source_type,q.coupon_rules_version,q.discount_percent,nullif(q.discounted_seats,0),case when q.coupon_id is null then null else q.unit_price_jpy end,q.discount_amount_jpy,new.payment_kind,new.payment_status_text,coalesce(new.quote_confirmed_at,q.confirmed_at),q.id,v_policy.id,v_locale,jsonb_build_object('routeRevisionId',q.product_revision_id,'route',jsonb_build_object('title',q.title,'content',v_content),'meeting',jsonb_build_object('name',q.meeting_name,'address',q.meeting_address,'departsAt',q.departs_at),'routeReminders',coalesce(v_content->'routeReminders','[]'::jsonb),'policy',jsonb_build_object('versionId',v_policy.id,'version',v_policy.version_number,'sections',coalesce(v_policy_sections,'{}'::jsonb)),'locale',v_locale),coalesce(new.quote_confirmed_at,q.confirmed_at)
    from public.order_quotes q where q.id=new.quote_id on conflict(order_id) do nothing;
  end if; return new;
end$$;

revoke all on function public.get_public_policy_for_trip(uuid,text),public.get_operations_policy_templates(),public.operations_save_policy_draft(uuid,jsonb),public.operations_publish_policy_draft(uuid),public.capture_paid_order_snapshot() from public,anon;
grant execute on function public.get_public_policy_for_trip(uuid,text) to anon,authenticated,service_role;
grant execute on function public.get_operations_policy_templates(),public.operations_save_policy_draft(uuid,jsonb),public.operations_publish_policy_draft(uuid) to authenticated,service_role;

commit;
