-- ═══════════════════════════════════════════════════════════════════════════
-- Registration v2:
--  • No game code: the QR leads straight to the open game.
--  • The team types only participant names; the server draws a funny Hanukkah team name.
--  • One phone per team. If it dies, the host issues a one-time transfer code.
--  • After each reveal the team's phone shows its score and rank; the screen shows only the top 5.
-- ═══════════════════════════════════════════════════════════════════════════

-- Non-destructive: the old second-phone functions (team_join, host_set_captain, team_register with a code)
-- stay in place but lose every grant below, so nothing can call them. join_pin is no longer filled.
alter table public.teams alter column join_pin drop not null;
alter table public.teams add column if not exists transfer_code text;
alter table public.teams add column if not exists transfer_expires_at timestamptz;
create unique index if not exists one_device_per_team on public.team_devices (team_id);

create or replace function private.funny_team_names() returns text[]
language sql immutable as $$
  select array[
    'הסופגניות המעופפות', 'לביבות בלי גבולות', 'הסביבונים המסתחררים', 'פך השמן האבוד', 'המכבים המנומנמים',
    'אנטיוכוס בהלם', 'הלביבה הלוהטת', 'דמי חנוכה דחופים', 'ריבה בכל מקום', 'אבקת סוכר על האף',
    'הנרות הסוררים', 'מעוז צחוק', 'חשמונאים בפיג׳מה', 'מטבעות השוקולד', 'מגדל הסופגניות',
    'השעווה המטפטפת', 'קופסת הגפרורים', 'סביבון על טורבו', 'נס גדול היה פה', 'פכים קטנים',
    'המכבים מהקומה השלישית', 'נר לכל אחד', 'הקרב על הריבה', 'סבתא מכבית', 'שמן זית כתית',
    'הלביבות הפריכות', 'נגה״ש נגה״פ', 'יהודה והחבר׳ה', 'החנוכייה החשמלית', 'עוד סופגנייה אחת',
    'גימל גימל', 'האורות הקטנים', 'הפתיליות', 'מבצע פך שמן', 'הנר התשיעי'
  ];
$$;

