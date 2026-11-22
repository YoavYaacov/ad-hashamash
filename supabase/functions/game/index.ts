/**
 * Edge Function "game" — the only code that ever sees answer keys.
 *
 * POST { action, ... } with the caller's Supabase JWT.
 *   submit          (team)  { item_index, payload, client_request_id }
 *   grade_round     (host)  { instance_id, round_no }
 *   review          (host)  { submission_id, accept }
 *   compute_finals  (host)  { instance_id }
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { AnswerKey, BetConfig, ItemSubmission } from '../_shared/engine/index.ts';
import { computeFinals, finalsPlacements, finalsScoreEvents, gradeSubmission, pointsFor, settleBets, type Scoring } from './logic.ts';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await svc.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: 'not_signed_in' }, 401);
  const uid = u.user.id;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const requireHost = async () => {
    const { data } = await userClient.rpc('am_i_host');
    if (data !== true) throw Object.assign(new Error('not_host'), { status: 403 });
  };

  try {
    switch (body.action) {
      // ── team submission: record (server time) → grade → store points (hidden until reveal) ──
      case 'submit': {
        const rec = await rpc<any>('svc_record_submission', {
          p_user: uid, p_request: body.client_request_id, p_item: body.item_index, p_payload: body.payload,
        });
        const sub = rec.submission;
        if (rec.duplicate || sub.status === 'late') {
          return json({ received: true, status: sub.status, duplicate: rec.duplicate, attempt_no: sub.attempt_no });
        }
        const key = rec.answer_key as AnswerKey;
        const grade = gradeSubmission(key, sub.item_index, sub.payload as ItemSubmission);
        const elapsed = Date.parse(sub.received_at) - Date.parse(rec.task.opened_at);
        const points = pointsFor(rec.task.scoring as Scoring, grade, elapsed, rec.task.duration_sec * 1000);
        await rpc('svc_apply_grade', { p_submission: sub.id, p_grade: grade, p_ratio: grade.ratio, p_points: points, p_needs_review: grade.needsReview });
        // Correctness is revealed to the phone only if the task allows instant feedback.
        const instant = rec.task.settings?.instant_feedback === true;
        return json({
          received: true, status: grade.needsReview ? 'needs_review' : 'graded', attempt_no: sub.attempt_no,
          correct: instant ? grade.correct : undefined,
          attempts_left: instant ? Math.max(0, rec.task.attempts_limit - sub.attempt_no) : undefined,
        });
      }

      // ── host: finish grading a closed round, settle bets / finals, mark graded ──
      case 'grade_round': {
        await requireHost();
        const instance = String(body.instance_id), round = Number(body.round_no);
        const ctx = await rpc<any>('svc_round_context', { p_instance: instance, p_round: round });
        const key = ctx.answer_key as AnswerKey;
        // Grade anything left ungraded (e.g. function hiccup mid-submit).
        for (const s of ctx.submissions.filter((x: any) => x.status === 'received')) {
          const g = gradeSubmission(key, s.item_index, s.payload);
          const pts = pointsFor(ctx.task.scoring, g, Date.parse(s.received_at) - Date.parse(ctx.round.opened_at), ctx.task.duration_sec * 1000);
          await rpc('svc_apply_grade', { p_submission: s.id, p_grade: g, p_ratio: g.ratio, p_points: pts, p_needs_review: g.needsReview });
        }
        const fresh = await rpc<any>('svc_round_context', { p_instance: instance, p_round: round });
        const review = fresh.submissions.filter((s: any) => s.status === 'needs_review');
        if (review.length) return json({ needs_review: review.map((s: any) => ({ id: s.id, team_id: s.team_id, item_index: s.item_index, payload: s.payload })) });

        if (ctx.task.kind === 'bet_puzzle') {
          const events = settleBets(ctx.task.settings.bet as BetConfig, fresh.bets, fresh.submissions, round);
          await rpc('svc_write_scores', { p_instance: instance, p_round: round, p_events: events });
        }
        if (ctx.task.kind === 'finale') {
          const { data: fin } = await svc.from('finals').select('*').eq('instance_id', instance).single();
          if (!fin?.chosen_option) throw new Error('finals_option_not_chosen');
          const opt = fin.options.options.find((o: any) => o.id === fin.chosen_option);
          const placements = finalsPlacements(fresh.submissions);
          await rpc('svc_set_finals_placements', { p_instance: instance, p_placements: placements });
          await rpc('svc_write_scores', { p_instance: instance, p_round: round, p_events: finalsScoreEvents(placements, opt) });
        }
        await rpc('svc_mark_graded', { p_instance: instance, p_round: round });
        return json({ graded: true });
      }

      // ── host: decide an "uncertain" text answer ──
      case 'review': {
        await requireHost();
        const { data: s, error } = await svc.from('submissions').select('*').eq('id', body.submission_id).single();
        if (error || !s) throw new Error('submission_not_found');
        const ctx = await rpc<any>('svc_round_context', { p_instance: s.instance_id, p_round: s.round_no });
        const accept = body.accept === true;
        const g = { ratio: accept ? 1 : 0, correct: accept, needsReview: false, detail: { reviewed_by: uid } };
        const pts = pointsFor(ctx.task.scoring, g, Date.parse(s.received_at) - Date.parse(ctx.round.opened_at), ctx.task.duration_sec * 1000);
        await rpc('svc_apply_grade', { p_submission: s.id, p_grade: g, p_ratio: g.ratio, p_points: pts, p_needs_review: false });
        return json({ ok: true, points: pts });
      }

      // ── host: after round 8 is revealed, compute finalists + exactly two prize options ──
      case 'compute_finals': {
        await requireHost();
        const instance = String(body.instance_id);
        const ctx = await rpc<any>('svc_round_context', { p_instance: instance, p_round: 8 });
        if (!['revealed', 'done'].includes(ctx.round.phase)) throw new Error('reveal_round_8_first');
        const result = computeFinals(ctx.totals_all ?? [], ctx.instance_settings ?? {});
        await rpc('svc_set_finals', {
          p_instance: instance,
          p_finalists: result.finalists.map((f) => f.teamId),
          p_snapshot: result.finalists,
          p_options: result,
        });
        return json(result);
      }

      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    const err = e as Error & { status?: number };
    // Postgres exception text is a stable code like 'round_paused' — the UI maps it to Hebrew.
    return json({ error: err.message }, err.status ?? 400);
  }
});
