import { createContext, useContext } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getClient } from './supabase';

/**
 * Lets the demo inject an in-memory client per view (several phones on one page).
 * In the real app no provider is mounted, so each interface uses its own Supabase client.
 */
export const ClientContext = createContext<SupabaseClient | null>(null);

export function useClient(role: 'screen' | 'host' | 'play'): SupabaseClient {
  return useContext(ClientContext) ?? getClient(role);
}
