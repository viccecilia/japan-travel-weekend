begin;

create or replace function public.get_own_access_destination()
returns table(destination text,account_role text,application_status text)
language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when p.role='operations' then 'operations'
    when p.role in ('driver','guide')
      and a.status='approved'
      and dr.status='available' then 'staff'
    when a.status in ('pending','needs_information') then 'staff_pending'
    when a.status in ('rejected','suspended')
      or (p.role in ('driver','guide') and coalesce(dr.status::text,'unavailable')<>'available') then 'staff_blocked'
    else 'passenger' end,
    p.role::text,
    a.status
  from public.profiles p
  left join lateral (
    select item.status
    from public.staff_account_applications item
    where item.account_id=p.id
    order by item.updated_at desc,item.created_at desc
    limit 1
  ) a on true
  left join public.driver_resources dr on dr.account_id=p.id
  where p.id=auth.uid();
$$;

revoke all on function public.get_own_access_destination() from public,anon;
grant execute on function public.get_own_access_destination() to authenticated,service_role;

commit;
