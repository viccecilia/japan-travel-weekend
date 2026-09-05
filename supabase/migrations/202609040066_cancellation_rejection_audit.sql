alter table public.order_cancellation_requests add column if not exists operations_note text;
alter table public.order_cancellation_requests add column if not exists decided_by uuid references public.profiles(id);
alter table public.order_cancellation_requests add column if not exists decided_at timestamptz;

create or replace function public.operations_reject_cancellation_request(p_request uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_operations() then raise exception 'operations only'; end if;
  if length(trim(p_reason))<5 or length(p_reason)>500 then raise exception 'invalid reason'; end if;
  update public.order_cancellation_requests set status='rejected',operations_note=trim(p_reason),decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=p_request and status='requested';
  return found;
end$$;
revoke all on function public.operations_reject_cancellation_request(uuid,text) from public,anon;
grant execute on function public.operations_reject_cancellation_request(uuid,text) to authenticated;
