begin;

-- RLS remains the authority: passengers and staff can only read outbox rows where
-- they are the recipient, while operations retains its existing operational scope.
-- The client already selects payload so it can resolve the notification's object.
grant select(payload) on public.notification_outbox to authenticated;

commit;
