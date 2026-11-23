/**
 * In-memory stand-in for the Supabase backend, for the browser demo ONLY.
 * Mirrors the SQL state machine (migrations/…_game_functions.sql) and uses the very same
 * grading engine as the Edge Function, so the demo behaves like the real thing.
 * Never used by the production build.
 */
import content from './content.json';
import type { AnswerKey } from '../../supabase/functions/_shared/engine/tasks.ts';
import { moveTile, neighbors, isSolved, type Board } from '../../supabase/functions/_shared/engine/slidingPuzzle.ts';
import { computeFinals, finalsPlacements, finalsScoreEvents, gradeSubmission, pointsFor, settleBets, type Scoring } from '../../supabase/functions/game/logic.ts';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const fail = (code: string): never => { throw new Error(code); };
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

interface Task { id: string; kind: string; title: string; instructions: string; public_content: Json; assets: Json; duration_sec: number;
  scoring: Scoring; attempts_limit: number | null; submission_policy: string; settings: Json; }
interface Round { round_no: number; task_id: string; phase: string; item_count: number; opened_at: string | null; ends_at: string | null;
  paused_remaining_ms: number | null; public_payload: Json; solution_payload: Json; finalists: string[] | null;
  revealed_at?: string | null; screen_item?: number; pin_solution?: boolean }
interface Team { id: string; name: string; color: string; members: string[]; status: string; created_at: number; bot?: boolean; transfer?: string }
interface Device { user_id: string; team_id: string; role: 'captain' | 'member' }
interface Sub { id: number; round_no: number; team_id: string; item_index: number; attempt_no: number; payload: Json; submitted_by: string;
  client_request_id: string; received_at: string; status: string; grade: Json; ratio: number | null }
interface Bet { round_no: number; team_id: string; track_id: string; base_points: number; total_before: number }
interface ScoreEv { team_id: string; round_no: number; source_key: string; points: number; reason: string; revealed: boolean }

const PALETTE = ['#F5B841', '#E8604C', '#4FB0C6', '#7BC67E', '#B57EDC', '#F28AB2', '#5C8DF6', '#F0935A', '#3FC1A5', '#D6C14A',
  '#C9705B', '#8E9BF5', '#E36FA0', '#62B6E8', '#A3C85A', '#F2A65A', '#9A7CF2', '#4CC0C0', '#E3B23C', '#D96C6C'];
const GRACE_MS = 1500;
const FUNNY = ['הסופגניות המעופפות', 'לביבות בלי גבולות', 'הסביבונים המסתחררים', 'פך השמן האבוד', 'המכבים המנומנמים',
  'אנטיוכוס בהלם', 'הלביבה הלוהטת', 'דמי חנוכה דחופים', 'ריבה בכל מקום', 'אבקת סוכר על האף', 'הנרות הסוררים', 'מעוז צחוק',
  'חשמונאים בפיג׳מה', 'מטבעות השוקולד', 'מגדל הסופגניות', 'השעווה המטפטפת', 'קופסת הגפרורים', 'סביבון על טורבו', 'נס גדול היה פה',
  'פכים קטנים', 'המכבים מהקומה השלישית', 'נר לכל אחד', 'הקרב על הריבה', 'סבתא מכבית', 'שמן זית כתית'];

export class MockServer {
  tasks = new Map<string, Task>((content.tasks as Task[]).map((t) => [t.id, t]));
  secrets = content.secrets as Record<string, AnswerKey>;
  template = { ...content.template, rounds: content.rounds };
  hosts = new Set<string>();
  inst: { id: string; mode: string; status: string; join_code: string; current_round: number | null; screen_view: string; settings: Json } | null = null;
  rounds: Round[] = [];
  teams: Team[] = [];
  devices: Device[] = [];
  subs: Sub[] = [];
  bets: Bet[] = [];
  scores: ScoreEv[] = [];
  finals: { finalists: Json; options: Json; chosen_option: string | null; placements: Json } | null = null;
  publicRow: { state: Json; version: number; updated_at: string } | null = null;
  private seq = 1;
  private listeners = new Set<(row: Json) => void>();

