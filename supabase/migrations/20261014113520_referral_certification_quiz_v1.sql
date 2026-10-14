begin;

create table if not exists public.referral_certification_questions(
  course_version text not null,
  question_key text not null,
  display_order integer not null check(display_order between 1 and 50),
  correct_option integer not null check(correct_option between 0 and 5),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(course_version,question_key),
  unique(course_version,display_order)
);

create table if not exists public.referral_certification_attempts(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete restrict,
  course_version text not null,
  question_key text not null,
  selected_option integer not null check(selected_option between 0 and 5),
  is_correct boolean not null,
  attempted_at timestamptz not null default now(),
  foreign key(course_version,question_key)
    references public.referral_certification_questions(course_version,question_key) on delete restrict
);
create index if not exists referral_certification_attempts_account_idx
  on public.referral_certification_attempts(account_id,course_version,question_key,is_correct);

alter table public.referral_certification_questions enable row level security;
alter table public.referral_certification_attempts enable row level security;
revoke all on public.referral_certification_questions,public.referral_certification_attempts
  from public,anon,authenticated;
grant all on public.referral_certification_questions,public.referral_certification_attempts to service_role;

insert into public.referral_certification_questions(course_version,question_key,display_order,correct_option)
values
  ('referral-certification-v1','direct-referral',1,0),
  ('referral-certification-v1','qualified-seat',2,1),
  ('referral-certification-v1','payment-only',3,2),
  ('referral-certification-v1','refund-no-show',4,1),
  ('referral-certification-v1','ten-seat-gate',5,2),
  ('referral-certification-v1','self-referral',6,1),
  ('referral-certification-v1','truthful-sharing',7,0),
  ('referral-certification-v1','privacy',8,2),
  ('referral-certification-v1','cash-timing',9,1),
  ('referral-certification-v1','withdrawal',10,0)
on conflict(course_version,question_key) do update set
  display_order=excluded.display_order,correct_option=excluded.correct_option,active=true,updated_at=now();

update public.referral_certification_config set
  content_published=true,
  course_version='referral-certification-v1',
  scored_question_count=10,
  survey_question_count=0,
  published_at=coalesce(published_at,now()),
  updated_at=now()
where singleton=true;

update public.referral_learning_eligibilities set
  eligibility_status=case when eligibility_status='content_pending' then 'learning_available' else eligibility_status end,
  course_version=coalesce(course_version,'referral-certification-v1'),
  updated_at=now()
where qualifying_paid_seats>=10 and eligibility_status in ('content_pending','learning_available','in_progress');

create or replace function public.get_own_referral_certification()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_account uuid:=auth.uid();
  v_config public.referral_certification_config%rowtype;
  v_learning public.referral_learning_eligibilities%rowtype;
  v_questions jsonb:='[]'::jsonb;
  v_correct jsonb:='[]'::jsonb;
begin
  if v_account is null then raise exception 'authentication required'; end if;
  select * into v_config from public.referral_certification_config where singleton=true;
  select * into v_learning from public.referral_learning_eligibilities where account_id=v_account;

  if found and v_config.content_published and v_learning.qualifying_paid_seats>=10 then
    select coalesce(jsonb_agg(jsonb_build_object('questionKey',q.question_key,'order',q.display_order) order by q.display_order),'[]'::jsonb)
      into v_questions
    from public.referral_certification_questions q
    where q.course_version=v_config.course_version and q.active;

    select coalesce(jsonb_agg(a.question_key order by a.question_key),'[]'::jsonb)
      into v_correct
    from (
      select distinct question_key from public.referral_certification_attempts
      where account_id=v_account and course_version=v_config.course_version and is_correct
    ) a;
  end if;

  return jsonb_build_object(
    'available',coalesce(v_config.content_published,false) and coalesce(v_learning.qualifying_paid_seats,0)>=10,
    'status',coalesce(v_learning.eligibility_status,'not_eligible'),
    'courseVersion',v_config.course_version,
    'total',case when v_config.content_published then v_config.scored_question_count else 0 end,
    'correctQuestionKeys',v_correct,
    'questions',v_questions,
    'passedAt',v_learning.passed_at
  );
end$$;

create or replace function public.submit_own_referral_certification_answer(
  p_question_key text,p_selected_option integer,p_course_version text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_account uuid:=auth.uid();
  v_config public.referral_certification_config%rowtype;
  v_learning public.referral_learning_eligibilities%rowtype;
  v_question public.referral_certification_questions%rowtype;
  v_correct_count integer:=0;
  v_total integer:=0;
  v_is_correct boolean:=false;
  v_passed boolean:=false;
begin
  if v_account is null then raise exception 'authentication required'; end if;
  select * into v_config from public.referral_certification_config where singleton=true;
  if not found or not v_config.content_published or p_course_version is distinct from v_config.course_version then
    raise exception 'certification course unavailable';
  end if;
  select * into v_learning from public.referral_learning_eligibilities
    where account_id=v_account for update;
  if not found or v_learning.qualifying_paid_seats<10 or v_learning.eligibility_status='content_pending' then
    raise exception 'learning eligibility required';
  end if;
  if p_selected_option is null or p_selected_option<0 or p_selected_option>5 then
    raise exception 'invalid answer option';
  end if;
  select * into v_question from public.referral_certification_questions
    where course_version=v_config.course_version and question_key=p_question_key and active;
  if not found then raise exception 'question unavailable'; end if;

  v_is_correct:=p_selected_option=v_question.correct_option;
  insert into public.referral_certification_attempts(account_id,course_version,question_key,selected_option,is_correct)
  values(v_account,v_config.course_version,v_question.question_key,p_selected_option,v_is_correct);

  select count(*)::integer into v_total from public.referral_certification_questions
    where course_version=v_config.course_version and active;
  select count(distinct question_key)::integer into v_correct_count
    from public.referral_certification_attempts
    where account_id=v_account and course_version=v_config.course_version and is_correct;
  v_passed:=v_total=10 and v_correct_count=v_total;

  update public.referral_learning_eligibilities set
    eligibility_status=case when v_passed then 'passed' else 'in_progress' end,
    course_version=v_config.course_version,
    answer_version='all-correct-v1',
    accepted_rules_at=case when v_passed then coalesce(accepted_rules_at,now()) else accepted_rules_at end,
    passed_at=case when v_passed then coalesce(passed_at,now()) else passed_at end,
    updated_at=now()
  where account_id=v_account;

  return jsonb_build_object(
    'correct',v_is_correct,
    'correctCount',v_correct_count,
    'total',v_total,
    'passed',v_passed
  );
end$$;

revoke all on function public.get_own_referral_certification(),
  public.submit_own_referral_certification_answer(text,integer,text) from public,anon;
grant execute on function public.get_own_referral_certification(),
  public.submit_own_referral_certification_answer(text,integer,text) to authenticated;

commit;