-- QR → names → a drawn funny name. No code, no team-name typing.
create or replace function public.team_register(p_members text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gi public.game_instances;
  v_team uuid;
  v_name text;
  v_count int;
  v_members text[];
  v_palette text[] := array['#F5B841','#E8604C','#4FB0C6','#7BC67E','#B57EDC','#F28AB2','#5C8DF6','#F0935A',
                            '#3FC1A5','#D6C14A','#C9705B','#8E9BF5','#E36FA0','#62B6E8','#A3C85A','#F2A65A','#9A7CF2','#4CC0C0','#E3B23C','#D96C6C'];
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into gi from public.game_instances where status <> 'archived' limit 1 for update;
  if not found then raise exception 'no_active_game'; end if;
  if gi.status <> 'registration_open' then raise exception 'registration_not_open'; end if;
  if exists (select 1 from public.team_devices where user_id = uid and instance_id = gi.id) then
    raise exception 'device_already_registered';
  end if;

  select coalesce(array_agg(m), '{}') into v_members
    from (select left(trim(x), 24) m from unnest(coalesce(p_members, '{}')) x where trim(x) <> '') s;
  if cardinality(v_members) = 0 then raise exception 'members_required'; end if;

  select count(*) into v_count from public.teams where instance_id = gi.id and status = 'active';
  if v_count >= coalesce((gi.settings ->> 'max_teams')::int, 20) then raise exception 'too_many_teams'; end if;

  -- Draw an unused funny name; fall back to a numbered name if the list runs out.
  select n into v_name from unnest(private.funny_team_names()) n
   where not exists (select 1 from public.teams t where t.instance_id = gi.id and lower(t.name) = lower(n))
   order by random() limit 1;
  v_name := coalesce(v_name, 'קבוצה ' || (v_count + 1));

  insert into public.teams (instance_id, name, color, members)
  values (gi.id, v_name, v_palette[1 + (v_count % array_length(v_palette, 1))], v_members)
  returning id into v_team;
  insert into public.team_devices (user_id, instance_id, team_id, role) values (uid, gi.id, v_team, 'captain');

  perform private.log_event(gi.id, 'team_registered', jsonb_build_object('team', v_team, 'name', v_name));
  perform private.refresh_public_state(gi.id);
  return jsonb_build_object('team_id', v_team, 'name', v_name);
end $$;

-- Host: one-time code (10 minutes) to move a team to a replacement phone.
create or replace function public.host_issue_transfer_code(p_team uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_instance uuid; v_code text;
begin
  perform private.require_host();
  select instance_id into v_instance from public.teams where id = p_team and status = 'active';
  if not found then raise exception 'team_not_found'; end if;
  perform private.lock_instance(v_instance);
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.teams where transfer_code = v_code and transfer_expires_at > now());
  end loop;
  update public.teams set transfer_code = v_code, transfer_expires_at = now() + interval '10 minutes' where id = p_team;
  perform private.log_event(v_instance, 'transfer_code_issued', jsonb_build_object('team', p_team));
  return v_code;
end $$;

-- Replacement phone claims the team; the old phone is disconnected from it.
create or replace function public.team_claim_transfer(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.teams;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into t from public.teams
   where transfer_code = trim(p_code) and transfer_expires_at > now() and status = 'active'
     and instance_id = private.active_instance_id()
   for update;
  if not found then raise exception 'bad_transfer_code'; end if;
  if exists (select 1 from public.team_devices where user_id = uid and instance_id = t.instance_id and team_id <> t.id) then
    raise exception 'device_already_registered';
  end if;
  delete from public.team_devices where team_id = t.id;
  insert into public.team_devices (user_id, instance_id, team_id, role) values (uid, t.instance_id, t.id, 'captain');
  update public.teams set transfer_code = null, transfer_expires_at = null where id = t.id;
  perform private.log_event(t.instance_id, 'team_transferred', jsonb_build_object('team', t.id));
  return jsonb_build_object('team_id', t.id, 'name', t.name);
end $$;

-- Team view: score + rank (revealed points only) are always included once the game runs.
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
  end if;

  return jsonb_build_object(
    'registered', true,
    'instance_id', v_instance,
    'team', jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'members', to_jsonb(t.members),
                               'status', t.status, 'role', td.role),
    'round_submissions', coalesce(v_subs, '[]'::jsonb),
    'bet', v_bet,
    'score', case when v_total is not null then jsonb_build_object('total', v_total, 'rank', v_rank, 'teams', v_teams) end);
end $$;

-- Screen standings: top 5 only (ties at 5th place included).
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
      'content', case when r.phase in ('open','paused','closed','graded','revealed','done') then r.public_payload end,
      'bet_tracks', case when tt.kind = 'bet_puzzle' then tt.settings -> 'bet' -> 'tracks' end,
      'solution', case when r.phase in ('revealed','done') then r.solution_payload end,
      'finalists', to_jsonb(r.finalists),
      'progress', jsonb_build_object('submitted_teams', v_submitted,
                    'total_teams', case when r.round_no = 9 then coalesce(cardinality(r.finalists), 0) else v_active end));
  end if;

  if gi.screen_view in ('standings','final_results') then
    select jsonb_agg(jsonb_build_object('team_id', x.team_id, 'total', x.total, 'rank', x.rk) order by x.total desc, x.team_id)
      into v_standings
    from (select team_id, total, rank() over (order by total desc) rk from private.team_totals(p_instance, true)) x
    where x.rk <= 5;
  end if;

  select jsonb_build_object('chosen_option', f.chosen_option,
           'prizes', case when f.chosen_option is not null then f.options -> 'options' -> (case f.chosen_option when 'A' then 0 else 1 end) end,
           'placements', f.placements)
    into v_finals from public.finals f where f.instance_id = p_instance and f.chosen_option is not null;

  insert into public.public_state (instance_id, state, version, updated_at)
  values (p_instance, '{}'::jsonb, 1, now()) on conflict (instance_id) do nothing;

  update public.public_state set
    state = jsonb_build_object(
      'instance', jsonb_build_object('id', gi.id, 'mode', gi.mode, 'status', gi.status,
                                     'current_round', gi.current_round, 'screen_view', gi.screen_view),
      'teams', v_teams, 'round', v_round, 'standings', v_standings, 'finals', v_finals),
    version = version + 1, updated_at = now()
  where instance_id = p_instance;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_host() to authenticated;
grant execute on function public.server_time(), public.round_progress() to anon, authenticated;
grant execute on function public.am_i_host() to authenticated;
grant execute on function
  public.host_create_instance(uuid, text), public.host_set_registration(uuid, boolean), public.host_start_game(uuid),
  public.host_round_action(uuid, int, text), public.host_next_round(uuid), public.host_choose_finals_option(uuid, text),
  public.host_set_screen_view(uuid, text), public.host_finish_game(uuid), public.host_adjust_score(uuid, uuid, int, int, text),
  public.host_remove_team(uuid), public.host_request_reset(uuid), public.host_confirm_reset(uuid, text, text),
  public.host_archive_instance(uuid), public.host_issue_transfer_code(uuid)
to authenticated;
grant execute on function public.team_register(text[]), public.team_claim_transfer(text),
  public.team_get_state(), public.team_place_bet(text) to authenticated;
