begin;
grant select on public.travel_moment_flags,public.travel_moment_manual_verifications to authenticated;
create policy travel_moment_flags_owner_or_ops on public.travel_moment_flags for select to authenticated using(exists(select 1 from public.travel_moment_submissions s where s.id=submission_id and (s.account_id=auth.uid() or public.is_operations())));
create policy travel_moment_manual_verifications_owner_or_ops on public.travel_moment_manual_verifications for select to authenticated using(exists(select 1 from public.travel_moment_submissions s where s.id=submission_id and (s.account_id=auth.uid() or public.is_operations())));
commit;
