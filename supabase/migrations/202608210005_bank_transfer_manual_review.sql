alter type public.order_status add value if not exists 'pending_manual_review';
begin;
create or replace function public.mark_bank_transfer_pending(p_order uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$begin if current_user not in ('service_role','postgres') then raise exception 'trusted service only'; end if; update public.orders as ord set status='pending_manual_review',updated_at=now() where ord.id=p_order and ord.status='pending_payment'; return found; end$$;
revoke all on function public.mark_bank_transfer_pending(uuid) from public,anon,authenticated;
grant execute on function public.mark_bank_transfer_pending(uuid) to service_role;
commit;