  subscribe(fn: (row: Json) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  // ───────── helpers ─────────
  private task(r: Round) { return this.tasks.get(r.task_id)!; }
  private round(no: number | null) { return this.rounds.find((r) => r.round_no === no)!; }
  private requireHost(uid: string | null) { if (!uid || !this.hosts.has(uid)) fail('not_host'); }
  private activeTeams() { return this.teams.filter((t) => t.status === 'active'); }
  totals(revealedOnly: boolean) {
    return this.activeTeams().map((t) => ({
      team_id: t.id,
      total: Math.max(0, this.scores.filter((s) => s.team_id === t.id && (s.revealed || !revealedOnly)).reduce((a, s) => a + s.points, 0)),
    }));
  }
  private betBase(r: Round) {
    const b = this.task(r).settings.bet;
    if (b.baseMethod === 'fixed') return b.fixedBase;
    const tot = this.totals(false);
    const avg = tot.length ? tot.reduce((a, x) => a + x.total, 0) / tot.length : 0;
    return Math.max(b.minBase ?? 100, Math.floor(avg / 100) * 100);
  }

  refresh() {
    const gi = this.inst;
    if (!gi) { this.publicRow = null; this.emit(); return; }
    const active = this.activeTeams();
    let round: Json = null;
    if (gi.current_round) {
      const r = this.round(gi.current_round), tt = this.task(r);
      round = {
        no: r.round_no, is_finale: r.round_no === 9, phase: r.phase, kind: tt.kind, title: tt.title, instructions: tt.instructions,
        duration_sec: tt.duration_sec, item_count: r.item_count, opened_at: r.opened_at, ends_at: r.ends_at, paused_remaining_ms: r.paused_remaining_ms,
        revealed_at: r.revealed_at ?? null, screen_item: r.screen_item ?? 0, pin_solution: !!r.pin_solution,
        content: ['open', 'paused', 'closed', 'graded', 'revealed', 'done'].includes(r.phase) ? r.public_payload : null,
        bet_tracks: tt.kind === 'bet_puzzle' ? tt.settings.bet.tracks : null,
        bet_base: tt.kind === 'bet_puzzle' ? this.betBase(r) : null,
        solution: ['revealed', 'done'].includes(r.phase) ? r.solution_payload : null,
        finalists: r.finalists,
        progress: { submitted_teams: new Set(this.subs.filter((s) => s.round_no === r.round_no && s.status !== 'late').map((s) => s.team_id)).size,
                    total_teams: r.round_no === 9 ? (r.finalists?.length ?? 0) : active.length },
      };
    }
    const tot = this.totals(true);
    const cr = gi.current_round ? this.round(gi.current_round) : null;
    const standings = (['standings', 'final_results'].includes(gi.screen_view) || (cr && ['revealed', 'done'].includes(cr.phase) && !cr.pin_solution))
      ? tot.map((x) => ({ ...x, rank: 1 + tot.filter((y) => y.total > x.total).length })).filter((x) => x.rank <= 5).sort((a, b) => b.total - a.total) : null;
    const f = this.finals?.chosen_option ? {
      chosen_option: this.finals.chosen_option,
      prizes: this.finals.options.options[this.finals.chosen_option === 'A' ? 0 : 1],
      placements: this.finals.placements,
    } : null;
    this.publicRow = {
      state: {
        instance: { id: gi.id, mode: gi.mode, status: gi.status, current_round: gi.current_round, screen_view: gi.screen_view },
        teams: active.map((t) => ({ id: t.id, name: t.name, color: t.color })),
        round, standings, finals: f,
      },
      version: (this.publicRow?.version ?? 0) + 1,
      updated_at: nowIso(),
    };
    this.emit();
  }
  private emit() { const row = this.publicRow; queueMicrotask(() => this.listeners.forEach((l) => l(row))); }

  // ───────── RPCs ─────────
  rpc(uid: string | null, fn: string, a: Json): Json {
    switch (fn) {
      case 'server_time': return nowIso();
      case 'am_i_host': return !!uid && this.hosts.has(uid);
      case 'round_progress': {
        if (!this.inst || this.inst.status !== 'in_progress') return null;
        const r = this.round(this.inst.current_round);
        return { round: r.round_no, submitted_teams: new Set(this.subs.filter((s) => s.round_no === r.round_no && s.status !== 'late').map((s) => s.team_id)).size,
                 total_teams: r.round_no === 9 ? (r.finalists?.length ?? 0) : this.activeTeams().length };
      }
      case 'host_create_instance': {
        this.requireHost(uid);
        if (this.inst) fail('active_instance_exists');
        if (a.p_mode === 'live') fail('template_is_placeholder');
        this.inst = { id: uuid(), mode: 'demo', status: 'setup', join_code: '', current_round: null, screen_view: 'auto', settings: this.template.settings };
        this.rounds = this.template.rounds.map((gr: Json) => {
          const k: Json = this.secrets[gr.task_id];
          return { round_no: gr.round_no, task_id: gr.task_id, phase: 'pending', item_count: Math.max(1, k.items?.length ?? k.stages?.length ?? 1),
                   opened_at: null, ends_at: null, paused_remaining_ms: null, public_payload: null, solution_payload: null, finalists: null };
        });
        this.refresh();
        return this.inst.id;
      }
      case 'host_set_registration': {
        this.requireHost(uid);
        if (!['setup', 'registration_open', 'registration_locked'].includes(this.inst!.status)) fail('registration_closed_game_started');
        this.inst!.status = a.p_open ? 'registration_open' : 'registration_locked';
        this.refresh(); return null;
      }
      case 'host_start_game': {
        this.requireHost(uid);
        if (this.inst!.status === 'in_progress') return null;
        if (this.inst!.status !== 'registration_locked') fail('lock_registration_first');
        if (this.activeTeams().length < 2) fail('need_at_least_2_teams');
        this.inst!.status = 'in_progress'; this.inst!.current_round = 1; this.round(1).phase = 'intro';
        this.refresh(); return null;
      }
      case 'host_round_action': return this.roundAction(uid, a.p_round, a.p_action);
      case 'host_next_round': {
        this.requireHost(uid);
        const gi = this.inst!, r = this.round(gi.current_round);
        if (r.phase !== 'revealed') fail('reveal_current_round_first');
        if (gi.current_round === 8 && !this.finals) fail('compute_finals_options_first');
        r.phase = 'done'; gi.current_round! += 1; this.round(gi.current_round).phase = 'intro'; gi.screen_view = 'auto';
        this.refresh(); return gi.current_round;
      }
      case 'host_choose_finals_option': {
        this.requireHost(uid);
        if (!this.finals) fail('compute_finals_options_first');
        if (!['pending', 'intro'].includes(this.round(9).phase)) fail('finals_already_started');
        this.finals!.chosen_option = a.p_option; this.refresh(); return null;
      }
      case 'host_set_screen_view': this.requireHost(uid); this.inst!.screen_view = a.p_view; this.refresh(); return null;
      case 'host_set_screen_item': { this.requireHost(uid); const r = this.round(this.inst!.current_round); r.screen_item = Math.max(0, Math.min(a.p_item, r.item_count - 1)); this.refresh(); return null; }
      case 'host_pin_solution': {
        this.requireHost(uid); this.round(this.inst!.current_round).pin_solution = !!a.p_pin;
        if (a.p_pin && this.inst!.screen_view === 'standings') this.inst!.screen_view = 'auto';
        this.refresh(); return null;
      }
      case 'host_finish_game': {
        this.requireHost(uid);
        if (this.round(9).phase !== 'revealed') fail('reveal_finale_first');
        this.round(9).phase = 'done'; this.inst!.status = 'finished'; this.inst!.screen_view = 'final_results';
        this.refresh(); return null;
      }
      case 'host_remove_team': this.requireHost(uid); this.teams.find((t) => t.id === a.p_team)!.status = 'removed'; this.refresh(); return null;
      case 'host_request_reset': this.requireHost(uid); return 'demo-token';
      case 'host_confirm_reset': {
        this.requireHost(uid);
        if (a.p_confirm_text !== 'איפוס') fail('confirmation_text_mismatch');
        this.teams = []; this.devices = []; this.subs = []; this.bets = []; this.scores = []; this.finals = null;
        this.rounds.forEach((r) => Object.assign(r, { phase: 'pending', opened_at: null, ends_at: null, paused_remaining_ms: null, public_payload: null, solution_payload: null, finalists: null, revealed_at: null, screen_item: 0, pin_solution: false }));
        Object.assign(this.inst!, { status: 'setup', current_round: null, screen_view: 'auto' });
        this.refresh(); return null;
      }
      case 'host_archive_instance': this.requireHost(uid); this.inst = null; this.rounds = []; this.teams = []; this.devices = []; this.subs = []; this.bets = []; this.scores = []; this.finals = null; this.refresh(); return null;
      case 'team_register': return this.register(uid, a.p_members);
      case 'host_issue_transfer_code': {
        this.requireHost(uid);
        const t = this.teams.find((x) => x.id === a.p_team) ?? fail('team_not_found');
        t.transfer = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
        return t.transfer;
      }
      case 'team_claim_transfer': {
        const t = this.activeTeams().find((x) => x.transfer && x.transfer === String(a.p_code).trim()) ?? fail('bad_transfer_code');
        this.devices = this.devices.filter((d) => d.team_id !== t.id && d.user_id !== uid);
        this.devices.push({ user_id: uid!, team_id: t.id, role: 'captain' });
        t.transfer = undefined;
        return { team_id: t.id, name: t.name };
      }
      case 'team_get_state': return this.teamState(uid);
      case 'team_place_bet': {
        const d = this.devices.find((x) => x.user_id === uid) ?? fail('not_in_team');
        if (d.role !== 'captain') fail('captain_only');
        const r = this.round(this.inst!.current_round);
        if (r.phase !== 'betting') fail('betting_closed');
        if (!this.task(r).settings.bet.tracks.some((t: Json) => t.id === a.p_track)) fail('unknown_track');
        const base = this.betBase(r), before = this.totals(false).find((x) => x.team_id === d.team_id)!.total;
        this.bets = this.bets.filter((b) => !(b.team_id === d.team_id && b.round_no === r.round_no));
        this.bets.push({ round_no: r.round_no, team_id: d.team_id, track_id: a.p_track, base_points: base, total_before: before });
        return { track_id: a.p_track, base_points: base, total_before: before };
      }
    }
    return fail(`unknown_rpc_${fn}`);
  }

  private roundAction(uid: string | null, no: number, action: string) {
    this.requireHost(uid);
    const gi = this.inst!;
    if (gi.status !== 'in_progress') fail('game_not_in_progress');
    if (gi.current_round !== no) fail('not_current_round');
    const r = this.round(no), tt = this.task(r);
    const map: Record<string, [string, string[]]> = {
      open_betting: ['betting', ['intro']], lock_bets: ['bets_locked', ['betting']],
      open: ['open', tt.kind === 'bet_puzzle' ? ['bets_locked'] : ['intro']], pause: ['paused', ['open']],
      resume: ['open', ['paused']], close: ['closed', ['open', 'paused']], reveal: ['revealed', ['graded']],
    };
    const [target, allowed] = map[action] ?? fail('unknown_action');
    if (r.phase === target) return target;
    if (!allowed.includes(r.phase)) fail('illegal_transition');
    if (no === 9 && action === 'open' && !this.finals?.chosen_option) fail('finals_option_must_be_chosen_first');
    const now = Date.now();
    if (action === 'open') {
      Object.assign(r, { phase: 'open', opened_at: new Date(now).toISOString(), ends_at: new Date(now + tt.duration_sec * 1000).toISOString(),
                         public_payload: { ...tt.public_content, assets: tt.assets } });
    } else if (action === 'pause') {
      Object.assign(r, { phase: 'paused', paused_remaining_ms: Math.max(0, Date.parse(r.ends_at!) - now), ends_at: null });
    } else if (action === 'resume') {
      Object.assign(r, { phase: 'open', ends_at: new Date(now + r.paused_remaining_ms!).toISOString(), paused_remaining_ms: null });
    } else if (action === 'close') {
      Object.assign(r, { phase: 'closed', ends_at: new Date(Math.min(r.ends_at ? Date.parse(r.ends_at) : now, now)).toISOString(), paused_remaining_ms: null });
    } else if (action === 'reveal') {
      Object.assign(r, { phase: 'revealed', solution_payload: this.secrets[r.task_id], revealed_at: new Date().toISOString(), pin_solution: false });
      this.scores.filter((s) => s.round_no === no).forEach((s) => (s.revealed = true));
    } else if (action === 'lock_bets') {
      const base = this.betBase(r), tot = this.totals(false);
      const def = tt.settings.bet.defaultTrack ?? tt.settings.bet.tracks.find((t: Json) => t.lossMultiplier === 0)?.id;
      for (const t of this.activeTeams()) {
        if (!this.bets.some((b) => b.team_id === t.id && b.round_no === no)) {
          this.bets.push({ round_no: no, team_id: t.id, track_id: def, base_points: base, total_before: tot.find((x) => x.team_id === t.id)!.total });
        }
      }
      r.phase = 'bets_locked';
    } else r.phase = target;
    this.refresh();
    return target;
  }

  private register(uid: string | null, members: string[] | null, bot = false) {
    if (!uid) fail('not_signed_in');
    if (!this.inst) fail('no_active_game');
    if (this.inst!.status !== 'registration_open') fail('registration_not_open');
    if (this.devices.some((d) => d.user_id === uid)) fail('device_already_registered');
    const m = (members ?? []).map((x) => x.trim()).filter(Boolean);
    if (!m.length) fail('members_required');
    if (this.activeTeams().length >= 20) fail('too_many_teams');
    const free = FUNNY.filter((n) => !this.teams.some((t) => t.name === n));
    const name = free.length ? free[Math.floor(Math.random() * free.length)] : `קבוצה ${this.teams.length + 1}`;
    const t: Team = { id: uuid(), name, color: PALETTE[this.activeTeams().length % PALETTE.length], members: m, status: 'active', created_at: Date.now(), bot };
    this.teams.push(t);
    this.devices.push({ user_id: uid!, team_id: t.id, role: 'captain' });
    this.refresh();
    return { team_id: t.id, name };
  }

  private teamState(uid: string | null) {
    if (!uid || !this.inst) return { registered: false };
    const d = this.devices.find((x) => x.user_id === uid);
    if (!d) return { registered: false, instance_id: this.inst.id };
    const t = this.teams.find((x) => x.id === d.team_id)!;
    let subs: Json[] = [], bet: Json = null;
    if (this.inst.current_round) {
      const r = this.round(this.inst.current_round);
      const fb = this.task(r).settings.instant_feedback === true || ['revealed', 'done'].includes(r.phase);
      subs = this.subs.filter((s) => s.team_id === t.id && s.round_no === r.round_no)
        .map((s) => ({ item_index: s.item_index, attempt_no: s.attempt_no, status: s.status, received_at: s.received_at,
                       correct: fb && s.status === 'graded' ? s.ratio === 1 : null }));
      const b = this.bets.find((x) => x.team_id === t.id && x.round_no === r.round_no);
      bet = b ? { track_id: b.track_id, base_points: b.base_points } : null;
    }
    let score: Json = null;
    if (['in_progress', 'finished'].includes(this.inst.status)) {
      const tot = this.totals(true), mine = tot.find((x) => x.team_id === t.id)!.total;
      score = { total: mine, rank: 1 + tot.filter((x) => x.total > mine).length, teams: tot.length };
    }
    return { registered: true, instance_id: this.inst.id,
      team: { id: t.id, name: t.name, color: t.color, members: t.members, status: t.status, role: d.role },
      round_submissions: subs, bet, score };
  }

  // ───────── Edge Function "game" ─────────
  invoke(uid: string | null, body: Json): Json {
    switch (body.action) {
      case 'submit': return this.submit(uid!, body.item_index, body.payload, body.client_request_id);
      case 'grade_round': return this.gradeRound(uid, body.round_no);
      case 'review': {
        this.requireHost(uid);
        const s = this.subs.find((x) => x.id === body.submission_id) ?? fail('submission_not_found');
        const r = this.round(s.round_no), tt = this.task(r);
        const g = { ratio: body.accept ? 1 : 0, correct: !!body.accept, needsReview: false };
        this.applyGrade(s, g, pointsFor(tt.scoring, g, Date.parse(s.received_at) - Date.parse(r.opened_at!), tt.duration_sec * 1000));
        return { ok: true };
      }
      case 'compute_finals': {
        this.requireHost(uid);
        if (!['revealed', 'done'].includes(this.round(8).phase)) fail('reveal_round_8_first');
        const res = computeFinals(this.totals(false), this.inst!.settings);
        this.finals = { finalists: res.finalists, options: res, chosen_option: null, placements: null };
        this.round(9).finalists = res.finalists.map((f) => f.teamId);
        this.refresh();
        return res;
      }
    }
    return fail('unknown_action');
  }

  submit(uid: string, item: number, payload: Json, requestId: string) {
    const dup = this.subs.find((s) => s.submitted_by === uid && s.client_request_id === requestId);
    if (dup) return { received: true, status: dup.status, duplicate: true, attempt_no: dup.attempt_no };
    const d = this.devices.find((x) => x.user_id === uid) ?? fail('not_in_team');
    const gi = this.inst!;
    if (gi.status !== 'in_progress') fail('game_not_in_progress');
    const r = this.round(gi.current_round), tt = this.task(r);
    if (tt.submission_policy === 'captain_only' && d.role !== 'captain') fail('captain_only');
    if (r.round_no === 9 && !r.finalists?.includes(d.team_id)) fail('not_a_finalist');
    if (item < 0 || item >= r.item_count) fail('bad_item');
    if (r.phase === 'paused') fail('round_paused');
    if (!['open', 'closed'].includes(r.phase)) fail('round_not_open');
    const now = Date.now();
    const late = !r.ends_at || now > Date.parse(r.ends_at) + GRACE_MS;
    const mine = this.subs.filter((s) => s.team_id === d.team_id && s.round_no === r.round_no);
    if (mine.some((s) => s.item_index === item && s.status === 'graded' && s.ratio === 1)) fail('already_solved');
    const attempts = mine.filter((s) => s.item_index === item && s.status !== 'late').length;
    const limit = tt.attempts_limit ?? 1;
    if (attempts >= limit) fail('no_attempts_left');
    if (tt.settings.sequential && item !== new Set(mine.filter((s) => s.status !== 'late').map((s) => s.item_index)).size) fail('item_locked_or_out_of_order');
    if (tt.settings.eliminate_on_fail && mine.some((s) => s.status === 'graded' && (s.ratio ?? 0) < 1)) fail('eliminated');
    const s: Sub = { id: this.seq++, round_no: r.round_no, team_id: d.team_id, item_index: item, attempt_no: attempts + 1, payload, submitted_by: uid,
                     client_request_id: requestId, received_at: new Date(now).toISOString(), status: late ? 'late' : 'received', grade: null, ratio: null };
    this.subs.push(s);
    if (late) return { received: true, status: 'late', attempt_no: s.attempt_no };
    const g = gradeSubmission(this.secrets[r.task_id], item, payload);
    this.applyGrade(s, g, pointsFor(tt.scoring, g, now - Date.parse(r.opened_at!), tt.duration_sec * 1000));
    const instant = tt.settings.instant_feedback === true;
    return { received: true, status: g.needsReview ? 'needs_review' : 'graded', attempt_no: s.attempt_no,
             correct: instant ? g.correct : undefined, attempts_left: instant ? Math.max(0, limit - s.attempt_no) : undefined };
  }

  private applyGrade(s: Sub, g: { ratio: number; needsReview: boolean }, points: number) {
    if (s.status === 'late') return;
    Object.assign(s, { grade: g, ratio: g.ratio, status: g.needsReview ? 'needs_review' : 'graded' });
    const key = `r${s.round_no}:item${s.item_index}`;
    if (!g.needsReview && points !== 0 && !this.scores.some((x) => x.team_id === s.team_id && x.source_key === key)) {
      this.scores.push({ team_id: s.team_id, round_no: s.round_no, source_key: key, points, reason: 'auto_grade', revealed: false });
    }
  }

  private writeScores(round: number, evs: { team_id: string; source_key: string; points: number; reason: string }[]) {
    for (const e of evs) if (!this.scores.some((x) => x.team_id === e.team_id && x.source_key === e.source_key)) {
      this.scores.push({ ...e, round_no: round, revealed: false });
    }
  }

  private gradeRound(uid: string | null, no: number) {
    this.requireHost(uid);
    const r = this.round(no), tt = this.task(r);
    if (r.phase !== 'closed') fail('round_must_be_closed');
    const review = this.subs.filter((s) => s.round_no === no && s.status === 'needs_review');
    if (review.length) return { needs_review: review.map((s) => ({ id: s.id, team_id: s.team_id, item_index: s.item_index, payload: s.payload })) };
    const subs = this.subs.filter((s) => s.round_no === no) as Json[];
    if (tt.kind === 'bet_puzzle') this.writeScores(no, settleBets(tt.settings.bet, this.bets.filter((b) => b.round_no === no), subs, no));
    if (tt.kind === 'finale') {
      const opt = this.finals!.options.options.find((o: Json) => o.id === this.finals!.chosen_option);
      const pl = finalsPlacements(subs);
      this.finals!.placements = pl;
      this.writeScores(no, finalsScoreEvents(pl, opt));
    }
    r.phase = 'graded';
    this.refresh();
    return { graded: true };
  }

  // ───────── demo bots: extra teams so standings & finals have something to show ─────────
  addBots(n: number) {
    const people = [['סבא', 'יעל'], ['דנה', 'עומר'], ['שירה', 'אבא'], ['נגה', 'דוד'], ['רון', 'מיכל'], ['אלה', 'תום'], ['גיל', 'ליה'], ['הדס', 'בן']];
    for (let k = 0; k < n; k++) this.register(`bot-${uuid()}`, people[(this.teams.length + k) % people.length], true);
  }

  /** Every bot team answers the current round (≈65% correct). */
  botsPlay() {
    const r = this.round(this.inst?.current_round ?? null);
    if (!r) return;
    const tt = this.task(r), key: Json = this.secrets[r.task_id];
    for (const t of this.activeTeams().filter((x) => x.bot)) {
      const uid = this.devices.find((d) => d.team_id === t.id)!.user_id;
      if (r.phase === 'betting') { try { this.rpc(uid, 'team_place_bet', { p_track: ['safe', 'mid', 'all'][Math.floor(Math.random() * 3)] }); } catch { /* ignore */ } continue; }
      if (r.phase !== 'open') continue;
      if (r.round_no === 9 && !r.finalists?.includes(t.id)) continue;
      for (let i = 0; i < r.item_count; i++) {
        const ok = Math.random() < 0.65;
        try { this.submit(uid, i, botPayload(tt.kind, key, i, ok), uuid()); } catch { break; }
      }
    }
    this.refresh();
  }
}

function botPayload(kind: string, key: Json, i: number, ok: boolean): Json {
  const wrongChoice = (c: string) => (c === 'א' ? 'ב' : c === '1' ? '2' : 'א');
  switch (kind) {
    case 'code_vault': case 'finale': return { code: ok ? key.code : '0000' };
    case 'sprint': { const it = key.items[i]; return 'choice' in it ? { choice: ok ? it.choice : wrongChoice(it.choice) } : { text: ok ? it.text.canonical : 'לא יודעים' }; }
    case 'symbols': return { text: ok ? key.items[i].text.canonical : 'לא יודעים' };
    case 'video_memory': case 'truth_or_fiction': case 'three_pictures': return { choice: ok ? key.items[i].choice : wrongChoice(key.items[i].choice) };
    case 'ordering': { const o = key.correct.slice(); if (!ok) o.sort(() => Math.random() - 0.5); return { order: o }; }
    case 'sliding_puzzle': return { moves: ok ? solvePuzzle(key.start) : [] };
    case 'bet_puzzle': return { assignment: ok ? key.assignment : key.assignment.slice().reverse() };
    case 'sequence_memory': { const st = key.stages[i].slice(); if (!ok) st.reverse(); return { sequence: st }; }
  }
  return {};
}

function solvePuzzle(start: Board): number[] {
  const k = (b: Board) => b.join('');
  const prev = new Map<string, [string, number] | null>([[k(start), null]]);
  const q: Board[] = [start];
  while (q.length) {
    const b = q.shift()!;
    if (isSolved(b)) {
      const out: number[] = []; let c = k(b);
      while (prev.get(c)) { const [p, t] = prev.get(c)!; out.unshift(t); c = p; }
      return out;
    }
    for (const n of neighbors(b.indexOf(0))) {
      const nb = moveTile(b, b[n])!, nk = k(nb);
      if (!prev.has(nk)) { prev.set(nk, [k(b), b[n]]); q.push(nb); }
    }
  }
  return [];
}
