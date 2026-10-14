begin;

create policy referral_certification_questions_no_direct_access
  on public.referral_certification_questions for all to authenticated
  using(false) with check(false);
create policy referral_certification_attempts_no_direct_access
  on public.referral_certification_attempts for all to authenticated
  using(false) with check(false);

create index if not exists referral_certification_attempts_question_fk_idx
  on public.referral_certification_attempts(course_version,question_key);

commit;
