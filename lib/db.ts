import { Pool, types, type PoolClient } from "pg";

// Return DATE columns as plain "YYYY-MM-DD" strings so timezones can't shift them.
types.setTypeParser(1082, (v) => v);

const SCHEMA = `
create table if not exists trips (
  id text primary key,
  name text not null,
  start_date date,
  end_date date,
  budget_total integer,
  kitty_holder_id text,
  created_at timestamptz not null default now()
);
create table if not exists participants (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  name text not null,
  color integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists participants_trip on participants(trip_id);
create table if not exists receipts (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  mime text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create table if not exists expenses (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  title text not null,
  amount integer not null check (amount > 0),
  category text not null,
  spent_on date not null,
  payment_mode text not null,
  from_kitty boolean not null default false,
  split jsonb not null,
  note text not null default '',
  receipt_id text references receipts(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists expenses_trip on expenses(trip_id, spent_on);
create table if not exists expense_payers (
  expense_id text not null references expenses(id) on delete cascade,
  participant_id text not null references participants(id),
  amount integer not null check (amount > 0),
  primary key (expense_id, participant_id)
);
create table if not exists expense_splits (
  expense_id text not null references expenses(id) on delete cascade,
  participant_id text not null references participants(id),
  amount integer not null,
  primary key (expense_id, participant_id)
);
create table if not exists settlements (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  from_id text not null references participants(id),
  to_id text not null references participants(id),
  amount integer not null check (amount > 0),
  mode text not null,
  note text not null default '',
  paid_on date not null,
  created_by text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists settlements_trip on settlements(trip_id);
create table if not exists kitty_contributions (
  id text primary key,
  trip_id text not null references trips(id) on delete cascade,
  participant_id text not null references participants(id),
  amount integer not null check (amount > 0),
  mode text not null,
  note text not null default '',
  paid_on date not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists kitty_trip on kitty_contributions(trip_id);
create table if not exists budgets (
  trip_id text not null references trips(id) on delete cascade,
  category text not null,
  amount integer not null check (amount > 0),
  primary key (trip_id, category)
);
create table if not exists activity (
  id bigserial primary key,
  trip_id text not null references trips(id) on delete cascade,
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  changes jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists activity_trip on activity(trip_id, id desc);
`;

const g = globalThis as unknown as { __pool?: Pool; __schema?: Promise<void> };

function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Add your Neon connection string to .env.local (or to the Vercel project).");
    g.__pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  }
  return g.__pool;
}

/** Creates the tables the first time the app talks to a fresh database, so there is no migration step. */
async function ready(): Promise<Pool> {
  const p = pool();
  if (!g.__schema) {
    g.__schema = (async () => {
      const c = await p.connect();
      try {
        // Serialise concurrent cold starts so two of them don't race on CREATE TABLE.
        await c.query("select pg_advisory_lock(7411001)");
        await c.query(SCHEMA);
        await c.query("select pg_advisory_unlock(7411001)");
      } finally {
        c.release();
      }
    })().catch((e) => {
      g.__schema = undefined;
      throw e;
    });
  }
  await g.__schema;
  return p;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = await ready();
  return (await p.query(text, params)).rows as T[];
}

export async function transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const p = await ready();
  const c = await p.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
