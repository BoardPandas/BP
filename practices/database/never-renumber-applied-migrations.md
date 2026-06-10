---
concern: database
tech: [postgres, sql, raw-sql-migrations]
priority: foundational
source-repo: supportforge-platform
applies-to: [any-repo-with-sequential-sql-migrations]
---
# Never Renumber Applied Migrations; Document Duplicates and Use a Next-Number Convention

## PATTERN
Once a migration has been applied to any shared environment (prod, staging, a teammate's DB), its filename and number are immutable historical facts. When you discover numbering mistakes (duplicate prefixes like two `100_*.sql`, gaps, an unnumbered stray file), do NOT clean them up by renaming. Instead:

1. Leave applied files exactly as they are.
2. Add a `migrations/README.md` documenting the known anomalies (which prefixes are duplicated, why, and in what order they were actually applied).
3. Adopt a strict forward convention: new migration number = highest existing prefix + 1, never reuse a number, give any unnumbered legacy file a number only if it has never been applied anywhere.
4. If a second, legacy migration folder exists (e.g. an old `src/database/migrations/` series alongside the canonical `database/migrations/`), verify nothing reads it, then archive it with a pointer README rather than merging numbering.

## WHY
Migration runners and humans both identify migrations by filename. Renaming an applied file desynchronizes every environment's applied-migrations record from the files on disk: runners either re-apply (data corruption, duplicate DDL errors) or skip new work, and debugging "what ran where" becomes archaeology. Duplicate prefixes look untidy but are harmless once documented; a rename is actively destructive. This matters double in repos where migrations are applied manually (psql -f) and the file list IS the history.

## EXAMPLE
From supportforge-platform, `database/migrations/` reached 80 files (004 through 325) with two `100_*`, two `133_*`, two `150_*`, and one unnumbered `add_enhanced_telemetry.sql`, all already applied to prod. Resolution: a README, not renames.

```markdown
# database/migrations/README.md
## Known numbering anomalies (applied history, do not rename)
- 100_add_sla_tables.sql and 100_persona_consent.sql: both applied, in this order.
- 133_*, 150_*: same situation, see git log for apply order.
- add_enhanced_telemetry.sql: applied 2026-05-02, treat as 287.5 in ordering.
## Convention going forward
- Next number = highest existing prefix + 1 (currently: next is 326).
- Numbers are never reused or renamed after a file lands on main.
- Prod apply is manual: psql "$DATABASE_URL" -f database/migrations/NNN_name.sql
```

## CHECK
How to verify if a repo already follows this:
- [ ] No git history of applied migration files being renamed
- [ ] A README (or header comment) documents any numbering anomalies
- [ ] A stated next-number convention exists
- [ ] Only one canonical migrations directory is live; legacy series are archived with a pointer

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. List migration files, sort by prefix, identify duplicates/gaps/unnumbered files.
2. Confirm from the migrations table or deploy logs which files have been applied where.
3. Write the README documenting anomalies and the forward convention.
4. Archive (do not merge) any legacy parallel migration series after grepping for readers.
5. If the team uses an AI coding agent, add the "never renumber applied migrations" line to the repo CLAUDE.md or rules so sessions do not helpfully tidy the numbers.

## NOTES
Timestamp-based naming (YYYYMMDDHHMM_) avoids the duplicate-prefix problem entirely for new projects, but switching an existing sequential series mid-stream creates the same rename hazard; keep whichever scheme is already applied.
