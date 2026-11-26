---
concern: testing
tech: [rust, sqlx, postgres, row-level-security]
priority: recommended
applies-to: [rust, sqlx, postgres]
---
# Test database code through two pools: a privileged one to set up, the restricted runtime role to assert

## PATTERN
Use `#[sqlx::test(migrations = false)]` and build the production role layout inside each per-test database:

1. The privileged login (`DATABASE_URL`) is used only to create the roles if missing, hand the database to the schema-owner role, and revoke `PUBLIC` access.
2. The migrator runs on a connection logged in as the **schema-owner role**, exactly as it does in production, so object ownership, `SECURITY DEFINER` function owners and default grants come out the same.
3. Every assertion goes through a **second pool** logged in as the restricted **runtime role** (`NOSUPERUSER NOBYPASSRLS`). The privileged pool is exposed only for fixture surgery and is documented as never to be used for assertions.
4. The harness closes every pool at the end of the test so `#[sqlx::test]` can drop the database.

## WHY
Row-level security is inert for superusers and for table owners without `FORCE`. A test that runs as the default `#[sqlx::test]` login passes whether or not the policy exists, and the same goes for missing `GRANT`s and function ownership: the test proves nothing, and the bug shows up in production. Running the migrator as the owner and asserting as the runtime role makes a dropped policy, a missing grant or a wrong function owner a failing test.

## EXAMPLE
`tests/support.rs` (sketch; names are illustrative):

```rust
#[sqlx::test(migrations = false)]
async fn tenant_a_cannot_see_tenant_b(pool: PgPoolOptions, conn: PgConnectOptions) {
    support::run(pool, conn, |db| async move {
        // db.store() is connected as app_runtime; db.privileged() is for fixtures only.
        let fx = db.seed_two_tenants().await;
        let mut tx = db.app_tx(Some(fx.a.tenant)).await;
        let n: i64 = sqlx::query_scalar("SELECT count(*) FROM messages WHERE tenant_id = $1")
            .bind(fx.b.tenant).fetch_one(&mut *tx).await.unwrap();
        assert_eq!(n, 0);
    })
    .await;
}
```

Harness setup, in order:

```rust
let privileged = pool_options.connect_with(connect_options.clone()).await?;
ensure_roles(&privileged).await;            // CREATE ROLE ... NOSUPERUSER NOBYPASSRLS, under an advisory lock
sqlx::query("DO $$ BEGIN
    EXECUTE format('ALTER DATABASE %I OWNER TO app_owner', current_database());
    EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_runtime', current_database());
  END $$").execute(&privileged).await?;

let mut owner = PgConnection::connect_with(&conn.clone().username("app_owner").password(&owner_pw)).await?;
MIGRATOR.run(&mut owner).await?;            // as the owner, like production
owner.close().await?;

let app = PgPoolOptions::new().connect_with(conn.username("app_runtime").password(&app_pw)).await?;
```

Details worth copying:
- Create the roles with `IF NOT EXISTS` and never `ALTER` them: roles are cluster-wide, so parallel test processes share them. Serialise creation with `pg_advisory_xact_lock`.
- Pass role passwords as transaction-local settings (`set_config(..., true)` then `current_setting` inside `format('%L')`), never in SQL text.
- Cap concurrent harnessed tests per machine (a file-lock slot pool) so a wide nextest run does not exhaust `max_connections`.
- Give tests a raw `app_tx(tenant)` that sets the tenant setting and bypasses the product API, for probes that must attack the policy directly.

## CHECK
- [ ] Database tests create the per-test database with a privileged login but never assert through it.
- [ ] The migrator runs as a non-superuser schema-owner role, the same role production uses.
- [ ] Assertions use a pool as a role that is `NOSUPERUSER NOBYPASSRLS`.
- [ ] Deleting a policy, a `GRANT` or `FORCE ROW LEVEL SECURITY` from a migration makes at least one test fail (try it once).

## IMPLEMENT
1. Add a test-support module behind a `test-support` feature, a dev-dependency only.
2. Write `ensure_roles` (owner and runtime, both non-superuser, `NOBYPASSRLS`) and the database-ownership and grants statement; mirror your production bootstrap SQL.
3. Run the migrator on a connection as the owner; build the runtime pool as the restricted role.
4. Expose `store()` (runtime pool) as the default handle, and `privileged()` with a doc comment saying it bypasses RLS and is for fixtures only.
5. Provide a `run` wrapper that closes all pools, and supply the role passwords from the environment, failing with a message that names the missing variable.
6. Add a first test per tenant table asserting that tenant A sees nothing of tenant B, and that with no tenant set every table is empty.

## NOTES
Use `migrations = false` so `#[sqlx::test]` does not run the migrator as the privileged login. Related: `access-matrix-diff-for-permission-refactors.md`.
