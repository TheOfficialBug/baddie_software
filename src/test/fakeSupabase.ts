// An in-memory stand-in for the parts of the Supabase client that src/data/remote.ts uses:
// app_entities / app_private with a global version counter, upserts under a write rule
// (like row level security), and Realtime channels whose events the test delivers.
type Rec = Record<string, unknown>;

export interface FakeRow {
  coll: string;
  id: string;
  data: Rec;
  deleted: boolean;
  version: number;
  client_id: string | null;
  created: number;
}

interface Filter {
  op: 'eq' | 'gt' | 'in' | 'is';
  col: string;
  value: unknown;
}

type Result = { data: unknown; error: unknown };

export class FakeQuery implements PromiseLike<Result> {
  filters: Filter[] = [];
  orders: string[] = [];
  from?: number;
  to?: number;
  max?: number;
  write?: Rec[];
  returning = false;

  constructor(
    private readonly fake: FakeSupabase,
    readonly table: string,
  ) {}

  select() {
    if (this.write) this.returning = true;
    return this;
  }
  upsert(rows: Rec[]) {
    this.write = rows;
    return this;
  }
  insert(rows: Rec[]) {
    this.write = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  delete() {
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push({ op: 'eq', col, value });
    return this;
  }
  gt(col: string, value: unknown) {
    this.filters.push({ op: 'gt', col, value });
    return this;
  }
  in(col: string, value: unknown[]) {
    this.filters.push({ op: 'in', col, value });
    return this;
  }
  is(col: string, value: unknown) {
    this.filters.push({ op: 'is', col, value });
    return this;
  }
  order(col: string) {
    this.orders.push(col);
    return this;
  }
  range(from: number, to: number) {
    this.from = from;
    this.to = to;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.fake.run(this).then(ok, bad);
  }
}

export interface FakeChannel {
  topic: string;
  joined: boolean;
  removed: boolean;
  handler?: (payload: { new: Rec }) => void;
  status?: (s: string) => void;
  on: (ev: string, filter: unknown, cb: (payload: { new: Rec }) => void) => FakeChannel;
  subscribe: (cb: (s: string) => void) => FakeChannel;
}

export class FakeSupabase {
  rows = new Map<string, FakeRow>();
  priv = new Map<string, { id: string; data: Rec; version: number }>();
  seq = 0;
  created = 0;
  /** Which collections the signed-in account may write (row level security). */
  canWrite: (coll: string) => boolean = () => true;
  /** Fail requests (e.g. offline): return an error to answer with, or null to let it through. */
  fail: (q: FakeQuery) => unknown = () => null;
  /** While set, requests wait here until released. */
  gate: Promise<void> | null = null;
  /** While set, writes are committed but their answer waits here (a slow response). */
  holdResponse: Promise<void> | null = null;
  /** While set, reads see the database as it is now but their answer waits here. */
  holdReads: Promise<void> | null = null;
  /** Realtime events not yet delivered (the test delivers them). */
  outbox: Rec[] = [];
  channels: FakeChannel[] = [];
  requests: FakeQuery[] = [];

  key = (coll: string, id: string) => `${coll}:${id}`;

  /** A write committed by another device. */
  commit(coll: string, id: string, data: object, client: string | null = 'other', deleted = false) {
    const k = this.key(coll, id);
    const old = this.rows.get(k);
    const row: FakeRow = {
      coll,
      id,
      data: deleted ? { id } : (data as Rec),
      deleted,
      version: ++this.seq,
      client_id: client,
      created: old?.created ?? ++this.created,
    };
    this.rows.set(k, row);
    this.outbox.push({ ...row });
    return row;
  }

  get(coll: string, id: string) {
    return this.rows.get(this.key(coll, id));
  }

  /** Push pending Realtime events to subscribed channels. */
  deliver(filter: (r: Rec) => boolean = () => true) {
    const out = this.outbox.filter(filter);
    this.outbox = this.outbox.filter((r) => !filter(r));
    for (const r of out) for (const c of this.channels) if (c.joined && !c.removed) c.handler?.({ new: r });
  }

  live() {
    return this.channels.filter((c) => c.joined && !c.removed);
  }

  async run(q: FakeQuery): Promise<Result> {
    this.requests.push(q);
    await Promise.resolve();
    while (this.gate) await this.gate;
    const err = this.fail(q);
    if (err) return { data: null, error: err };
    if (q.table === 'app_entities' && q.write) {
      const res = this.upsertEntities(q);
      while (this.holdResponse) await this.holdResponse;
      return res;
    }
    if (q.table === 'app_entities') {
      const res = this.selectFrom([...this.rows.values()], q);
      while (this.holdReads) await this.holdReads;
      return res;
    }
    if (q.table === 'app_private') {
      if (q.write) {
        for (const r of q.write) this.priv.set(String(r.id), { id: String(r.id), data: r.data as Rec, version: ++this.seq });
        return { data: null, error: null };
      }
      return this.selectFrom([...this.priv.values()] as unknown as Rec[], q);
    }
    return { data: [], error: null };
  }

  private upsertEntities(q: FakeQuery): Result {
    const rows = q.write!;
    if (rows.some((r) => !this.canWrite(String(r.coll))))
      return { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "app_entities"' } };
    const out = rows.map((r) => this.commit(String(r.coll), String(r.id), r.data as Rec, (r.client_id as string) ?? null, !!r.deleted));
    return { data: q.returning ? out.map((r) => ({ coll: r.coll, id: r.id, version: r.version })) : null, error: null };
  }

  private selectFrom(all: Rec[] | FakeRow[], q: FakeQuery): Result {
    let list = (all as Rec[]).filter((r) =>
      q.filters.every((f) => {
        const v = r[f.col];
        if (f.op === 'eq') return v === f.value;
        if (f.op === 'gt') return Number(v) > Number(f.value);
        if (f.op === 'in') return (f.value as unknown[]).includes(v);
        return v === f.value || (f.value === null && v === undefined);
      }),
    );
    const by = q.orders[0] === 'created_at' ? 'created' : q.orders[0];
    if (by) list = [...list].sort((a, b) => Number(a[by]) - Number(b[by]));
    if (q.from !== undefined) list = list.slice(q.from, (q.to ?? list.length) + 1);
    if (q.max !== undefined) list = list.slice(0, q.max);
    return { data: list.map((r) => ({ ...r })), error: null };
  }

  rpc() {
    return Promise.resolve({ data: [], error: null });
  }

  /** Like realtime-js: a topic that is still open is handed out again rather than created anew. */
  channel(topic: string): FakeChannel {
    const open = this.channels.find((c) => c.topic === topic && !c.removed);
    if (open) return open;
    const c: FakeChannel = {
      topic,
      joined: false,
      removed: false,
      on(_ev, _filter, cb) {
        c.handler = cb;
        return c;
      },
      subscribe(cb) {
        // a channel joins once; subscribing again does nothing
        if (c.joined) return c;
        c.joined = true;
        c.status = cb;
        queueMicrotask(() => cb('SUBSCRIBED'));
        return c;
      },
    };
    this.channels.push(c);
    return c;
  }

  removeChannel(c: FakeChannel) {
    // leaving takes a round trip to the server
    return new Promise<string>((resolve) =>
      setTimeout(() => {
        c.removed = true;
        c.status?.('CLOSED');
        resolve('ok');
      }, 5),
    );
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}
