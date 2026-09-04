begin;

-- Trigger callers need to execute the immutable completeness predicate. This
-- exposes only a boolean calculation and grants no route/departure data access.
grant execute on function public.route_catalog_complete(jsonb) to authenticated,service_role;

commit;
