-- ═══════════════════════════════════════════════════════════════════════════
-- Game state machine + RPCs.
-- Host RPCs:    security definer, require public.hosts membership, lock the instance row.
-- Team RPCs:    security definer, identity = auth.uid() of an anonymous session.
-- svc_* RPCs:   executable ONLY by service_role (called from the Edge Function, which
--               holds the answer keys and runs the TypeScript grading engine).
-- Every mutation ends with private.refresh_public_state(), which bumps the version
-- of the screen-safe snapshot → Realtime pushes it to all screens/phones.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────── helpers ─────────────

create or replace function private.require_host() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.hosts where user_id = uid) then
    raise exception 'not_host' using errcode = '42501';
  end if;
  return uid;
end $$;

create or replace function private.log_event(p_instance uuid, p_type text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.game_events (instance_id, type, payload, actor) values (p_instance, p_type, p_payload, auth.uid());
$$;

create or replace function private.lock_instance(p_instance uuid) returns public.game_instances
language plpgsql security definer set search_path = '' as $$
declare gi public.game_instances;
begin
  select * into gi from public.game_instances where id = p_instance for update;
  if not found then raise exception 'instance_not_found'; end if;
  return gi;
end $$;

create or replace function private.active_instance_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.game_instances where status <> 'archived' limit 1;
$$;

-- Totals per active team. p_revealed_only=true → what the public may see.
create or replace function private.team_totals(p_instance uuid, p_revealed_only boolean)
returns table (team_id uuid, total int)
language sql stable security definer set search_path = '' as $$
  select t.id, greatest(0, coalesce(sum(se.points) filter (where se.revealed or not p_revealed_only), 0))::int
  from public.teams t
  left join public.score_events se on se.team_id = t.id
  where t.instance_id = p_instance and t.status = 'active'
  group by t.id;
$$;

create or replace function private.round_setting(p_instance uuid, p_round int, p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select tt.settings -> p_key from public.rounds r join public.task_templates tt on tt.id = r.task_id
  where r.instance_id = p_instance and r.round_no = p_round;
$$;

-- Build the screen-safe snapshot. NOTHING secret goes in here.
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

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color,
           'members', cardinality(t.members)) order by t.created_at), '[]'::jsonb), count(*)
    into v_teams, v_active
  from public.teams t where t.instance_id = p_instance and t.status = 'active';

  if gi.current_round is not null then
    select * into r from public.rounds where instance_id = p_instance and round_no = gi.current_round;
    select * into tt from public.task_templates where id = r.task_id;
    select count(distinct s.team_id) into v_submitted from public.submissions s
      where s.instance_id = p_instance and s.round_no = r.round_no and s.status <> 'late';
    v_round := jsonb_build_object(
      'no', r.round_no,
      'is_finale', r.round_no = 9,
      'phase', r.phase,
      'kind', tt.kind,
      'title', tt.title,
      'instructions', tt.instructions,
      'duration_sec', tt.duration_sec,
      'item_count', r.item_count,
      'opened_at', r.opened_at,
      'ends_at', r.ends_at,
      'paused_remaining_ms', r.paused_remaining_ms,
      'content', case when r.phase in ('open','paused','closed','graded','revealed','done') then r.public_payload end,
      'bet_tracks', case when tt.kind = 'bet_puzzle' then tt.settings -> 'bet' -> 'tracks' end,
      'solution', case when r.phase in ('revealed','done') then r.solution_payload end,
      'finalists', to_jsonb(r.finalists),
      'progress', jsonb_build_object('submitted_teams', v_submitted,
                    'total_teams', case when r.round_no = 9 then coalesce(cardinality(r.finalists), 0) else v_active end)
    );
  end if;

  -- Standings: only revealed points, and only when the host has put them on screen.
  if gi.screen_view in ('standings','final_results') then
    select jsonb_agg(jsonb_build_object('team_id', x.team_id, 'total', x.total) order by x.total desc)
      into v_standings from private.team_totals(p_instance, true) x;
  end if;

  select jsonb_build_object('chosen_option', f.chosen_option,
           'prizes', case when f.chosen_option is not null then f.options -> 'options' -> (case f.chosen_option when 'A' then 0 else 1 end) end,
           'placements', f.placements)
    into v_finals from public.finals f where f.instance_id = p_instance and f.chosen_option is not null;

  insert into public.public_state as ps (instance_id, state, version, updated_at)
  values (p_instance, '{}'::jsonb, 1, now())
  on conflict (instance_id) do nothing;

  update public.public_state set
    state = jsonb_build_object(
      'instance', jsonb_build_object('id', gi.id, 'mode', gi.mode, 'status', gi.status, 'join_code', gi.join_code,
                                     'current_round', gi.current_round, 'screen_view', gi.screen_view),
      'teams', v_teams,
      'round', v_round,
      'standings', v_standings,
      'finals', v_finals),
    version = version + 1,
    updated_at = now()
  where instance_id = p_instance;
