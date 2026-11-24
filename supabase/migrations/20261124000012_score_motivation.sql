-- Phone score card: 'X more points and you are in place Y' / leader: how close the runner-up is.
create or replace function public.team_get_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_instance uuid := private.active_instance_id();
  td public.team_devices;
  t public.teams;
  gi public.game_instances;
  v_feedback boolean;
  v_subs jsonb;
  v_bet jsonb;
  v_total int;
  v_rank int;
  v_teams int;
  v_above int;       -- total of the team(s) right above us
  v_above_rank int;
  v_below int;       -- (leader) total of the runner-up
  v_tied int;
begin
  if uid is null or v_instance is null then return jsonb_build_object('registered', false); end if;
  select * into td from public.team_devices where user_id = uid and instance_id = v_instance;
  if not found then return jsonb_build_object('registered', false, 'instance_id', v_instance); end if;
  select * into t from public.teams where id = td.team_id;
  select * into gi from public.game_instances where id = v_instance;

  if gi.current_round is not null then
    v_feedback := coalesce((private.round_setting(v_instance, gi.current_round, 'instant_feedback'))::boolean, false)
               or exists (select 1 from public.rounds where instance_id = v_instance and round_no = gi.current_round and phase in ('revealed','done'));
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_index', s.item_index, 'attempt_no', s.attempt_no, 'status', s.status, 'received_at', s.received_at,
             'correct', case when v_feedback and s.status = 'graded' then s.ratio = 1 end) order by s.item_index, s.attempt_no), '[]'::jsonb)
      into v_subs
    from public.submissions s where s.team_id = t.id and s.round_no = gi.current_round;
    select jsonb_build_object('track_id', b.track_id, 'base_points', b.base_points) into v_bet
      from public.bets b where b.team_id = t.id and b.round_no = gi.current_round;
  end if;

  if gi.status in ('in_progress','finished') then
    select x.total, x.rk, x.n into v_total, v_rank, v_teams from (
      select team_id, total, rank() over (order by total desc) rk, count(*) over () n
      from private.team_totals(v_instance, true)) x
    where x.team_id = t.id;
    if v_total is not null then
      select min(total) into v_above from private.team_totals(v_instance, true) where total > v_total;
      if v_above is not null then
        select 1 + count(*) into v_above_rank from private.team_totals(v_instance, true) where total > v_above;
      end if;
      select max(total) into v_below from private.team_totals(v_instance, true) where total < v_total;
      select count(*) - 1 into v_tied from private.team_totals(v_instance, true) where total = v_total;
    end if;
  end if;

  return jsonb_build_object(
    'registered', true,
    'instance_id', v_instance,
    'team', jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'members', to_jsonb(t.members),
                               'status', t.status, 'role', td.role),
    'round_submissions', coalesce(v_subs, '[]'::jsonb),
    'bet', v_bet,
    'score', case when v_total is not null then jsonb_build_object('total', v_total, 'rank', v_rank, 'teams', v_teams,
      -- motivation line: how far to the next place up; for the leader, how close the runner-up is
      'gap_up', case when v_above is not null then v_above - v_total end,
      'rank_up', v_above_rank,
      'gap_down', case when v_rank = 1 and v_tied = 0 and v_below is not null then v_total - v_below end,
      'tied', v_tied) end);
end $$;

