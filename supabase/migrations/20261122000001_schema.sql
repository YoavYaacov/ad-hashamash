-- ═══════════════════════════════════════════════════════════════════════════
-- Game show — core schema
-- Principle: the server is the source of truth. Phones and the projector get
-- read access only to a screen-safe snapshot (public_state) and act only through
-- RPCs / the Edge Function. Answer keys live in the non-exposed `private` schema.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ───────────── Content (survives reset) ─────────────

create table public.hosts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.task_templates (
  id text primary key,                                   -- e.g. 'vault', 'sprint-a'
  idea_no int,                                           -- number from the ideas list (4, 5, 8, ...)
  kind text not null check (kind in (
    'code_vault','video_memory','truth_or_fiction','sprint','symbols','three_pictures',
    'ordering','sliding_puzzle','bet_puzzle','sequence_memory','finale')),
  title text not null,
  instructions text not null default '',
  public_content jsonb not null default '{}'::jsonb,     -- safe to show once the round opens
  assets jsonb not null default '[]'::jsonb,
  duration_sec int not null default 120 check (duration_sec between 10 and 1800),
  scoring jsonb not null default '{}'::jsonb,            -- method + params (fixed / partial / time / per-success / bet)
  attempts_limit int check (attempts_limit is null or attempts_limit > 0),
  submission_policy text not null default 'captain_only'
    check (submission_policy in ('captain_only','any_device_first_wins')),
  settings jsonb not null default '{}'::jsonb,           -- kind-specific (instant_feedback, heats, stages, ...)
  status text not null default 'candidate'
    check (status in ('candidate','approved','backup','rejected')),
  is_placeholder boolean not null default false,         -- demo content — must not be used live
  updated_at timestamptz not null default now()
);

-- Answer keys: NOT in an exposed schema. Only service_role / security-definer code reads them.
create table private.task_secrets (
  task_id text primary key references public.task_templates (id) on delete cascade,
  answer_key jsonb not null,
  verified_at timestamptz,             -- set after solutions were checked (e.g. uniqueness)
  verified_note text
);

create table public.game_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}'::jsonb,           -- tie-breakers, grace ms, finals params, bet config...
  is_placeholder boolean not null default true,          -- a test lineup until the 8 rounds are approved
  created_at timestamptz not null default now()
);

-- Exactly rounds 1..9; round 9 must be the finale. Enforced fully in start_game().
create table public.game_template_rounds (
  template_id uuid not null references public.game_templates (id) on delete cascade,
  round_no int not null check (round_no between 1 and 9),
  task_id text not null references public.task_templates (id),
  primary key (template_id, round_no),
  unique (template_id, task_id)
);

-- ───────────── Instance data (wiped by reset) ─────────────

create table public.game_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.game_templates (id),
  mode text not null check (mode in ('demo','live')),
  status text not null default 'setup' check (status in
    ('setup','registration_open','registration_locked','in_progress','finished','archived')),
  join_code text not null unique,
  current_round int check (current_round between 1 and 9),
  screen_view text not null default 'auto' check (screen_view in ('auto','standings','final_results')),
  settings jsonb not null default '{}'::jsonb,           -- frozen copy of template settings at creation
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- At most one non-archived instance at a time → the screen always knows which game to show.
create unique index one_active_instance on public.game_instances ((true)) where status <> 'archived';

create table public.rounds (
  instance_id uuid not null references public.game_instances (id) on delete cascade,
  round_no int not null check (round_no between 1 and 9),
  task_id text not null references public.task_templates (id),
  phase text not null default 'pending' check (phase in
    ('pending','intro','betting','bets_locked','open','paused','closed','graded','revealed','done')),
  item_count int not null default 1,
  opened_at timestamptz,
  ends_at timestamptz,
  paused_remaining_ms int,
  public_payload jsonb,                -- copied from task_templates when the round opens
  solution_payload jsonb,              -- copied from private.task_secrets ONLY on reveal
  finalists uuid[],                    -- round 9 only
  primary key (instance_id, round_no)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.game_instances (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 30),
  color text not null,
  members text[] not null default '{}' check (cardinality(members) <= 15),
  join_pin text not null,              -- lets a 2nd phone join this team
  status text not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now()
);
create unique index teams_unique_name on public.teams (instance_id, lower(name));
create index teams_instance_idx on public.teams (instance_id);

create table public.team_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  instance_id uuid not null references public.game_instances (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  role text not null check (role in ('captain','member')),
  joined_at timestamptz not null default now(),
  primary key (user_id, instance_id)
);
create index team_devices_team_idx on public.team_devices (team_id);
create unique index one_captain_per_team on public.team_devices (team_id) where role = 'captain';

