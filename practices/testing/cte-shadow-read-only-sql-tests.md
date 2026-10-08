---
concern: testing
tech: [postgres, jest, typescript, node-postgres]
priority: recommended
source-repo: supportforge-platform
applies-to: [postgres, jest, typescript, node-postgres]
---
# Test SELECT-only SQL read-only against a real database by shadowing tables with CTEs

## PATTERN
For code that only reads, run its real SQL against a real Postgres server over fixture rows, with no DDL and no writes:

1. Define one CTE per table the code reads, **named after the table**: `WITH end_users (cols...) AS (VALUES ...), clients (...) AS (...)`. A CTE shadows the table of the same name for the whole statement, subqueries included.
2. Mock the code's `db.query` so that every statement is passed through a `shadow(sql)` function. It prepends the CTE block and runs the result on one `pg.Client`.
3. Open that client with `BEGIN READ ONLY`, and `ROLLBACK` in `afterAll`.
4. `shadow` fails closed:
   - It throws if the statement already starts with `WITH`.
   - It throws if any `FROM`/`JOIN <ident>` names a table it does not shadow, so no real row is ever read.
   - The regex must skip `IS DISTINCT FROM`, which a naive `FROM <ident>` match reads as a table.
5. Copy fixture column types from the production `information_schema.columns`, using explicit casts on the first `VALUES` row. An empty table is `SELECT NULL::type, ... WHERE false`.
6. Mutation-test: delete the clause under test and confirm the targeted cases fail while the positive cases still pass. Then restore it.

## WHY
- **Mocks prove nothing about semantics.** A mocked `db.query` can only assert SQL text or replay canned rows. NULL handling, LEFT JOIN fall-through, type resolution and `IS DISTINCT FROM` are only proven by a real server.
- **Conventional integration suites write.** They `CREATE SCHEMA`/`CREATE TABLE` and insert rows, so they need a disposable database. Without a local Postgres server, they first run in CI after you push.
- **Shadowing writes nothing.** The suite can safely be run against any reachable database, including production, before pushing.
- **It still runs in CI.** The same suite runs unchanged in the normal CI integration job.
- **The guard keeps it safe.** Without the unshadowed-table guard, a newly added query would silently read real rows.

## EXAMPLE
`supportforge-platform/src/__tests__/integration/portal-eligibility-soft-delete.integration.test.ts` (v3.315.2.0). It runs the customer-portal request gate, Better Auth account/session hooks, magic-link sender and an import verifier over shadowed `end_users`, `clients`, `blacklist` and `portal_users`:

```ts
const FIXTURES = `WITH
  clients (id, msp_id, lifecycle_stage, portal_enabled) AS (VALUES
    ('org_a'::varchar, 'msp_a'::varchar, 'customer'::varchar, true)),
  end_users (id, email, status, portal_enabled, deleted_at) AS (VALUES
    ('eu_live'::text, 'live@acme.test'::varchar, 'active'::varchar, true, NULL::timestamptz),
    ('eu_merged', 'merged@acme.test', 'active', true, now() - interval '1 day')),
  blacklist (entry_type, is_active, pattern) AS (
    SELECT NULL::varchar, NULL::boolean, NULL::varchar WHERE false)
`;
const SHADOWED = new Set(['clients', 'end_users', 'blacklist']);

function shadow(sql: string): string {
  if (/^\s*WITH\b/i.test(sql)) throw new Error(`statement already has a WITH clause: ${sql}`);
  // `IS DISTINCT FROM false` is in the predicate and is not a table read.
  for (const [, table] of sql.matchAll(/(?<!\bDISTINCT\s+)\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)) {
    if (!SHADOWED.has(table!.toLowerCase())) throw new Error(`reads unshadowed table ${table}: ${sql}`);
  }
  return FIXTURES + sql;
}

beforeAll(async () => {
  client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  await client.query('BEGIN READ ONLY');
});
beforeEach(() => (db.query as jest.Mock).mockImplementation((sql, v) => client.query(shadow(sql), v)));
```

In the source repo, the mutation check behaved as intended. With the soft-delete clause removed, the 7 refusal cases failed and the 5 live-contact cases passed.

## CHECK
How to verify if a repo already follows this:
- [ ] Tests of read-only SQL with non-trivial predicates (NULL, LEFT JOIN, COALESCE, soft delete) run against a real server, not only a mocked `query`.
- [ ] Any suite meant to be safe against a shared or production database opens `BEGIN READ ONLY` and creates no schema.
- [ ] The statement wrapper refuses unshadowed tables and pre-existing `WITH` clauses.
- [ ] The fixture types match the production column types.

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. List every table the code path reads, and query `information_schema.columns` for their types.
2. Write the CTE block, with typed first rows, and a `SHADOWED` set.
3. Add `shadow(sql)` with both guards, and route the module's mocked `db.query` through a single `pg.Client` in `BEGIN READ ONLY`.
4. Assert behaviour through the real exported functions, not copies of their SQL. Where a function swallows errors (a best-effort lookup), assert a side effect that proves its query ran.
5. Run the suite against a reachable database, then mutation-test the clause under test.

## NOTES
- **SELECT-only paths only.** Writes, `FOR UPDATE` and statements that already use `WITH` need a conventional schema-per-suite fixture.
- **Use one client, not a Pool.** Rotating connections would escape the READ ONLY transaction.
- **SSL.** Managed production endpoints usually need `sslmode=no-verify` (or a proper CA) on the test URL.
- **A first error in a transaction aborts every later statement.** Read the first failure, not the cascade.
