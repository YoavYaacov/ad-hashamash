-- "Last call": once most teams have finished, the host shortens the remaining time of the open
-- round to a short countdown, so nobody waits minutes for one slow team. Never lengthens it.
create or replace function public.host_last_call(p_instance uuid, p_round int, p_seconds int)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  gi public.game_instances;
  r public.rounds;
  tt public.task_templates;
  v_end timestamptz;
begin
  perform private.require_host();
  gi := private.lock_instance(p_instance);
  if gi.current_round is distinct from p_round then raise exception 'not_current_round'; end if;
  select * into r from public.rounds where instance_id = p_instance and round_no = p_round for update;
  select * into tt from public.task_templates where id = r.task_id;
  if r.phase <> 'open' or r.ends_at is null then return r.ends_at; end if;
  if tt.kind = 'sequence_memory' then return r.ends_at; end if;   -- fixed shared timeline
  v_end := least(r.ends_at, clock_timestamp() + make_interval(secs => greatest(10, least(p_seconds, 120))));
  if v_end < r.ends_at then
    update public.rounds set ends_at = v_end where instance_id = p_instance and round_no = p_round;
    perform private.refresh_public_state(p_instance);
  end if;
  return v_end;
end $$;
revoke execute on function public.host_last_call(uuid, int, int) from public, anon;
grant execute on function public.host_last_call(uuid, int, int) to authenticated;
