---
concern: database
tech: [better-sqlite3, sqlite, postgres, node, typescript]
priority: recommended
source-repo: tcg
applies-to: [node, sqlite, dual-driver-storage]
---
# Export synchronous sqlite helpers alongside async-wrapped store methods, for safe multi-table transactions

## PATTERN
When a codebase has a dual-driver storage layer (sqlite for dev, Postgres for
prod) built from per-table store factories (`makeSqliteStore(db)` /
`makePostgresStore(pool)`), and a new feature needs to write to SEVERAL of
those tables atomically in one transaction, don't call the stores' `async`
interface methods from inside a `better-sqlite3` `db.transaction(fn)`
callback. Instead, export the underlying logic as plain synchronous
functions (`insertXSync(db, ...)`, `upsertYSync(db, ...)`), have the store's
`async` interface methods thinly wrap those same functions, and have the
transaction-composing code call the sync versions directly.

For Postgres, no such restructuring is needed: `pool.connect()` + a normal
`async` function with awaited `client.query()` calls inside BEGIN/COMMIT
works natively, since Postgres transactions are tied to a session, not to a
callback returning synchronously.

## WHY
`better-sqlite3`'s `Database.transaction(fn)` requires `fn` to be
**synchronous** — the BEGIN/COMMIT boundary is tied to the callback
*returning*, not to a Promise resolving. If `fn` is `async` (or calls
`async`-wrapped store methods without awaiting, or awaits them from inside
a sync callback that can't itself be async), COMMIT can fire before the
awaited work — and any branching on its result — actually completes. This
produces no immediate error; it silently breaks the atomicity guarantee the
transaction exists for. It's especially easy to hit by accident because
every store method in a codebase's own convention is typically `async`
(matching the Postgres path, where async is required), so calling them from
inside a "just needs to be atomic" sqlite transaction *looks* correct and
type-checks fine — `Promise<T>` unused inside a sync function is not a type
error, just a silent bug.

Sharing one function between the sync-helper and the async-wrapped interface
method (rather than duplicating the SQL) keeps a single source of truth, so
the two paths can't drift.

## EXAMPLE
```ts
// game-record-store.ts
export function insertGameRecordSync(db: Database.Database, record: GameRecordInsert): boolean {
  const info = db.prepare(`INSERT INTO game_records (...) VALUES (...) ON CONFLICT(id) DO NOTHING`).run(...);
  return info.changes > 0;
}

export function makeSqliteGameStore(db: Database.Database): GameRecordStore {
  return {
    async insertGameRecord(record) {
      return insertGameRecordSync(db, record); // thin async wrap, same SQL
    },
    // ...
  };
}
```

```ts
// elo-engine.ts -- the multi-table transactional writer
export function recordGameResultSqlite(db: Database.Database, ...): RecordedGame {
  const run = db.transaction((): RecordedGame => {
    const inserted = insertGameRecordSync(db, gameRecord);   // sync call, safe inside db.transaction
    // ... more sync calls across multiple tables/stores ...
    return result;
  });
  return run(); // atomic: all sync work completes before this returns
}

// Postgres sibling: pool.connect() + BEGIN/COMMIT, async all the way through
async function recordGameResultPostgres(...): Promise<RecordedGame> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gameStore = makePostgresGameStore(client); // same factory, bound to the transaction client
    await gameStore.insertGameRecord(gameRecord);     // awaited normally -- Postgres has no sync-callback constraint
    await client.query("COMMIT");
  } finally { client.release(); }
}
```

Also useful for the Postgres side: type each store's postgres factory to
accept a minimal `{ query(text, params?): Promise<{rows, rowCount}> }`
interface rather than the concrete `pg.Pool` type, so the SAME factory can be
bound to either the pool (plain singleton reads) or a `pool.connect()`
transaction client (multi-table atomic writes) without a type mismatch.

## CHECK
How to verify if a repo already follows this:
- [ ] Search for `.transaction(` (better-sqlite3) calls; confirm the callback
      contains no `await` and calls only synchronous functions.
- [ ] Any store method called from inside a `db.transaction()` callback is
      either a plain synchronous function, or a documented sync counterpart
      to an async-wrapped interface method -- not the async method itself.
- [ ] Postgres factories accept a minimal query-capable interface, not the
      concrete `Pool` type, if they're ever bound to a transaction client.

## IMPLEMENT
1. When a store's sqlite factory already wraps synchronous better-sqlite3
   calls in `async` interface methods (matching the Postgres shape), extract
   the body into a plain exported `xSync(db, ...)` function.
2. Have the `async` interface method call the sync function and return its
   result (no behavior change for existing single-table callers).
3. In the transaction-composing code, call the sync functions directly
   inside `db.transaction(() => {...})()`, never the async-wrapped methods.
4. Give Postgres factories a minimal custom query interface (not the
   concrete `Pool` type) so the same factory works bound to a pool OR a
   transaction client.

## NOTES
Auto-discovered by practice-scout from tcg, Commander Companion P1 (game
recording + ELO engine transaction, version bump to 3.149.0.0). The bug this
prevents is silent, not a crash -- it's worth the extra export even when a
transaction "looks simple," because the failure mode (partial writes on a
crash, or a branch decision made on stale data) only shows up under timing
conditions a quick manual test won't hit.
