import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

/**
 * One client per interface, each with its own auth storage key, so the host session and a
 * team session never collide even if both are opened in the same browser.
 * localStorage holds ONLY the auth token — never game state (the server is the source of truth).
 */
const clients: Partial<Record<'screen' | 'host' | 'play', SupabaseClient>> = {};

export function getClient(role: 'screen' | 'host' | 'play'): SupabaseClient {
  if (!clients[role]) {
    clients[role] = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { storageKey: `hk-auth-${role}`, persistSession: role !== 'screen', autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return clients[role]!;
}