create table public.submissions (
  id bigint generated always as identity primary key,
  instance_id uuid not null references public.game_instances (id) on delete cascade,
  round_no int not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  item_index int not null default 0 check (item_index >= 0),
  attempt_no int not null default 1 check (attempt_no >= 1),
  payload jsonb not null,
  submitted_by uuid not null references auth.users (id),
  client_request_id uuid not null,     -- idempotency: a retried request returns the same row
  received_at timestamptz not null default clock_timestamp(),  -- SERVER time, never the phone's
  status text not null default 'received'
    check (status in ('received','graded','needs_review','late')),
  grade jsonb,
  ratio numeric(6,5),
  foreign key (instance_id, round_no) references public.rounds (instance_id, round_no) on delete cascade,
  unique (team_id, round_no, item_index, attempt_no),
  unique (submitted_by, client_request_id)
);
create index submissions_round_idx on public.submissions (instance_id, round_no, team_id);

create table public.bets (
  instance_id uuid not null references public.game_instances (id) on delete cascade,
  round_no int not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  track_id text not null,
  base_points int not null,
  total_before int not null,
  placed_at timestamptz not null default clock_timestamp(),
  primary key (team_id, round_no),
  foreign key (instance_id, round_no) references public.rounds (instance_id, round_no) on delete cascade
);

-- Score ledger: every point change is a row. unique(source_key) makes scoring idempotent.
create table public.score_events (
  id bigint generated always as identity primary key,
  instance_id uuid not null references public.game_instances (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  round_no int not null check (round_no between 1 and 9),
  source_key text not null,            -- e.g. 'r3:item2', 'r6:bet', 'r9:finals', 'manual:<uuid>'
  points int not null,
  reason text not null,
  detail jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  revealed boolean not null default false,
  unique (instance_id, team_id, source_key)
);
create index score_events_team_idx on public.score_events (instance_id, team_id);

create table public.finals (
  instance_id uuid primary key references public.game_instances (id) on delete cascade,
  finalists jsonb not null,            -- [{team_id,total}] snapshot after round 8
  options jsonb not null,              -- the exactly-two computed options + analysis
  chosen_option text check (chosen_option in ('A','B')),
  chosen_at timestamptz,
  placements jsonb                     -- [{team_id, place}] first two finishers
);

create table public.game_events (
  id bigint generated always as identity primary key,
  instance_id uuid references public.game_instances (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor uuid,
  created_at timestamptz not null default now()
);
create index game_events_instance_idx on public.game_events (instance_id, id);

-- Screen-safe snapshot. The ONLY table phones and the projector read directly.
create table public.public_state (
  instance_id uuid primary key references public.game_instances (id) on delete cascade,
  state jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- Two-step reset tokens (server-side double confirmation).
create table private.reset_requests (
  token uuid primary key default gen_random_uuid(),
  instance_id uuid not null,
  requested_by uuid not null,
  expires_at timestamptz not null default now() + interval '90 seconds'
);

-- ═════════════════════════ RLS ═════════════════════════

alter table public.hosts               enable row level security;
alter table public.task_templates      enable row level security;
alter table public.game_templates      enable row level security;
alter table public.game_template_rounds enable row level security;
alter table public.game_instances      enable row level security;
alter table public.rounds              enable row level security;
alter table public.teams               enable row level security;
alter table public.team_devices        enable row level security;
alter table public.submissions         enable row level security;
alter table public.bets                enable row level security;
alter table public.score_events        enable row level security;
alter table public.finals              enable row level security;
alter table public.game_events         enable row level security;
alter table public.public_state        enable row level security;

create or replace function private.is_host() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hosts h where h.user_id = (select auth.uid()));
$$;
revoke all on function private.is_host() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_host() to authenticated;

-- Host: read everything (writes go through RPCs only).
do $$
declare t text;
begin
  foreach t in array array['hosts','task_templates','game_templates','game_template_rounds','game_instances',
    'rounds','teams','team_devices','submissions','bets','score_events','finals','game_events'] loop
    execute format('create policy host_read on public.%I for select to authenticated using ((select private.is_host()))', t);
  end loop;
end $$;

-- Everyone (projector is anon, phones are anonymous-auth users) may read the safe snapshot.
create policy public_state_read on public.public_state for select to anon, authenticated using (true);

-- No direct writes for clients at all.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke select on all tables in schema public from anon;
grant select on public.public_state to anon, authenticated;
-- Table-level SELECT for signed-in users; RLS (host_read) limits rows to hosts only.
grant select on public.hosts, public.task_templates, public.game_templates, public.game_template_rounds,
  public.game_instances, public.rounds, public.teams, public.team_devices, public.submissions, public.bets,
  public.score_events, public.finals, public.game_events to authenticated;