end $$;

-- ───────────── public utilities ─────────────

-- Clock sync: clients estimate offset = server_now - (t0 + rtt/2).
create or replace function public.server_time() returns timestamptz
language sql stable set search_path = '' as $$ select clock_timestamp(); $$;
grant execute on function public.server_time() to anon, authenticated;

create or replace function public.am_i_host() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_host(); $$;
grant execute on function public.am_i_host() to authenticated;

-- Live "x / y teams submitted" for the projector (polled every ~2 s). Counts only, nothing else.
create or replace function public.round_progress()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'round', gi.current_round,
    'submitted_teams', (select count(distinct s.team_id) from public.submissions s
                        where s.instance_id = gi.id and s.round_no = gi.current_round and s.status <> 'late'),
    'total_teams', case when gi.current_round = 9
                     then coalesce((select cardinality(r.finalists) from public.rounds r where r.instance_id = gi.id and r.round_no = 9), 0)
                     else (select count(*) from public.teams t where t.instance_id = gi.id and t.status = 'active') end)
  from public.game_instances gi where gi.status = 'in_progress';
$$;

-- Bet base for a round: average of all active teams' totals (incl. unrevealed rounds), rounded down to 100.
create or replace function private.bet_base(p_instance uuid, p_round int)
returns int language plpgsql stable security definer set search_path = '' as $$
declare v_bet jsonb := private.round_setting(p_instance, p_round, 'bet'); v_avg numeric;
begin
  if v_bet ->> 'baseMethod' = 'fixed' then return (v_bet ->> 'fixedBase')::int; end if;
  select avg(total) into v_avg from private.team_totals(p_instance, false);
  return greatest(coalesce((v_bet ->> 'minBase')::int, 100), (floor(coalesce(v_avg, 0) / 100) * 100)::int);
end $$;

-- ───────────── host: lifecycle ─────────────

create or replace function public.host_create_instance(p_template uuid, p_mode text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_host();
  gt public.game_templates;
  v_id uuid;
  v_code text;
  bad int;
begin
  if p_mode not in ('demo','live') then raise exception 'bad_mode'; end if;
  if private.active_instance_id() is not null then raise exception 'active_instance_exists'; end if;
  select * into gt from public.game_templates where id = p_template;
  if not found then raise exception 'template_not_found'; end if;

  -- Exactly 9 rounds: 1..8 regular, 9 = finale (השַׁמָּשׁ).
  if (select count(*) from public.game_template_rounds where template_id = p_template) <> 9 then
    raise exception 'template_must_have_9_rounds';
  end if;
  select count(*) into bad from public.game_template_rounds gr join public.task_templates t on t.id = gr.task_id
   where gr.template_id = p_template and ((gr.round_no = 9) <> (t.kind = 'finale'));
  if bad > 0 then raise exception 'round_9_must_be_finale_and_only_round_9'; end if;

  if p_mode = 'live' then
    if gt.is_placeholder then raise exception 'template_is_placeholder'; end if;
    select count(*) into bad from public.game_template_rounds gr join public.task_templates t on t.id = gr.task_id
      left join private.task_secrets s on s.task_id = t.id
     where gr.template_id = p_template and (t.is_placeholder or t.status <> 'approved' or s.verified_at is null);
    if bad > 0 then raise exception 'live_requires_approved_verified_tasks (% not ready)', bad; end if;
  end if;

  loop
    v_code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
               from generate_series(1, 4));
    exit when not exists (select 1 from public.game_instances where join_code = v_code);
  end loop;

  insert into public.game_instances (template_id, mode, join_code, settings, created_by)
  values (p_template, p_mode, v_code, gt.settings, uid) returning id into v_id;

  insert into public.rounds (instance_id, round_no, task_id, item_count)
  select v_id, gr.round_no, gr.task_id,
         greatest(1, coalesce(jsonb_array_length(s.answer_key -> 'items'), jsonb_array_length(s.answer_key -> 'stages'), 1))
  from public.game_template_rounds gr
  left join private.task_secrets s on s.task_id = gr.task_id
  where gr.template_id = p_template;

  perform private.log_event(v_id, 'instance_created', jsonb_build_object('mode', p_mode));
  perform private.refresh_public_state(v_id);
  return v_id;
end $$;

