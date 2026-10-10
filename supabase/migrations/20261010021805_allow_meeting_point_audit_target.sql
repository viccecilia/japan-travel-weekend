begin;

-- Meeting point mutations are audited atomically. Keep the existing resource
-- targets and admit the new template target used by the operations RPCs.
alter table public.account_audit_events
  drop constraint if exists account_audit_events_target_type_check;
alter table public.account_audit_events
  add constraint account_audit_events_target_type_check
  check(target_type in (
    'account_profile','booking_draft','staff_application','account','trip','order',
    'commission_payout','driver_resource','fleet_vehicle','meeting_point_template'
  ));

commit;
