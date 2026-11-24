-- Candle memory: shared server timeline, stage windows, release of sequences, elimination, approved points.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.host_set_registration((select v::uuid from t.ctx where k = 'inst'), true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
select public.team_register(array['סבא']);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
select public.team_register(array['אמא']);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.host_set_registration((select v::uuid from t.ctx where k = 'inst'), false);
select public.host_start_game((select v::uuid from t.ctx where k = 'inst'));
reset role;
-- jump straight to round 4 (memory) for this test
update public.rounds set phase = 'done' where round_no < 4;
update public.game_instances set current_round = 4;
update public.rounds set phase = 'intro' where round_no = 4;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select public.host_round_action((select v::uuid from t.ctx where k = 'inst'), 4, 'open');
reset role;

select t.ok((select r.public_payload -> 'stages' is null and r.public_payload -> 'stage_lengths' = '[3,4,5,6,7,8]'::jsonb
             from public.rounds r where round_no = 4), 'memory: sequences are not in the public payload');
select t.ok((select not (state -> 'round' -> 'content' ? 'stages') and position('"stages"' in state::text) = 0 from public.public_state), 'memory: no sequence on the screen state');
set role anon;
select t.fails($q$select public.memory_stage((select v::uuid from t.ctx where k='inst'), 0)$q$, 'too_early', 'stage 1 not released during its intro');
reset role;
-- 4 s after opening: stage 1 is being shown → released
update public.rounds set opened_at = clock_timestamp() - interval '4 seconds' where round_no = 4;
set role anon;
select t.ok(jsonb_array_length(public.memory_stage((select v::uuid from t.ctx where k='inst'), 0) -> 'sequence') = 3, 'stage 1 released once shown (anon screen)');
select t.ok(public.memory_stage((select v::uuid from t.ctx where k='inst'), 0) -> 'passed' is null, 'pass count hidden before recall ends');
select t.fails($q$select public.memory_stage((select v::uuid from t.ctx where k='inst'), 1)$q$, 'too_early', 'stage 2 never released ahead of time');
reset role;
set role service_role;
select t.fails($q$select public.svc_record_submission('00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 0, '{"sequence":["dreidel","sufganiya","candle"]}')$q$,
               'stage_not_open', 'no answers while the sequence is still showing');
reset role;
-- recall window of stage 1: 3 + 3×3.5 = 13.5 s .. 33.5 s
update public.rounds set opened_at = clock_timestamp() - interval '15 seconds' where round_no = 4;
set role service_role;
select t.ok((public.svc_record_submission('00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 0, '{"sequence":["dreidel","sufganiya","candle"]}')
             -> 'submission' ->> 'status') = 'received', 'stage 1 answer accepted inside the window');
select public.svc_apply_grade((select id from public.submissions where round_no = 4 and item_index = 0 and team_id = (select team_id from public.team_devices where user_id = '00000000-0000-0000-0000-0000000000b1')), '{"correct":true}', 1, 25, false);
select t.ok((public.svc_record_submission('00000000-0000-0000-0000-0000000000b2', gen_random_uuid(), 0, '{"sequence":["candle"]}')
             -> 'submission' ->> 'status') = 'received', 'second team answers stage 1');
select public.svc_apply_grade((select id from public.submissions where round_no = 4 and item_index = 0 and team_id = (select team_id from public.team_devices where user_id = '00000000-0000-0000-0000-0000000000b2')), '{"correct":false}', 0, 0, false);
select t.fails($q$select public.svc_record_submission('00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 0, '{"sequence":["x"]}')$q$,
               'already_solved', 'no second submission for the same stage');
reset role;
-- after the recall window: late, and pass count released
update public.rounds set opened_at = clock_timestamp() - interval '36 seconds' where round_no = 4;
set role anon;
select t.ok((public.memory_stage((select v::uuid from t.ctx where k='inst'), 0) ->> 'passed')::int = 1, 'pass count released after the window');
reset role;
-- stage 2 window: 39.5 + 3 + 4×3.5 = 56.5 .. 76.5 s
update public.rounds set opened_at = clock_timestamp() - interval '60 seconds' where round_no = 4;
set role service_role;
select t.fails($q$select public.svc_record_submission('00000000-0000-0000-0000-0000000000b2', gen_random_uuid(), 1, '{"sequence":["coin"]}')$q$,
               'eliminated', 'a team that failed is out');
select t.ok((public.svc_record_submission('00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 1, '{"sequence":["coin","menorah","latke","dreidel"]}')
             -> 'submission' ->> 'status') = 'received', 'survivor answers stage 2');
reset role;
update public.rounds set opened_at = clock_timestamp() - interval '80 seconds' where round_no = 4;
set role service_role;
select t.fails($q$select public.svc_record_submission('00000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 2, '{"sequence":["x"]}')$q$,
               'stage_not_open', 'cannot answer a future stage');
reset role;
select t.ok((select sum(points) from public.score_events where round_no = 4) = 25, 'stage 1 = 25 points, failed team keeps its points (0)');

\o
\echo 'MEMORY CHECKS PASSED'