create or replace function public.host_set_registration(p_instance uuid, p_open boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare gi public.game_instances;
begin
  perform private.require_host();
  gi := private.lock_instance(p_instance);
  if gi.status not in ('setup','registration_open','registration_locked') then raise exception 'registration_closed_game_started'; end if;
  update public.game_instances set status = case when p_open then 'registration_open' else 'registration_locked' end
   where id = p_instance;
  perform private.log_event(p_instance, case when p_open then 'registration_opened' else 'registration_locked' end);
  perform private.refresh_public_state(p_instance);
end $$;

create or replace function public.host_start_game(p_instance uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare gi public.game_instances;
begin
  perform private.require_host();
  gi := private.lock_instance(p_instance);
  if gi.status = 'in_progress' then return; end if;                 -- idempotent
  if gi.status <> 'registration_locked' then raise exception 'lock_registration_first'; end if;
  if (select count(*) from public.teams where instance_id = p_instance and status = 'active') < 2 then
    raise exception 'need_at_least_2_teams';
  end if;
  update public.game_instances set status = 'in_progress', current_round = 1 where id = p_instance;
  update public.rounds set phase = 'intro' where instance_id = p_instance and round_no = 1;
  perform private.log_event(p_instance, 'game_started');
  perform private.refresh_public_state(p_instance);
end $$;

-- Round transitions. Repeating an action that already happened is a no-op (double taps).
create or replace function public.host_round_action(p_instance uuid, p_round int, p_action text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  gi public.game_instances;
  r public.rounds;
  tt public.task_templates;
  v_target text;
  v_allowed text[];
  v_remaining int;
begin
  perform private.require_host();
  gi := private.lock_instance(p_instance);
  if gi.status <> 'in_progress' then raise exception 'game_not_in_progress'; end if;
  if gi.current_round is distinct from p_round then raise exception 'not_current_round'; end if;
  select * into r from public.rounds where instance_id = p_instance and round_no = p_round for update;
  select * into tt from public.task_templates where id = r.task_id;

  case p_action
    when 'open_betting' then v_target := 'betting';     v_allowed := array['intro'];
    when 'lock_bets'    then v_target := 'bets_locked'; v_allowed := array['betting'];
    when 'open'         then v_target := 'open';
         v_allowed := case when tt.kind = 'bet_puzzle' then array['bets_locked'] else array['intro'] end;
    when 'pause'        then v_target := 'paused';      v_allowed := array['open'];
    when 'resume'       then v_target := 'open';        v_allowed := array['paused'];
    when 'close'        then v_target := 'closed';      v_allowed := array['open','paused'];
    when 'reveal'       then v_target := 'revealed';    v_allowed := array['graded'];
    else raise exception 'unknown_action %', p_action;
  end case;

  if r.phase = v_target then return r.phase; end if;               -- idempotent
  if not (r.phase = any (v_allowed)) then
    raise exception 'illegal_transition % -> % (round %)', r.phase, v_target, p_round;
  end if;
  if p_round = 9 and p_action = 'open' and (r.finalists is null
       or not exists (select 1 from public.finals f where f.instance_id = p_instance and f.chosen_option is not null)) then
    raise exception 'finals_option_must_be_chosen_first';
  end if;

  if p_action = 'open' then
    update public.rounds set phase = 'open', opened_at = clock_timestamp(),
           ends_at = clock_timestamp() + make_interval(secs => tt.duration_sec),
           public_payload = tt.public_content || jsonb_build_object('assets', tt.assets)
     where instance_id = p_instance and round_no = p_round;
  elsif p_action = 'pause' then
    v_remaining := greatest(0, (extract(epoch from (r.ends_at - clock_timestamp())) * 1000)::int);
    update public.rounds set phase = 'paused', paused_remaining_ms = v_remaining, ends_at = null
     where instance_id = p_instance and round_no = p_round;
  elsif p_action = 'resume' then
    update public.rounds set phase = 'open', ends_at = clock_timestamp() + make_interval(secs => r.paused_remaining_ms / 1000.0),
           paused_remaining_ms = null
     where instance_id = p_instance and round_no = p_round;
  elsif p_action = 'close' then
    update public.rounds set phase = 'closed', ends_at = least(coalesce(ends_at, clock_timestamp()), clock_timestamp()),
           paused_remaining_ms = null
     where instance_id = p_instance and round_no = p_round;
  elsif p_action = 'reveal' then
    -- Solutions become public only now; scores of this round become visible.
    update public.rounds set phase = 'revealed',
           solution_payload = (select s.answer_key from private.task_secrets s where s.task_id = r.task_id)
     where instance_id = p_instance and round_no = p_round;
    update public.score_events set revealed = true where instance_id = p_instance and round_no = p_round;
  elsif p_action = 'lock_bets' then
    -- Teams that didn't choose are placed on the default (no-loss) track, so nobody is left out.
    insert into public.bets (instance_id, round_no, team_id, track_id, base_points, total_before)
    select p_instance, p_round, t.id,
           coalesce(tt.settings -> 'bet' ->> 'defaultTrack',
                    (select e ->> 'id' from jsonb_array_elements(tt.settings -> 'bet' -> 'tracks') e
                      where (e ->> 'lossMultiplier')::numeric = 0 limit 1)),
           private.bet_base(p_instance, p_round), tot.total
    from public.teams t
    join private.team_totals(p_instance, false) tot on tot.team_id = t.id
    where t.instance_id = p_instance and t.status = 'active'
      and not exists (select 1 from public.bets b where b.team_id = t.id and b.round_no = p_round);
    update public.rounds set phase = 'bets_locked' where instance_id = p_instance and round_no = p_round;
  else
    update public.rounds set phase = v_target where instance_id = p_instance and round_no = p_round;
  end if;

  perform private.log_event(p_instance, 'round_' || p_action, jsonb_build_object('round', p_round));
  perform private.refresh_public_state(p_instance);
  return v_target;
end $$;

create or replace function public.host_next_round(p_instance uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare gi public.game_instances; v_phase text;
begin
  perform private.require_host();
  gi := private.lock_instance(p_instance);
  if gi.status <> 'in_progress' then raise exception 'game_not_in_progress'; end if;
  select phase into v_phase from public.rounds where instance_id = p_instance and round_no = gi.current_round;
  if v_phase <> 'revealed' then raise exception 'reveal_current_round_first'; end if;
  if gi.current_round = 9 then raise exception 'use_host_finish_game'; end if;
  if gi.current_round = 8 and not exists (select 1 from public.finals where instance_id = p_instance) then
    raise exception 'compute_finals_options_first';
  end if;
  update public.rounds set phase = 'done' where instance_id = p_instance and round_no = gi.current_round;
  update public.rounds set phase = 'intro' where instance_id = p_instance and round_no = gi.current_round + 1;
  update public.game_instances set current_round = gi.current_round + 1, screen_view = 'auto' where id = p_instance;
  perform private.log_event(p_instance, 'next_round', jsonb_build_object('round', gi.current_round + 1));
  perform private.refresh_public_state(p_instance);
  return gi.current_round + 1;
end $$;

create or replace function public.host_choose_finals_option(p_instance uuid, p_option text)
returns void language plpgsql security definer set search_path = '' as $$
declare gi public.game_instances;
begin
  perform private.require_host();
  gi := private.lock_instance(p_instance);
  if p_option not in ('A','B') then raise exception 'bad_option'; end if;
  if exists (select 1 from public.rounds where instance_id = p_instance and round_no = 9 and phase not in ('pending','intro')) then
    raise exception 'finals_already_started';
  end if;
  update public.finals set chosen_option = p_option, chosen_at = now() where instance_id = p_instance;
  if not found then raise exception 'compute_finals_options_first'; end if;
  perform private.log_event(p_instance, 'finals_option_chosen', jsonb_build_object('option', p_option));
  perform private.refresh_public_state(p_instance);
end $$;

create or replace function public.host_set_screen_view(p_instance uuid, p_view text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_host();
  perform private.lock_instance(p_instance);
  update public.game_instances set screen_view = p_view where id = p_instance;
  perform private.refresh_public_state(p_instance);
end $$;

create or replace function public.host_finish_game(p_instance uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare gi public.game_instances;
begin
  perform private.require_host();
  gi := private.lock_instance(p_instance);
  if gi.status = 'finished' then return; end if;
  if gi.current_round <> 9 or (select phase from public.rounds where instance_id = p_instance and round_no = 9) <> 'revealed' then
    raise exception 'reveal_finale_first';
  end if;
  update public.rounds set phase = 'done' where instance_id = p_instance and round_no = 9;
  update public.game_instances set status = 'finished', finished_at = now(), screen_view = 'final_results' where id = p_instance;
  perform private.log_event(p_instance, 'game_finished');
  perform private.refresh_public_state(p_instance);
end $$;

-- Manual, audited correction (e.g. a dispute). Hidden until the host reveals the round.
create or replace function public.host_adjust_score(p_instance uuid, p_team uuid, p_round int, p_points int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_host();
begin
  perform private.lock_instance(p_instance);
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  insert into public.score_events (instance_id, team_id, round_no, source_key, points, reason, created_by)
  values (p_instance, p_team, p_round, 'manual:' || gen_random_uuid(), p_points, p_reason, uid);
  perform private.log_event(p_instance, 'manual_score', jsonb_build_object('team', p_team, 'points', p_points, 'reason', p_reason));
end $$;

create or replace function public.host_set_captain(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_instance uuid;
begin
  perform private.require_host();
  select instance_id into v_instance from public.teams where id = p_team;
  perform private.lock_instance(v_instance);
  if not exists (select 1 from public.team_devices where team_id = p_team and user_id = p_user) then
    raise exception 'device_not_in_team';
  end if;
  update public.team_devices set role = 'member' where team_id = p_team and role = 'captain';
  update public.team_devices set role = 'captain' where team_id = p_team and user_id = p_user;
  perform private.log_event(v_instance, 'captain_changed', jsonb_build_object('team', p_team, 'user', p_user));
end $$;

create or replace function public.host_remove_team(p_team uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_instance uuid;
begin
  perform private.require_host();
  select instance_id into v_instance from public.teams where id = p_team;
  perform private.lock_instance(v_instance);
  update public.teams set status = 'removed' where id = p_team;
  perform private.log_event(v_instance, 'team_removed', jsonb_build_object('team', p_team));
  perform private.refresh_public_state(v_instance);
end $$;

-- ───────────── host: demo reset (two-step, server-enforced) ─────────────

create or replace function public.host_request_reset(p_instance uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_host(); gi public.game_instances; v_token uuid;
begin
  select * into gi from public.game_instances where id = p_instance;
  if gi.mode <> 'demo' then raise exception 'only_demo_instances_can_be_reset'; end if;
  delete from private.reset_requests where expires_at < now();
  insert into private.reset_requests (instance_id, requested_by) values (p_instance, uid) returning token into v_token;
  return v_token;
end $$;

-- p_scope: 'reset' → same instance back to setup (keeps join code); 'delete' → archive-delete the demo entirely.
create or replace function public.host_confirm_reset(p_token uuid, p_confirm_text text, p_scope text default 'reset')
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_host(); rr private.reset_requests; gi public.game_instances;
begin
  if p_confirm_text <> 'איפוס' then raise exception 'confirmation_text_mismatch'; end if;
  delete from private.reset_requests where token = p_token and requested_by = uid and expires_at > now() returning * into rr;
  if not found then raise exception 'reset_token_invalid_or_expired'; end if;
  gi := private.lock_instance(rr.instance_id);
  if gi.mode <> 'demo' then raise exception 'only_demo_instances_can_be_reset'; end if;

  if p_scope = 'delete' then
    delete from public.game_instances where id = gi.id;              -- cascades everything instance-scoped
    return;
  end if;

  delete from public.teams where instance_id = gi.id;                 -- cascades devices, submissions, bets, score events
  delete from public.score_events where instance_id = gi.id;
  delete from public.finals where instance_id = gi.id;
  delete from public.game_events where instance_id = gi.id;
  update public.rounds set phase = 'pending', opened_at = null, ends_at = null, paused_remaining_ms = null,
         public_payload = null, solution_payload = null, finalists = null
   where instance_id = gi.id;
  update public.game_instances set status = 'setup', current_round = null, screen_view = 'auto', finished_at = null
   where id = gi.id;
  perform private.log_event(gi.id, 'demo_reset');
  perform private.refresh_public_state(gi.id);
end $$;

create or replace function public.host_archive_instance(p_instance uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_host();
  perform private.lock_instance(p_instance);
  update public.game_instances set status = 'archived' where id = p_instance;
  perform private.log_event(p_instance, 'archived');
  perform private.refresh_public_state(p_instance);   -- screens drop the archived game
end $$;

-- ───────────── teams ─────────────

create or replace function public.team_register(p_join_code text, p_name text, p_members text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gi public.game_instances;
  v_team uuid;
  v_pin text := lpad((floor(random() * 10000))::int::text, 4, '0');
  v_palette text[] := array['#F5B841','#E8604C','#4FB0C6','#7BC67E','#B57EDC','#F28AB2','#5C8DF6','#F0935A',
                            '#3FC1A5','#D6C14A','#C9705B','#8E9BF5','#E36FA0','#62B6E8','#A3C85A','#F2A65A','#9A7CF2','#4CC0C0','#E3B23C','#D96C6C'];
  v_count int;
  v_members text[];
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into gi from public.game_instances where join_code = upper(trim(p_join_code)) and status <> 'archived' for update;
  if not found then raise exception 'bad_join_code'; end if;
  if gi.status <> 'registration_open' then raise exception 'registration_not_open'; end if;
  if exists (select 1 from public.team_devices where user_id = uid and instance_id = gi.id) then
    raise exception 'device_already_registered';
  end if;
  select count(*) into v_count from public.teams where instance_id = gi.id and status = 'active';
  if v_count >= coalesce((gi.settings ->> 'max_teams')::int, 20) then raise exception 'too_many_teams'; end if;

  -- PIN must be unique within the game, otherwise a 2nd phone could join the wrong team.
  while exists (select 1 from public.teams where instance_id = gi.id and join_pin = v_pin) loop
    v_pin := lpad((floor(random() * 10000))::int::text, 4, '0');
  end loop;

  select coalesce(array_agg(m), '{}') into v_members
    from (select left(trim(x), 24) m from unnest(coalesce(p_members, '{}')) x where trim(x) <> '') s;

  insert into public.teams (instance_id, name, color, members, join_pin)
  values (gi.id, trim(p_name), v_palette[1 + (v_count % array_length(v_palette, 1))], v_members, v_pin)
  returning id into v_team;
  insert into public.team_devices (user_id, instance_id, team_id, role) values (uid, gi.id, v_team, 'captain');

  perform private.log_event(gi.id, 'team_registered', jsonb_build_object('team', v_team, 'name', trim(p_name)));
  perform private.refresh_public_state(gi.id);
  return jsonb_build_object('team_id', v_team, 'pin', v_pin);
exception when unique_violation then
  raise exception 'team_name_taken';
end $$;

-- Second phone of a team (needs the 4-digit PIN shown on the captain's phone).
create or replace function public.team_join(p_join_code text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); gi public.game_instances; v_team uuid; v_devices int;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into gi from public.game_instances where join_code = upper(trim(p_join_code)) and status <> 'archived';
  if not found then raise exception 'bad_join_code'; end if;
  if gi.status in ('finished') then raise exception 'game_finished'; end if;
  select id into v_team from public.teams where instance_id = gi.id and join_pin = trim(p_pin) and status = 'active';
  if not found then raise exception 'bad_pin'; end if;
  if exists (select 1 from public.team_devices where user_id = uid and instance_id = gi.id) then
    return jsonb_build_object('team_id', (select team_id from public.team_devices where user_id = uid and instance_id = gi.id));
  end if;
  select count(*) into v_devices from public.team_devices where team_id = v_team;
  if v_devices >= coalesce((gi.settings ->> 'max_devices_per_team')::int, 3) then raise exception 'too_many_devices'; end if;
  insert into public.team_devices (user_id, instance_id, team_id, role) values (uid, gi.id, v_team, 'member');
  perform private.log_event(gi.id, 'device_joined', jsonb_build_object('team', v_team));
  return jsonb_build_object('team_id', v_team);
end $$;

-- Everything a phone needs after (re)connecting. Never includes answer keys or unrevealed scores.
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

  if gi.screen_view in ('standings','final_results') then
    select x.total, x.rk into v_total, v_rank from (
      select team_id, total, rank() over (order by total desc) rk from private.team_totals(v_instance, true)) x
    where x.team_id = t.id;
  end if;

  return jsonb_build_object(
    'registered', true,
    'instance_id', v_instance,
    'team', jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'members', to_jsonb(t.members),
                               'status', t.status, 'role', td.role,
                               'pin', case when td.role = 'captain' then t.join_pin end),
    'round_submissions', coalesce(v_subs, '[]'::jsonb),
    'bet', v_bet,
    'score', case when v_total is not null then jsonb_build_object('total', v_total, 'rank', v_rank) end);
end $$;

-- Bets are placed BEFORE the puzzle is shown (phase 'betting'); base is computed server-side.
create or replace function public.team_place_bet(p_track text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_instance uuid := private.active_instance_id();
  td public.team_devices;
  gi public.game_instances;
  r public.rounds;
  v_bet jsonb;
  v_base int;
  v_before int;
begin
  select * into td from public.team_devices where user_id = uid and instance_id = v_instance;
  if not found then raise exception 'not_in_team'; end if;
  if td.role <> 'captain' then raise exception 'captain_only'; end if;
  select * into gi from public.game_instances where id = v_instance;
  select * into r from public.rounds where instance_id = v_instance and round_no = gi.current_round for update;
  if r.phase <> 'betting' then raise exception 'betting_closed'; end if;
  v_bet := private.round_setting(v_instance, r.round_no, 'bet');
  if not exists (select 1 from jsonb_array_elements(v_bet -> 'tracks') e where e ->> 'id' = p_track) then
    raise exception 'unknown_track';
  end if;
  v_base := private.bet_base(v_instance, r.round_no);
  select total into v_before from private.team_totals(v_instance, false) where team_id = td.team_id;

  insert into public.bets (instance_id, round_no, team_id, track_id, base_points, total_before)
  values (v_instance, r.round_no, td.team_id, p_track, v_base, v_before)
  on conflict (team_id, round_no) do update set track_id = excluded.track_id, placed_at = clock_timestamp();
  perform private.log_event(v_instance, 'bet_placed', jsonb_build_object('team', td.team_id, 'track', p_track));
  return jsonb_build_object('track_id', p_track, 'base_points', v_base, 'total_before', v_before);
end $$;

-- ───────────── service role (Edge Function) ─────────────

-- Validates & stores a submission atomically. Returns the row + answer key for grading.
create or replace function public.svc_record_submission(
  p_user uuid, p_request uuid, p_item int, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_instance uuid := private.active_instance_id();
  td public.team_devices;
  gi public.game_instances;
  r public.rounds;
  tt public.task_templates;
  s public.submissions;
  v_now timestamptz := clock_timestamp();
  v_grace interval;
  v_attempts int;
  v_limit int;
  v_status text := 'received';
  v_key jsonb;
begin
  -- Idempotent retry: same device + same request id → same answer.
  select * into s from public.submissions where submitted_by = p_user and client_request_id = p_request;
  if found then return jsonb_build_object('duplicate', true, 'submission', to_jsonb(s)); end if;

  select * into td from public.team_devices where user_id = p_user and instance_id = v_instance;
  if not found then raise exception 'not_in_team'; end if;
  if (select status from public.teams where id = td.team_id) <> 'active' then raise exception 'team_removed'; end if;
  select * into gi from public.game_instances where id = v_instance;
  if gi.status <> 'in_progress' then raise exception 'game_not_in_progress'; end if;

  -- Serialize per team+round so two phones can't race past attempt/lock rules.
  perform pg_advisory_xact_lock(hashtext(td.team_id::text || ':' || gi.current_round));

  select * into r from public.rounds where instance_id = v_instance and round_no = gi.current_round;
  select * into tt from public.task_templates where id = r.task_id;
  if tt.submission_policy = 'captain_only' and td.role <> 'captain' then raise exception 'captain_only'; end if;
  if r.round_no = 9 and not (td.team_id = any (coalesce(r.finalists, '{}'))) then raise exception 'not_a_finalist'; end if;
  if p_item < 0 or p_item >= r.item_count then raise exception 'bad_item'; end if;
  if r.phase = 'paused' then raise exception 'round_paused'; end if;
  if r.phase not in ('open','closed') then raise exception 'round_not_open'; end if;

  v_grace := make_interval(secs => coalesce((gi.settings ->> 'late_grace_ms')::numeric, 1500) / 1000.0);
  -- ends_at = timer end, or the moment the host closed the round. A short grace absorbs network latency
  -- for answers sent just before the buzzer; anything later is stored (for audit) but marked late.
  if r.ends_at is null or v_now > r.ends_at + v_grace then v_status := 'late'; end if;

  -- Already solved this item?
  if exists (select 1 from public.submissions where team_id = td.team_id and round_no = r.round_no
             and item_index = p_item and status = 'graded' and ratio = 1) then
    raise exception 'already_solved';
  end if;
  select count(*) into v_attempts from public.submissions
   where team_id = td.team_id and round_no = r.round_no and item_index = p_item and status <> 'late';
  v_limit := coalesce(tt.attempts_limit, 1);
  if v_attempts >= v_limit then raise exception 'no_attempts_left'; end if;
  -- Sequential tasks (sprint, sequence memory): no going back, no skipping.
  if coalesce((tt.settings ->> 'sequential')::boolean, false) then
    if p_item <> (select count(distinct item_index) from public.submissions
                  where team_id = td.team_id and round_no = r.round_no and status <> 'late') then
      raise exception 'item_locked_or_out_of_order';
    end if;
  end if;
  -- Elimination (sequence memory): any failed stage ends the team's run.
  if coalesce((tt.settings ->> 'eliminate_on_fail')::boolean, false) and exists (
       select 1 from public.submissions where team_id = td.team_id and round_no = r.round_no and status = 'graded' and ratio < 1) then
    raise exception 'eliminated';
  end if;


  insert into public.submissions (instance_id, round_no, team_id, item_index, attempt_no, payload, submitted_by,
                                  client_request_id, received_at, status)
  values (v_instance, r.round_no, td.team_id, p_item, v_attempts + 1, p_payload, p_user, p_request, v_now, v_status)
  returning * into s;

  select answer_key into v_key from private.task_secrets where task_id = r.task_id;
  -- NOTE: deliberately no refresh_public_state() here. A burst of submissions × every subscribed
  -- phone would exceed Realtime's message rate on the Free plan. The screen polls round_progress().
  return jsonb_build_object('duplicate', false, 'submission', to_jsonb(s), 'answer_key', v_key,
    'task', jsonb_build_object('id', tt.id, 'kind', tt.kind, 'scoring', tt.scoring, 'settings', tt.settings,
                               'attempts_limit', v_limit, 'opened_at', r.opened_at, 'duration_sec', tt.duration_sec));
end $$;

-- Store a grade and (idempotently) the resulting points. Points stay hidden until reveal.
create or replace function public.svc_apply_grade(p_submission bigint, p_grade jsonb, p_ratio numeric, p_points int, p_needs_review boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.submissions;
begin
  select * into s from public.submissions where id = p_submission for update;
  if not found then raise exception 'submission_not_found'; end if;
  if s.status = 'late' then return; end if;
  update public.submissions set grade = p_grade, ratio = p_ratio,
         status = case when p_needs_review then 'needs_review' else 'graded' end
   where id = p_submission;
  if not p_needs_review and p_points <> 0 then
    insert into public.score_events (instance_id, team_id, round_no, source_key, points, reason, detail)
    values (s.instance_id, s.team_id, s.round_no, 'r' || s.round_no || ':item' || s.item_index, p_points, 'auto_grade',
            jsonb_build_object('submission', s.id, 'ratio', p_ratio))
    on conflict (instance_id, team_id, source_key) do nothing;   -- never double-score an item
  end if;
end $$;

-- Batch insert of computed score events (round-level: bets, finals, time bonuses). Idempotent.
create or replace function public.svc_write_scores(p_instance uuid, p_round int, p_events jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.score_events (instance_id, team_id, round_no, source_key, points, reason, detail)
  select p_instance, (e ->> 'team_id')::uuid, p_round, e ->> 'source_key', (e ->> 'points')::int, e ->> 'reason', e -> 'detail'
  from jsonb_array_elements(p_events) e
  on conflict (instance_id, team_id, source_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.svc_round_context(p_instance uuid, p_round int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'round', to_jsonb(r),
    'task', to_jsonb(tt),
    'answer_key', s.answer_key,
    'instance_settings', gi.settings,
    'submissions', coalesce((select jsonb_agg(to_jsonb(x) order by x.received_at) from public.submissions x
                              where x.instance_id = p_instance and x.round_no = p_round), '[]'::jsonb),
    'bets', coalesce((select jsonb_agg(to_jsonb(b)) from public.bets b where b.instance_id = p_instance and b.round_no = p_round), '[]'::jsonb),
    'totals_all', (select jsonb_agg(jsonb_build_object('team_id', team_id, 'total', total)) from private.team_totals(p_instance, false)))
  from public.rounds r
  join public.task_templates tt on tt.id = r.task_id
  join public.game_instances gi on gi.id = r.instance_id
  left join private.task_secrets s on s.task_id = r.task_id
  where r.instance_id = p_instance and r.round_no = p_round;
$$;

create or replace function public.svc_mark_graded(p_instance uuid, p_round int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_instance(p_instance);
  if exists (select 1 from public.submissions where instance_id = p_instance and round_no = p_round and status in ('received','needs_review')) then
    raise exception 'ungraded_or_review_pending';
  end if;
  update public.rounds set phase = 'graded' where instance_id = p_instance and round_no = p_round and phase = 'closed';
  if not found then raise exception 'round_must_be_closed'; end if;
  perform private.log_event(p_instance, 'round_graded', jsonb_build_object('round', p_round));
  perform private.refresh_public_state(p_instance);
end $$;

create or replace function public.svc_set_finals(p_instance uuid, p_finalists uuid[], p_snapshot jsonb, p_options jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_instance(p_instance);
  if exists (select 1 from public.finals where instance_id = p_instance and chosen_option is not null) then
    raise exception 'finals_option_already_chosen';
  end if;
  insert into public.finals (instance_id, finalists, options) values (p_instance, p_snapshot, p_options)
  on conflict (instance_id) do update set finalists = excluded.finalists, options = excluded.options;
  update public.rounds set finalists = p_finalists where instance_id = p_instance and round_no = 9;
  perform private.log_event(p_instance, 'finals_options_computed', p_options);
  perform private.refresh_public_state(p_instance);
end $$;

create or replace function public.svc_set_finals_placements(p_instance uuid, p_placements jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.finals set placements = p_placements where instance_id = p_instance;
$$;

-- ───────────── grants ─────────────
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_host() to authenticated;   -- used inside RLS policies

grant execute on function public.server_time() to anon, authenticated;
grant execute on function public.round_progress() to anon, authenticated;
grant execute on function public.am_i_host() to authenticated;
grant execute on function
  public.host_create_instance(uuid, text), public.host_set_registration(uuid, boolean), public.host_start_game(uuid),
  public.host_round_action(uuid, int, text), public.host_next_round(uuid), public.host_choose_finals_option(uuid, text),
  public.host_set_screen_view(uuid, text), public.host_finish_game(uuid), public.host_adjust_score(uuid, uuid, int, int, text),
  public.host_set_captain(uuid, uuid), public.host_remove_team(uuid), public.host_request_reset(uuid),
  public.host_confirm_reset(uuid, text, text), public.host_archive_instance(uuid)
to authenticated;
grant execute on function public.team_register(text, text, text[]), public.team_join(text, text),
  public.team_get_state(), public.team_place_bet(text) to authenticated;

grant execute on function public.svc_record_submission(uuid, uuid, int, jsonb), public.svc_apply_grade(bigint, jsonb, numeric, int, boolean),
  public.svc_write_scores(uuid, int, jsonb), public.svc_round_context(uuid, int), public.svc_mark_graded(uuid, int),
  public.svc_set_finals(uuid, uuid[], jsonb, jsonb), public.svc_set_finals_placements(uuid, jsonb)
to service_role;

-- Realtime: broadcast changes of the safe snapshot only.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.public_state;
  end if;
end $$;
