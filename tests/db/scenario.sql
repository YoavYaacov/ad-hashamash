-- End-to-end SQL scenario: permissions, registration, submissions, idempotency, scoring, reveal, reset.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema if not exists t;
create or replace function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL: %', label; end if;
  raise notice 'ok  %', label;
end $$;
-- Expect a statement to fail with a message containing `fragment`.
create or replace function t.fails(stmt text, fragment text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(fragment in sqlerrm) > 0 then raise notice 'ok  % (%)', label, sqlerrm; return; end if;
    raise exception 'FAIL: % — wrong error: %', label, sqlerrm;
  end;
  raise exception 'FAIL: % — expected error "%"', label, fragment;
end $$;
grant usage on schema t to anon, authenticated, service_role;
grant execute on all functions in schema t to anon, authenticated, service_role;
create table t.ctx (k text primary key, v text);
grant all on t.ctx to anon, authenticated, service_role;

insert into auth.users values
 ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000b2'), ('00000000-0000-0000-0000-0000000000b3'),
 ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000ff');
insert into public.hosts (user_id) values ('00000000-0000-0000-0000-0000000000a1');

-- ── anon (projector) ──
set role anon;
select t.fails('select * from public.teams', 'permission denied', 'anon cannot read teams');
select t.fails('select * from private.task_secrets', 'permission denied', 'anon cannot read secrets');
select t.fails($q$select public.host_start_game(gen_random_uuid())$q$, 'permission denied', 'anon cannot call host RPC');
reset role;

-- ── host creates demo instance ──
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select t.fails($q$select public.host_create_instance('00000000-0000-0000-0000-00000000d001', 'live')$q$,
               'template_is_placeholder', 'live mode refuses placeholder lineup');
insert into t.ctx select 'inst', public.host_create_instance('00000000-0000-0000-0000-00000000d001', 'demo');
insert into t.ctx select 'code', join_code from public.game_instances;
select t.ok((select count(*) from public.rounds) = 9, 'exactly 9 rounds created');
select t.ok((select item_count from public.rounds where round_no = 1) = 5, 'sprint has 5 items');
select t.fails($q$select public.host_create_instance('00000000-0000-0000-0000-00000000d001', 'demo')$q$,
               'active_instance_exists', 'only one active instance');
select public.host_set_registration((select v::uuid from t.ctx where k = 'inst'), true);

-- ── teams register ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
insert into t.ctx select 'pin1', public.team_register((select v from t.ctx where k = 'code'), 'האריות', array['סבא','נועה','איתי']) ->> 'pin';
select t.fails($q$select public.team_register((select v from t.ctx where k='code'), 'עוד', null)$q$, 'device_already_registered', 'one team per device');
select t.ok((select count(*) from public.teams) = 0, 'team sees no rows in teams table (RLS)');
select t.ok((select count(*) from public.game_instances) = 0, 'team sees no rows in instances (RLS)');
select t.fails('select * from private.task_secrets', 'permission denied', 'team cannot read secrets');
select t.fails($q$select public.host_start_game((select v::uuid from t.ctx where k='inst'))$q$, 'not_host', 'team cannot run host actions');
select t.fails($q$select public.svc_record_submission(auth.uid(), gen_random_uuid(), 0, '{}')$q$, 'permission denied', 'team cannot call svc RPC');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
select public.team_register((select v from t.ctx where k = 'code'), 'הנמרים', array['אמא']);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', false);
select t.fails($q$select public.team_register((select v from t.ctx where k='code'), 'האריות ', null)$q$, 'team_name_taken', 'duplicate team name');
select public.team_register((select v from t.ctx where k = 'code'), 'הדובים', null);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select t.fails($q$select public.team_join((select v from t.ctx where k='code'), '0000x')$q$, 'bad_pin', 'join with wrong pin');
select public.team_join((select v from t.ctx where k = 'code'), (select v from t.ctx where k = 'pin1'));
select t.ok(public.team_get_state() -> 'team' ->> 'role' = 'member', 'second phone joined as member');
select t.ok(public.team_get_state() -> 'team' ->> 'pin' is null, 'member does not see the pin');

-- ── host starts ──
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select t.fails($q$select public.host_start_game((select v::uuid from t.ctx where k='inst'))$q$, 'lock_registration_first', 'must lock registration first');
select public.host_set_registration((select v::uuid from t.ctx where k = 'inst'), false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
select t.fails($q$select public.team_register((select v from t.ctx where k='code'), 'מאחרים', null)$q$, 'registration_not_open', 'locked registration rejects teams');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.host_start_game((select v::uuid from t.ctx where k = 'inst'));
select public.host_start_game((select v::uuid from t.ctx where k = 'inst')); -- double tap: no-op
select t.fails($q$select public.host_round_action((select v::uuid from t.ctx where k='inst'), 1, 'reveal')$q$, 'illegal_transition', 'cannot reveal before grading');
select t.ok((select state -> 'round' -> 'content' from public.public_state) = 'null'::jsonb, 'content hidden during intro');
select public.host_round_action((select v::uuid from t.ctx where k = 'inst'), 1, 'open');
reset role;

select t.ok((select state -> 'round' -> 'content' -> 'questions' is not null from public.public_state), 'content visible once open');
select t.ok((select position('סופגנייה' in state::text) = 0 from public.public_state), 'answer key not in public state');
select t.ok((select state -> 'round' -> 'solution' from public.public_state) = 'null'::jsonb, 'no solution before reveal');

-- ── submissions via service role ──
set role service_role;
select t.ok((public.svc_record_submission('00000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 0,
             '{"choice":"א"}') -> 'answer_key' ->> 'kind') = 'sprint', 'captain submission recorded, key returned to server');
select t.ok((public.svc_record_submission('00000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 0,
             '{"choice":"א"}') ->> 'duplicate')::boolean, 'retry with same request id is idempotent');
select t.fails($q$select public.svc_record_submission('00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 1, '{"choice":"א"}')$q$,
               'captain_only', 'member phone cannot submit captain-only task');
select t.fails($q$select public.svc_record_submission('00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 2, '{"choice":"א"}')$q$,
               'item_locked_or_out_of_order', 'sprint: cannot skip ahead');
select t.fails($q$select public.svc_record_submission('00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 0, '{"choice":"ב"}')$q$,
               'no_attempts_left', 'sprint: submitted answer is locked');
select public.svc_apply_grade((select id from public.submissions where client_request_id = '11111111-1111-1111-1111-111111111111'),
                              '{"correct":true}', 1, 60, false);
select public.svc_apply_grade((select id from public.submissions where client_request_id = '11111111-1111-1111-1111-111111111111'),
                              '{"correct":true}', 1, 60, false);
reset role;
select t.ok((select count(*) from public.score_events) = 1 and (select sum(points) from public.score_events) = 60, 'no double scoring');
select t.ok((public.round_progress() ->> 'submitted_teams') = '1' and (public.round_progress() ->> 'total_teams') = '3', 'progress endpoint counts submissions');
set role anon;
select t.ok((public.round_progress() ->> 'submitted_teams') = '1', 'projector (anon) can poll progress');
reset role;

-- Pause → submissions refused; resume restores remaining time.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.host_round_action((select v::uuid from t.ctx where k = 'inst'), 1, 'pause');
reset role;
select t.ok((select paused_remaining_ms between 90000 and 100000 from public.rounds where round_no = 1), 'pause stores remaining time');
set role service_role;
select t.fails($q$select public.svc_record_submission('00000000-0000-0000-0000-0000000000b2', gen_random_uuid(), 0, '{"choice":"א"}')$q$,
               'round_paused', 'no submissions while paused');
reset role;
set role authenticated;
select public.host_round_action((select v::uuid from t.ctx where k = 'inst'), 1, 'resume');
reset role;

-- Late submission: simulate the timer having ended 5 s ago.
update public.rounds set ends_at = clock_timestamp() - interval '5 seconds' where round_no = 1;
set role service_role;
select t.ok((public.svc_record_submission('00000000-0000-0000-0000-0000000000b2', gen_random_uuid(), 0, '{"choice":"א"}')
             -> 'submission' ->> 'status') = 'late', 'after deadline+grace → stored as late');
select public.svc_apply_grade((select id from public.submissions where status = 'late'), '{}', 1, 60, false);
reset role;
select t.ok((select count(*) from public.score_events) = 1, 'late submission earns nothing');

-- Close → graded → reveal; standings only when host shows them.
set role authenticated;
select public.host_round_action((select v::uuid from t.ctx where k = 'inst'), 1, 'close');
reset role;
set role service_role;
select public.svc_mark_graded((select v::uuid from t.ctx where k = 'inst'), 1);
reset role;
set role authenticated;
select public.host_round_action((select v::uuid from t.ctx where k = 'inst'), 1, 'reveal');
reset role;
select t.ok((select state -> 'round' -> 'solution' ->> 'kind' from public.public_state) = 'sprint', 'solution public after reveal');
select t.ok((select state -> 'standings' from public.public_state) = 'null'::jsonb, 'standings hidden until host shows them');
set role authenticated;
select public.host_set_screen_view((select v::uuid from t.ctx where k = 'inst'), 'standings');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
select t.ok((public.team_get_state() -> 'score' ->> 'total')::int = 60, 'team sees its revealed total');
select t.ok((public.team_get_state() -> 'score' ->> 'rank')::int = 1, 'team sees its rank');
reset role;
select t.ok((select (state -> 'standings' -> 0 ->> 'total')::int from public.public_state) = 60, 'standings on screen');

-- Hidden manual adjustment does not leak before reveal.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.host_next_round((select v::uuid from t.ctx where k = 'inst'));
select public.host_adjust_score((select v::uuid from t.ctx where k = 'inst'), (select id from public.teams where name = 'הנמרים'), 2, 50, 'בדיקה');
reset role;
select t.ok((select state -> 'standings' from public.public_state) = 'null'::jsonb, 'next round resets screen to auto view');
select t.ok((select sum(total) from private.team_totals((select v::uuid from t.ctx where k = 'inst'), true)) = 60, 'unrevealed points stay hidden');

-- ── reset (two-step) ──
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
select t.fails($q$select public.host_request_reset((select v::uuid from t.ctx where k='inst'))$q$, 'not_host', 'team cannot reset');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
insert into t.ctx select 'tok', public.host_request_reset((select v::uuid from t.ctx where k = 'inst'));
select t.fails($q$select public.host_confirm_reset((select v::uuid from t.ctx where k='tok'), 'כן')$q$, 'confirmation_text_mismatch', 'reset needs typed confirmation');
select public.host_confirm_reset((select v::uuid from t.ctx where k = 'tok'), 'איפוס');
select t.fails($q$select public.host_confirm_reset((select v::uuid from t.ctx where k='tok'), 'איפוס')$q$, 'reset_token_invalid', 'reset token is single-use');
reset role;
select t.ok((select count(*) from public.teams) = 0, 'reset: teams gone');
select t.ok((select count(*) from public.team_devices) = 0, 'reset: devices gone');
select t.ok((select count(*) from public.submissions) = 0, 'reset: submissions gone');
select t.ok((select count(*) from public.score_events) = 0, 'reset: scores gone');
select t.ok((select count(*) from public.game_events where type <> 'demo_reset') = 0, 'reset: events gone');
select t.ok((select status from public.game_instances) = 'setup', 'reset: instance back to setup');
select t.ok((select bool_and(phase = 'pending' and public_payload is null) from public.rounds), 'reset: rounds cleared');
select t.ok((select count(*) from public.task_templates) = 11 and (select count(*) from private.task_secrets) = 11, 'reset keeps content');
select t.ok((select jsonb_array_length(state -> 'teams') from public.public_state) = 0, 'reset: screen shows no teams');

\o
\echo 'ALL SCENARIO CHECKS PASSED'
