import type { TaskKind } from '../../supabase/functions/_shared/engine/tasks.ts';

export type InstanceStatus = 'setup' | 'registration_open' | 'registration_locked' | 'in_progress' | 'finished' | 'archived';
export type RoundPhase = 'pending' | 'intro' | 'betting' | 'bets_locked' | 'open' | 'paused' | 'closed' | 'graded' | 'revealed' | 'done';

export interface PublicTeam { id: string; name: string; color: string }

export interface PublicRound {
  no: number;
  is_finale: boolean;
  phase: RoundPhase;
  kind: TaskKind;
  title: string;
  instructions: string;
  duration_sec: number;
  item_count: number;
  opened_at: string | null;
  ends_at: string | null;
  paused_remaining_ms: number | null;
  revealed_at: string | null;
  screen_item: number;
  pin_solution: boolean;
  content: Record<string, any> | null;
  bet_tracks: { id: string; label: string; winMultiplier: number; lossMultiplier: number }[] | null;
  bet_base: number | null;
  solution: Record<string, any> | null;
  finalists: string[] | null;
  progress: { submitted_teams: number; total_teams: number };
}

export interface PublicState {
  instance: { id: string; mode: 'demo' | 'live'; status: InstanceStatus; current_round: number | null;
              screen_view: 'auto' | 'standings' | 'final_results' };
  teams: PublicTeam[];
  round: PublicRound | null;
  standings: { team_id: string; total: number; rank: number }[] | null;
  finals: { chosen_option: 'A' | 'B'; prizes: { firstPrize: number; secondPrize: number; label: string }; placements: { team_id: string; place: number }[] | null } | null;
}

export interface TeamState {
  registered: boolean;
  instance_id?: string;
  team?: { id: string; name: string; color: string; members: string[]; status: string; role: 'captain' };
  round_submissions?: { item_index: number; attempt_no: number; status: string; received_at: string; correct: boolean | null }[];
  bet?: { track_id: string; base_points: number } | null;
  score?: { total: number; rank: number; teams: number } | null;
}
