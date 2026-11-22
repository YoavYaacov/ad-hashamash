/**
 * The subset of the supabase-js API the app uses, backed by MockServer. Demo only.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MockServer } from './mockServer';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const delay = (ms = 60) => new Promise((r) => setTimeout(r, ms)); // a touch of "network" latency

function getPath(row: Json, col: string) {
  // supports 'state->instance->>status' and plain columns
  return col.split(/->>?/).reduce((v, k) => (v == null ? v : v[k]), row);
}

class Query implements PromiseLike<{ data: Json; error: null }> {
  private filters: ((r: Json) => boolean)[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private lim: number | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private rows: () => Json[];
  constructor(rows: () => Json[]) { this.rows = rows; }
  select() { return this; }
  eq(col: string, v: Json) { this.filters.push((r) => getPath(r, col) === v); return this; }
  neq(col: string, v: Json) { this.filters.push((r) => getPath(r, col) !== v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  then<A, B>(ok?: ((v: { data: Json; error: null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return delay().then(() => {
      let out = this.rows().filter((r) => this.filters.every((f) => f(r)));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        out = out.slice().sort((a, b) => (getPath(a, col) > getPath(b, col) ? 1 : -1) * (asc ? 1 : -1));
      }
      if (this.lim != null) out = out.slice(0, this.lim);
      const data = this.mode === 'many' ? out : out[0] ?? null;
      return { data: JSON.parse(JSON.stringify(data)), error: null };
    }).then(ok, bad);
  }
}

export function createMockClient(server: MockServer, opts: { userId: string; host?: boolean }): SupabaseClient {
  let session: Json = { user: { id: opts.userId }, access_token: 'demo' };
  if (opts.host) server.hosts.add(opts.userId);
  const isHost = () => server.hosts.has(opts.userId);

  const tables: Record<string, () => Json[]> = {
    public_state: () => (server.publicRow && server.inst ? [{ ...server.publicRow, instance_id: server.inst.id }] : []),
    game_templates: () => (isHost() ? [{ id: server.template.id, name: server.template.name, is_placeholder: true, created_at: 0 }] : []),
    teams: () => (isHost() && server.inst ? server.teams.map((t) => ({ ...t, instance_id: server.inst!.id })) : []),
    submissions: () => (isHost() && server.inst ? server.subs.map((s) => ({ ...s, instance_id: server.inst!.id })) : []),
    finals: () => (isHost() && server.inst && server.finals ? [{ ...server.finals, instance_id: server.inst.id }] : []),
  };

  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      signInAnonymously: async () => { session = { user: { id: opts.userId } }; return { data: { session }, error: null }; },
      signInWithPassword: async () => { session = { user: { id: opts.userId } }; return { data: { session }, error: null }; },
      signOut: async () => { session = null; return { error: null }; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    rpc: async (fn: string, args: Json = {}) => {
      await delay();
      try { return { data: JSON.parse(JSON.stringify(server.rpc(session?.user.id ?? null, fn, args) ?? null)), error: null }; }
      catch (e) { return { data: null, error: { message: (e as Error).message } }; }
    },
    from: (table: string) => new Query(tables[table] ?? (() => [])),
    functions: {
      invoke: async (_name: string, { body }: { body: Json }) => {
        await delay(120);
        try { return { data: JSON.parse(JSON.stringify(server.invoke(session?.user.id ?? null, body))), error: null }; }
        catch (e) {
          const code = (e as Error).message;
          return { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: code }) } } };
        }
      },
    },
    channel: () => {
      let cb: ((p: Json) => void) | null = null;
      let unsub: (() => void) | null = null;
      const ch = {
        on: (_e: string, _f: Json, fn: (p: Json) => void) => { cb = fn; return ch; },
        subscribe: (status?: (s: string) => void) => {
          unsub = server.subscribe((row) => cb?.(row ? { eventType: 'UPDATE', new: { ...row, instance_id: server.inst?.id } } : { eventType: 'DELETE' }));
          setTimeout(() => status?.('SUBSCRIBED'), 30);
          return ch;
        },
        _unsub: () => unsub?.(),
      };
      return ch;
    },
    removeChannel: (ch: Json) => ch?._unsub?.(),
  };
  return client as unknown as SupabaseClient;
}
