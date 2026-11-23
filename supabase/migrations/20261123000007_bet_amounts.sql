-- Bet tracks show concrete points (+X / −X): expose the server-computed stake in the snapshot.
create or replace function private.refresh_public_state(p_instance uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  gi public.game_instances;
  r public.rounds;
  tt public.task_templates;
  v_round jsonb := null;
  v_teams jsonb;
  v_standings jsonb := null;
  v_finals jsonb := null;
  v_active int;
  v_submitted int;
begin
  select * into gi from public.game_instances where id = p_instance;
  if not found then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.created_at), '[]'::jsonb), count(*)
    into v_teams, v_active
  from public.teams t where t.instance_id = p_instance and t.status = 'active';

  if gi.current_round is not null then
    select * into r from public.rounds where instance_id = p_instance and round_no = gi.current_round;
    select * into tt from public.task_templates where id = r.task_id;
    select count(distinct s.team_id) into v_submitted from public.submissions s
      where s.instance_id = p_instance and s.round_no = r.round_no and s.status <> 'late';
    v_round := jsonb_build_object(
      'no', r.round_no, 'is_finale', r.round_no = 9, 'phase', r.phase, 'kind', tt.kind, 'title', tt.title,
      'instructions', tt.instructions, 'duration_sec', tt.duration_sec, 'item_count', r.item_count,
      'opened_at', r.opened_at, 'ends_at', r.ends_at, 'paused_remaining_ms', r.paused_remaining_ms,
      'revealed_at', r.revealed_at, 'screen_item', r.screen_item, 'pin_solution', r.pin_solution,
      'content', case when r.phase in ('open','paused','closed','graded','revealed','done') then r.public_payload end,
      'bet_tracks', case when tt.kind = 'bet_puzzle' then tt.settings -> 'bet' -> 'tracks' end,
      -- Points at stake are shown as real numbers on screen and phones (computed here, never on a phone).
      'bet_base', case when tt.kind = 'bet_puzzle' then private.bet_base(p_instance, r.round_no) end,
      'solution', case when r.phase in ('revealed','done') then r.solution_payload end,
      'finalists', to_jsonb(r.finalists),
      'progress', jsonb_build_object('submitted_teams', v_submitted,
                    'total_teams', case when r.round_no = 9 then coalesce(cardinality(r.finalists), 0) else v_active end));
  end if;

  -- Standings are included when shown explicitly, or after a reveal (the screen switches to them
  -- automatically 15 s after revealed_at unless the host pinned the solution).
  if gi.screen_view in ('standings','final_results')
     or (r.phase in ('revealed','done') and not coalesce(r.pin_solution, false)) then
    select jsonb_agg(jsonb_build_object('team_id', x.team_id, 'total', x.total, 'rank', x.rk) order by x.total desc, x.team_id)
      into v_standings
    from (select team_id, total, rank() over (order by total desc) rk from private.team_totals(p_instance, true)) x
    where x.rk <= 5;
  end if;

  select jsonb_build_object('chosen_option', f.chosen_option,
           'prizes', case when f.chosen_option is not null then f.options -> 'options' -> (case f.chosen_option when 'A' then 0 else 1 end) end,
           'placements', f.placements)
    into v_finals from public.finals f where f.instance_id = p_instance and f.chosen_option is not null;

  -- One atomic upsert with the FULL state: clients never see an empty/partial row (fixes the
  -- "new game appears only after refresh" bug caused by a transient '{}' insert).
  insert into public.public_state as ps (instance_id, state, version, updated_at)
  values (p_instance, jsonb_build_object(
      'instance', jsonb_build_object('id', gi.id, 'mode', gi.mode, 'status', gi.status,
                                     'current_round', gi.current_round, 'screen_view', gi.screen_view),
      'teams', v_teams, 'round', v_round, 'standings', v_standings, 'finals', v_finals), 1, now())
  on conflict (instance_id) do update
    set state = excluded.state, version = ps.version + 1, updated_at = now();
end $$;

revoke execute on function private.refresh_public_state(uuid) from public, anon, authenticated;
