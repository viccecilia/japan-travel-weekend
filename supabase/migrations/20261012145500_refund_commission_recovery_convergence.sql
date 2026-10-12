begin;

-- Refund processing must run before the referral lifecycle refresh trigger so
-- withdrawal-pending and paid commissions retain an auditable recovery state.
create or replace function public.reverse_cash_commission_after_refund() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_new_basis integer;
begin
  if new.refunded_amount_jpy is distinct from old.refunded_amount_jpy
     or (new.status in ('cancelled','refunded') and old.status is distinct from new.status) then
    v_new_basis:=public.commission_basis_for_order(new.id);
    update public.cash_commission_entries
    set original_amount_jpy=coalesce(original_amount_jpy,amount_jpy),
        basis_amount_jpy=v_new_basis,
        amount_jpy=floor(v_new_basis*commission_percent/100.0)::integer,
        status=case
          when status in ('withdrawal_pending','locked','paid') then 'recovery_due'
          when status in ('pending','confirmed','available','carried_over') and v_new_basis=0 then 'invalid'
          else status
        end,
        invalid_reason=case
          when status in ('pending','confirmed','available','carried_over') and v_new_basis=0
            then 'source_order_cancelled_or_final_refunded'
          else invalid_reason
        end,
        adjustment_reason='order_refund',
        updated_at=now()
    where source_order_id=new.id and status not in ('cancelled','invalid','recovery_due');
  end if;
  return new;
end$$;

drop trigger if exists reverse_cash_commission_after_refund_trigger on public.orders;
drop trigger if exists a_reverse_cash_commission_after_refund_trigger on public.orders;
create trigger a_reverse_cash_commission_after_refund_trigger
after update of status,refunded_amount_jpy on public.orders
for each row execute function public.reverse_cash_commission_after_refund();

commit;
