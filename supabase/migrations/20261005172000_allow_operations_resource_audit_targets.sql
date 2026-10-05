begin;

-- Resource-maintenance RPCs already emit these audited target types. Keep the
-- table constraint aligned so the RPC update and its audit row commit together.
alter table public.account_audit_events
  drop constraint if exists account_audit_events_target_type_check;
alter table public.account_audit_events
  add constraint account_audit_events_target_type_check
  check(target_type in (
    'account_profile','booking_draft','staff_application','account','trip','order',
    'commission_payout','driver_resource','fleet_vehicle'
  ));

commit;
