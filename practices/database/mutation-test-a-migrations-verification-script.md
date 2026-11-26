---
concern: database
tech: [postgres, sql, migrations, row-level-security]
priority: recommended
applies-to: [postgres, sql-migrations]
---
# Mutation-test a migration's verification script with deliberate defects before the migration becomes immutable

## PATTERN
A migration usually ships with a verification script (assertions about ownership, `FORCE ROW LEVEL SECURITY`, policies, grants, indexes, function definitions). Before the migration is applied anywhere it becomes immutable, prove the script can fail:

1. Make a copy of the migration for each defect, changing exactly one thing: drop a `FORCE`, remove a `NULLIF`, widen a `GRANT`, drop an index, remove `REVOKE ... FROM PUBLIC`, drop a `SET search_path`.
2. For each copy, create a scratch database, apply the mutated migration, run the verification script, and require a **non-zero exit** naming the broken assertion.
3. Run the same script against the unmodified migration and require a clean pass.
4. If a mutant survives (the script still passes), the script has a hole: add the missing assertion, then repeat.

## WHY
Once a migration is applied in a shared environment it is history, and a defect in it is fixed forward. A verification script that has only ever passed has never shown it can fail: a check written as `IF NOT EXISTS (...)` against the wrong catalog column, or one that tests the grant but not the revoke, passes forever on a broken schema. Mutation testing costs a few scratch databases and turns "the checks pass" into "the checks pass and would have failed on each defect I care about". It is cheap exactly once: before first apply.

## EXAMPLE
Each mutation is a one-line, mechanical edit of a copy; the table lists the defect and the assertion that must catch it.

| Mutation (on a copy of `0001_foundation.up.sql`) | Check that must fail |
|---|---|
| `ALTER TABLE t FORCE ROW LEVEL SECURITY` removed | `relforcerowsecurity` check on every tenant table |
| `NULLIF(current_setting('app.tenant_id', true), '')::uuid` becomes a bare cast | pooled-connection probe: no tenant set returns zero rows instead of raising |
| `GRANT SELECT, INSERT, UPDATE, DELETE` widened to include `TRUNCATE` | exact-privilege comparison of the runtime role's grants |
| a partial unique index dropped | index-presence and duplicate-insert checks |
| `REVOKE ALL ON FUNCTION f FROM PUBLIC` removed | `has_function_privilege('public', ...)` check |

Driver (generic sketch, run on a scratch cluster only):

```bash
mutate() {  # $1 name, $2 sed expression
  db="mut_$1"
  createdb "$db"
  sed -E "$2" migrations/0001_foundation.up.sql > "$SCRATCH/$1.sql"
  psql -v ON_ERROR_STOP=1 -U schema_owner -d "$db" -f "$SCRATCH/$1.sql" >/dev/null
  if psql -v ON_ERROR_STOP=1 -U app_runtime -d "$db" -f tests/sql/0001_checks.sql >/dev/null 2>"$SCRATCH/$1.err"; then
    echo "SURVIVED $1 -- the verification script has a hole"; status=1
  else
    echo "killed   $1: $(tail -1 "$SCRATCH/$1.err")"
  fi
  dropdb "$db"
}
mutate no-force   's/^ALTER TABLE .* FORCE ROW LEVEL SECURITY;//'
mutate no-nullif  "s/NULLIF\(current_setting\('app.tenant_id', true\), ''\)/current_setting('app.tenant_id', true)/"
```

Verification scripts written to raise on failure (`RAISE EXCEPTION` with `ON_ERROR_STOP`) make the pass/fail signal the process exit code, which is what the driver needs.

## CHECK
- [ ] The migration has a verification script that exits non-zero on any failed assertion.
- [ ] At least one mutant per security-relevant statement (FORCE, policy, grant, revoke, ownership, index) has been run and was killed.
- [ ] No mutant survives; each survivor led to a new assertion.
- [ ] The mutation run happened before the migration was applied to any shared database.

## IMPLEMENT
1. List the statements in the migration whose absence would be a security or integrity defect.
2. Write the one-line mutation for each and the assertion expected to catch it.
3. Script the loop above against a throwaway database; keep the script with the verification SQL so it can be re-run.
4. Fix survivors by strengthening the verification script, not by weakening the mutant.
5. Record the killed/survived list in the phase or change report, then apply the unmodified migration.

## NOTES
A mutation only counts if the mutated migration still applies cleanly; a mutant that fails to apply proves nothing, so fix the edit. For later migrations, keep the same driver and add mutants for what the new migration changes. Related: `never-renumber-applied-migrations.md`.
