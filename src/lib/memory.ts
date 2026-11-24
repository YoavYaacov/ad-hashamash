/**
 * Candle memory on the client: everyone derives the same moment from the server clock and the
 * round's opened_at; each stage's sequence is fetched from the server only once it starts showing.
 */
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { memoryNow, DEFAULT_MEMORY_TIMING, type MemoryNow, type MemoryTiming } from '../../supabase/functions/_shared/engine/memory.ts';
import { useTick } from './hooks';

export function useMemoryClock(round: { opened_at?: string | null; content?: any } | null | undefined, offset: number): MemoryNow | null {
  useTick(100);
  if (!round?.opened_at || !round.content?.stage_lengths) return null;
  const timing: MemoryTiming = round.content.timing ?? DEFAULT_MEMORY_TIMING;
  return memoryNow(round.content.stage_lengths, Date.now() + offset - Date.parse(round.opened_at), timing);
}

export interface StageData { sequence?: string[]; passed?: number }

/** Sequence of `stage` (once released) and, when `wantPassed`, how many teams passed it. */
export function useStageData(client: SupabaseClient, instance: string | undefined, stage: number, active: boolean, wantPassed: boolean) {
  const [data, setData] = useState<Record<number, StageData>>({});
  const ref = useRef(data); ref.current = data;
  useEffect(() => {
    if (!instance || !active || stage < 0) return;
    let stop = false;
    const pull = async () => {
      const have = ref.current[stage];
      if (have?.sequence && (!wantPassed || have.passed !== undefined)) return;
      const { data: d, error } = await client.rpc('memory_stage', { p_instance: instance, p_stage: stage });
      if (!stop && !error && d) setData((m) => ({ ...m, [stage]: d as StageData }));
    };
    pull();
    const id = setInterval(pull, 700);
    return () => { stop = true; clearInterval(id); };
  }, [client, instance, stage, active, wantPassed]);
  return data[stage] ?? {};
}
