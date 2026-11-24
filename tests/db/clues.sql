-- מסע האותיות: one scrambled letter per round, only on the score reveal; the word never leaks.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
reset role;
update public.rounds set phase = 'graded' where round_no = 2;
update public.game_instances set current_round = 2;
select private.refresh_public_state((select v::uuid from t.ctx where k = 'inst'));
select t.ok((select state -> 'round' ->> 'clue' is null from public.public_state where instance_id = (select v::uuid from t.ctx where k = 'inst')), 'clues: no letter before the reveal');
update public.rounds set phase = 'revealed', revealed_at = now() where round_no = 2;
select private.refresh_public_state((select v::uuid from t.ctx where k = 'inst'));
select t.ok((select char_length(state -> 'round' -> 'clue' ->> 'letter') = 1 from public.public_state where instance_id = (select v::uuid from t.ctx where k = 'inst')), 'clues: one letter on the score reveal');
select t.ok((select count(*) = 8 from private.instance_clues where instance_id = (select v::uuid from t.ctx where k = 'inst')), 'clues: 8 letters dealt, one per candle');
select t.ok((select string_agg(letter, '' order by letter) = (select string_agg(c, '' order by c) from regexp_split_to_table('סופגניות', '') c)
             from private.instance_clues where instance_id = (select v::uuid from t.ctx where k = 'inst')), 'clues: exactly the letters of the finale word');
select t.ok((select string_agg(letter, '' order by round_no) <> 'סופגניות' from private.instance_clues where instance_id = (select v::uuid from t.ctx where k = 'inst')), 'clues: scrambled order');
select t.ok((select count(distinct spot) = 8 and bool_and(abs(rot) <= 26) from private.instance_clues where instance_id = (select v::uuid from t.ctx where k = 'inst')), 'clues: different spots, gentle tilt');
select t.ok((select position('סופגניות' in (state -> 'round')::text) = 0 from public.public_state where instance_id = (select v::uuid from t.ctx where k = 'inst')), 'clues: the word itself never in the public state');
select t.ok((select bool_and(state -> 'round' -> 'clue' ->> 'letter' = c.letter) from public.public_state p, private.instance_clues c where c.round_no = 2 and c.instance_id = p.instance_id and p.instance_id = (select v::uuid from t.ctx where k = 'inst')),
            'clues: stable between refreshes');
set role anon;
select t.fails($q$select * from private.instance_clues$q$, 'permission denied', 'clues: not readable by phones');
reset role;
