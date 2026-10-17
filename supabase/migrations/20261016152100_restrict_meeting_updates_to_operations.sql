create or replace function public.operations_update_vehicle_group_meeting(
  p_vehicle_group uuid,
  p_meeting_at timestamptz,
  p_meeting_name text,
  p_meeting_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_landmark_description text,
  p_reason text,
  p_idempotency_key text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_operations() then
    raise exception 'operations only';
  end if;

  return public.update_vehicle_group_meeting(
    p_vehicle_group,
    p_meeting_at,
    p_meeting_name,
    p_meeting_address,
    p_latitude,
    p_longitude,
    p_landmark_description,
    p_reason,
    p_idempotency_key
  );
end
$$;

revoke all on function public.update_vehicle_group_meeting(uuid,timestamptz,text,text,numeric,numeric,text,text,text) from public, anon, authenticated;
grant execute on function public.update_vehicle_group_meeting(uuid,timestamptz,text,text,numeric,numeric,text,text,text) to service_role;

revoke all on function public.operations_update_vehicle_group_meeting(uuid,timestamptz,text,text,numeric,numeric,text,text,text) from public, anon;
grant execute on function public.operations_update_vehicle_group_meeting(uuid,timestamptz,text,text,numeric,numeric,text,text,text) to authenticated, service_role;
