-- Candle memory (task 35), approved redesign: one shared, server-timed timeline.
-- Stage k: intro → symbols one by one (show_ms each) → recall window (recall_ms) → result (result_ms).
-- Everything is derived from rounds.opened_at, so every phone and the screen agree, and refreshes never reset.
-- Mirrors supabase/functions/_shared/engine/memory.ts exactly. Non-destructive: new functions + one trigger.

create or replace function private.memory_window(p_lengths jsonb, p_timing jsonb, p_stage int,
  out intro_at_ms bigint, out show_at_ms bigint, out recall_at_ms bigint, out recall_end_ms bigint, out result_end_ms bigint)
language plpgsql immutable set search_path = '' as $$
declare
  v_intro int := coalesce((p_timing ->> 'intro_ms')::int, 3000);
  v_show int := coalesce((p_timing ->> 'show_ms')::int, 3500);
  v_recall int := coalesce((p_timing ->> 'recall_ms')::int, 20000);
  v_result int := coalesce((p_timing ->> 'result_ms')::int, 6000);
  v_at bigint := 0; k int; v_len int;
begin
  for k in 0 .. p_stage loop
    v_len := (p_lengths ->> k)::int;
    if v_len is null then raise exception 'bad_stage'; end if;
    intro_at_ms := v_at;
    show_at_ms := intro_at_ms + v_intro;
    recall_at_ms := show_at_ms + v_len * v_show;
    recall_end_ms := recall_at_ms + v_recall;
    result_end_ms := recall_end_ms + v_result;
    v_at := result_end_ms;
  end loop;
end $$;

-- Submissions for a memory stage are accepted only inside that stage's recall window.
-- Too early → rejected. After the window (+ late grace) → kept for audit but marked late (no points).
create or replace function private.memory_submission_window() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.rounds; tt public.task_templates; w record; v_elapsed bigint; v_grace numeric;
begin
  select * into r from public.rounds where instance_id = new.instance_id and round_no = new.round_no;
  select * into tt from public.task_templates where id = r.task_id;
  if tt.kind <> 'sequence_memory' or r.opened_at is null or (r.public_payload -> 'stage_lengths') is null then return new; end if;
  select * into w from private.memory_window(r.public_payload -> 'stage_lengths', tt.settings -> 'memory', new.item_index);
  v_elapsed := (extract(epoch from (new.received_at - r.opened_at)) * 1000)::bigint;
  v_grace := coalesce((select (settings ->> 'late_grace_ms')::numeric from public.game_instances where id = new.instance_id), 1500);
  if v_elapsed < w.recall_at_ms - 1000 then raise exception 'stage_not_open'; end if;
  if v_elapsed > w.recall_end_ms + v_grace then new.status := 'late'; end if;
  return new;
end $$;

drop trigger if exists submissions_memory_window on public.submissions;
create trigger submissions_memory_window before insert on public.submissions
  for each row execute function private.memory_submission_window();

-- The sequence of a stage is released only once it starts being shown (never ahead of time),
-- and how many teams passed is released only after the recall window has closed.
create or replace function public.memory_stage(p_instance uuid, p_stage int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare gi public.game_instances; r public.rounds; tt public.task_templates; w record; v_elapsed bigint; v_key jsonb;
        v_out jsonb; v_alive int; v_passed int;
begin
  select * into gi from public.game_instances where id = p_instance and status = 'in_progress';
  if not found then raise exception 'no_game'; end if;
  select * into r from public.rounds where instance_id = p_instance and round_no = gi.current_round;
  select * into tt from public.task_templates where id = r.task_id;
  if tt.kind <> 'sequence_memory' or r.opened_at is null or r.phase not in ('open','closed','graded','revealed','done') then
    raise exception 'not_memory_round';
  end if;
  select * into w from private.memory_window(r.public_payload -> 'stage_lengths', tt.settings -> 'memory', p_stage);
  v_elapsed := (extract(epoch from (now() - r.opened_at)) * 1000)::bigint;
  if v_elapsed < w.show_at_ms - 400 and r.phase = 'open' then raise exception 'too_early'; end if;
  select answer_key into v_key from private.task_secrets where task_id = r.task_id;
  v_out := jsonb_build_object('stage', p_stage, 'sequence', v_key -> 'stages' -> p_stage);
  if v_elapsed >= w.recall_end_ms + 1000 or r.phase <> 'open' then
    select count(*) into v_passed from public.submissions s
      where s.instance_id = p_instance and s.round_no = r.round_no and s.item_index = p_stage and s.status = 'graded' and s.ratio = 1;
    v_out := v_out || jsonb_build_object('passed', v_passed);
  end if;
  return v_out;
end $$;

revoke execute on function public.memory_stage(uuid, int) from public;
grant execute on function public.memory_stage(uuid, int) to anon, authenticated;
revoke execute on function private.memory_window(jsonb, jsonb, int) from public, anon, authenticated;
revoke execute on function private.memory_submission_window() from public, anon, authenticated;
