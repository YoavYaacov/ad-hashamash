import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicState } from './types';

/**
 * Server clock offset (ms): serverNow ≈ Date.now() + offset.
 * Takes several samples and keeps the one with the smallest round trip (NTP-style).
 */
export function useServerClock(client: SupabaseClient) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const sample = async () => {
      let best: { rtt: number; off: number } | null = null;
      for (let i = 0; i < 5; i++) {
        const t0 = Date.now();
        const { data, error } = await client.rpc('server_time');
        const t1 = Date.now();
        if (error || !data) continue;
        const rtt = t1 - t0;
        const off = Date.parse(data as string) - (t0 + rtt / 2);
        if (!best || rtt < best.rtt) best = { rtt, off };
      }
      if (best && !cancelled) setOffset(best.off);
    };
    sample();
    const id = setInterval(sample, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [client]);
  return offset;
}

/** Re-render every `ms` (for timers). */
export function useTick(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export type ConnState = 'connecting' | 'live' | 'reconnecting';

/**
 * Live screen-safe state. Realtime push + safety net: refetch on reconnect, on tab focus,
 * and every 8 s (cheap: one row). The highest `version` always wins, so out-of-order
 * messages can never roll the UI back.
 */
export function usePublicState(client: SupabaseClient) {
  const [state, setState] = useState<PublicState | null>(null);
  const [version, setVersion] = useState(0);
  const [conn, setConn] = useState<ConnState>('connecting');
  const verRef = useRef(0);
  const idRef = useRef<string | null>(null);

  // Stable (no deps on state) so the Realtime channel is created ONCE and never torn down mid-game.
  const accept = useCallback((row: { state: PublicState; version: number } | null) => {
    const inst = row?.state?.instance;
    if (!row || !inst?.id) return;                       // ignore incomplete rows
    if (inst.status === 'archived') {                     // the current game was archived
      if (inst.id === idRef.current) { idRef.current = null; verRef.current = 0; setState(null); }
      return;
    }
    if (inst.id === idRef.current && row.version <= verRef.current) return;   // stale/out-of-order
    idRef.current = inst.id;
    verRef.current = row.version;
    setVersion((v) => v + 1);
    setState(row.state);
  }, []);

  const refetch = useCallback(async () => {
    const { data, error } = await client.from('public_state').select('state, version, updated_at')
      .neq('state->instance->>status', 'archived').order('updated_at', { ascending: false }).limit(1);
    if (error) { setConn('reconnecting'); return; }
    if (data && data[0]) accept(data[0] as any);
    else if (idRef.current) { idRef.current = null; verRef.current = 0; setState(null); setVersion((v) => v + 1); }
  }, [client, accept]);

  useEffect(() => {
    refetch();
    const ch = client.channel(`public_state:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'public_state' }, (p) => {
        if (p.eventType === 'DELETE') { refetch(); return; }
        accept(p.new as any);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { setConn('live'); refetch(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConn('reconnecting');
      });
    const poll = setInterval(refetch, 8000);
    const onVis = () => { if (document.visibilityState === 'visible') refetch(); };
    const onOnline = () => refetch();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    return () => {
      client.removeChannel(ch);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
    };
  }, [client, refetch, accept]);

  return { state, version, conn, refetch };
}

/** Milliseconds left on the round timer, using server time. */
export function remainingMs(endsAt: string | null, pausedMs: number | null, offset: number): number | null {
  if (pausedMs != null) return pausedMs;
  if (!endsAt) return null;
  return Math.max(0, Date.parse(endsAt) - (Date.now() + offset));
}
