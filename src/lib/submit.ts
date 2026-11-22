import type { SupabaseClient } from '@supabase/supabase-js';

export interface SubmitResult {
  received: boolean;
  status: string;
  attempt_no?: number;
  correct?: boolean;
  attempts_left?: number;
  duplicate?: boolean;
  error?: string;
}

/**
 * Send one answer. The same client_request_id is reused across retries, so a flaky network
 * or a double tap can never create two submissions (the server deduplicates on it).
 */
export async function submitAnswer(client: SupabaseClient, itemIndex: number, payload: unknown, requestId: string = crypto.randomUUID()): Promise<SubmitResult> {
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await client.functions.invoke('game', {
      body: { action: 'submit', item_index: itemIndex, payload, client_request_id: requestId },
    });
    if (!error) return data as SubmitResult;
    // Business errors (e.g. no_attempts_left) come back as JSON; don't retry those.
    let body: { error?: string } | null = null;
    try { body = await (error as any).context?.json?.(); } catch { /* not JSON */ }
    if (body?.error) return { received: false, status: 'rejected', error: body.error };
    lastErr = error.message;
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  return { received: false, status: 'network', error: lastErr || 'network' };
}
