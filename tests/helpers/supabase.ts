import { vi } from "vitest";

export type Filter = { method: string; args: unknown[] };

export type Query = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  payload?: unknown;
  columns?: string;
  filters: Filter[];
  single: boolean;
  maybeSingle: boolean;
};

export type Result = { data?: unknown; error?: unknown; count?: number | null };

type QueryHandler = (query: Query) => Result | undefined;
type RpcHandler = (name: string, args: Record<string, unknown>) => Result | undefined;
type InvokeHandler = (name: string, options: { body?: unknown }) => Result | undefined;

type ChannelListener = {
  channel: string;
  event: string;
  filter: Record<string, unknown>;
  callback: (payload: { new: unknown }) => void;
};

const FILTER_METHODS = [
  "eq",
  "neq",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
  "is",
  "or",
  "ilike",
  "like",
  "match",
  "order",
  "limit",
  "range",
] as const;

/** Value of the first `.eq(column, value)` filter, handy inside handlers. */
export const eqValue = (query: Query, column: string) =>
  query.filters.find((filter) => filter.method === "eq" && filter.args[0] === column)?.args[1];

export function createFakeSupabase() {
  let onQuery: QueryHandler = () => undefined;
  let onRpc: RpcHandler = () => undefined;
  let onInvoke: InvokeHandler = () => undefined;
  const queries: Query[] = [];
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  const listeners: ChannelListener[] = [];

  const settle = (result: Result | undefined) => ({
    data: result?.data ?? null,
    error: result?.error ?? null,
    count: result?.count ?? null,
  });

  const builder = (table: string) => {
    const query: Query = { table, op: "select", filters: [], single: false, maybeSingle: false };
    let opSet = false;
    let promise: Promise<ReturnType<typeof settle>> | null = null;

    const setOp = (op: Query["op"], payload?: unknown) => {
      query.op = op;
      query.payload = payload;
      opSet = true;
    };

    const chain: Record<string, unknown> = {
      select(columns?: string) {
        if (!opSet) setOp("select");
        query.columns = columns ?? "*";
        return chain;
      },
      insert(payload: unknown) {
        setOp("insert", payload);
        return chain;
      },
      update(payload: unknown) {
        setOp("update", payload);
        return chain;
      },
      upsert(payload: unknown) {
        setOp("upsert", payload);
        return chain;
      },
      delete() {
        setOp("delete");
        return chain;
      },
      single() {
        query.single = true;
        return chain;
      },
      maybeSingle() {
        query.maybeSingle = true;
        return chain;
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        promise ??= Promise.resolve().then(() => {
          queries.push(query);
          return settle(onQuery(query));
        });
        return promise.then(resolve, reject);
      },
    };
    for (const method of FILTER_METHODS) {
      chain[method] = (...args: unknown[]) => {
        query.filters.push({ method, args });
        return chain;
      };
    }
    return chain;
  };

  const client = {
    from: vi.fn((table: string) => builder(table)),
    rpc: vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
      rpcs.push({ name, args });
      return settle(onRpc(name, args));
    }),
    functions: {
      invoke: vi.fn(async (name: string, options: { body?: unknown } = {}) =>
        settle(onInvoke(name, options)),
      ),
    },
    channel: vi.fn((channelName: string) => {
      const channel = {
        on(event: string, filter: Record<string, unknown>, callback: ChannelListener["callback"]) {
          listeners.push({ channel: channelName, event, filter, callback });
          return channel;
        },
        subscribe() {
          return channel;
        },
      };
      return channel;
    }),
    removeChannel: vi.fn(async () => "ok"),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { session: null }, error: null })),
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  };

  return {
    client,
    queries,
    rpcs,
    listeners,
    onQuery(handler: QueryHandler) {
      onQuery = handler;
    },
    onRpc(handler: RpcHandler) {
      onRpc = handler;
    },
    onInvoke(handler: InvokeHandler) {
      onInvoke = handler;
    },
    /** Delivers a realtime INSERT to every listener subscribed to `table`. */
    emit(table: string, row: unknown) {
      for (const listener of listeners) {
        if (listener.filter["table"] === table) listener.callback({ new: row });
      }
    },
    reset() {
      onQuery = () => undefined;
      onRpc = () => undefined;
      onInvoke = () => undefined;
      queries.length = 0;
      rpcs.length = 0;
      listeners.length = 0;
      vi.clearAllMocks();
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

/** Shared instance used by `vi.mock("@/lib/supabase/client")` in frontend tests. */
export const fake = createFakeSupabase();
