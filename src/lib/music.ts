/**
 * Background music on the projector. One looping track at a time, smooth cross-fades,
 * host-controlled on/off and volume (from the public snapshot). Original tracks, synthesized
 * from code (scripts/music/synth.py), so there are no rights issues.
 */
import { useEffect, useRef, useState } from 'react';

export type TrackId = 'lobby' | 'puzzle' | 'happy' | 'ticking' | 'party';

/** Per-track level so the quiet puzzle bed sits under talking and the finale is the loudest. */
const LEVEL: Record<TrackId, number> = { lobby: 0.8, puzzle: 0.5, happy: 0.6, ticking: 0.7, party: 0.95 };
const FADE_MS = 1400;

const src = (id: TrackId) => `${import.meta.env.VITE_AUDIO_BASE ?? `${import.meta.env.BASE_URL}audio/`}${id}.mp3`;

class Player {
  els = new Map<TrackId, HTMLAudioElement>();
  current: TrackId | null = null;
  private master = 0.6;
  private raf = 0;
  unlocked = false;

  private el(id: TrackId) {
    let a = this.els.get(id);
    if (!a) { a = new Audio(src(id)); a.loop = true; a.preload = 'auto'; a.volume = 0; this.els.set(id, a); }
    return a;
  }

  /** Must run inside a user gesture (browser autoplay rules). */
  async unlock() {
    for (const id of Object.keys(LEVEL) as TrackId[]) this.el(id);
    const a = this.el('lobby');
    try { await a.play(); a.pause(); this.unlocked = true; } catch { this.unlocked = false; }
    return this.unlocked;
  }

  setMaster(v: number) { this.master = Math.max(0, Math.min(1, v)); this.fadeTo(this.current); }

  play(id: TrackId | null) {
    if (id === this.current) { this.fadeTo(id); return; }
    this.current = id;
    if (id) { const a = this.el(id); if (a.paused) { if (id !== 'ticking') a.currentTime = a.currentTime || 0; a.play().catch(() => {}); } }
    this.fadeTo(id);
  }

  private fadeTo(id: TrackId | null) {
    cancelAnimationFrame(this.raf);
    const start = performance.now();
    const from = new Map([...this.els].map(([k, a]) => [k, a.volume]));
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / FADE_MS);
      for (const [k, a] of this.els) {
        const target = k === id ? LEVEL[k] * this.master : 0;
        const v = (from.get(k) ?? 0) + (target - (from.get(k) ?? 0)) * p;
        a.volume = Math.max(0, Math.min(1, v));
        if (p === 1 && target === 0 && !a.paused) a.pause();
      }
      if (p < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}

let player: Player | null = null;
const getPlayer = () => { if (!player) { player = new Player(); (globalThis as Record<string, unknown>).__music = player; } return player; };

/** Drives the player from what the screen is showing. Returns whether sound still needs one click. */
export function useMusic(track: TrackId | null, on: boolean, volume: number) {
  const [needsClick, setNeedsClick] = useState(() => !getPlayer().unlocked);
  const want = useRef<TrackId | null>(null);
  want.current = on ? track : null;
  useEffect(() => { getPlayer().setMaster(volume / 100); }, [volume]);
  useEffect(() => { if (!needsClick) getPlayer().play(on ? track : null); }, [track, on, needsClick]);
  const unlock = async () => {
    const ok = await getPlayer().unlock();
    setNeedsClick(!ok);
    if (ok) getPlayer().play(want.current);
  };
  return { needsClick, unlock };
}

/** Puzzles get the calm candle-light bed; the other tasks get the happy one. */
const PUZZLE_KINDS = new Set(['three_pictures', 'code_vault', 'ordering', 'bet_puzzle', 'finale', 'symbols']);

export function pickTrack(s: {
  instance: { status: string; screen_view?: string };
  round?: { kind: string; phase: string; ends_at?: string | null } | null;
}, nowMs: number, memoryPhase?: string | null): TrackId | null {
  const st = s.instance.status;
  if (st === 'finished' || s.instance.screen_view === 'final_results') return 'party';
  if (st !== 'in_progress') return 'lobby';
  const r = s.round;
  if (!r) return 'lobby';
  if (r.kind === 'sequence_memory' && r.phase === 'open') return memoryPhase === 'recall' ? 'ticking' : null;   // quiet while watching
  if (r.phase === 'open') {
    const left = r.ends_at ? Date.parse(r.ends_at) - nowMs : Infinity;
    if (left <= 10_500) return 'ticking';
    return PUZZLE_KINDS.has(r.kind) ? 'puzzle' : 'happy';
  }
  if (r.phase === 'betting') return 'happy';
  if (r.phase === 'paused') return null;
  return 'lobby';                                       // intro, results, standings
}
