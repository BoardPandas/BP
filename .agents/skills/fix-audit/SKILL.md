---
name: fix-audit
description: "Apply all failing practices from the most recent BP audit to the current repo"
---

> Generated from `.claude/skills/fix-audit/SKILL.md` by `scripts/sync-codex.mjs`. Edit the source, then run `npm run sync:codex`. Claude Code tool and command names below map to Codex and Antigravity as described in `AGENTS.md` under "Codex & Antigravity runtimes".

You are fixing all failing best practices identified by a previous BP audit.

## Step 1: Find the audit checklist

Look for `.claude/bp-audit.md` in the current working directory. If not found, check `C:\Github\BP\audits\` for a report matching the current repo name.

If no audit exists, tell the user: "No audit found. Run `/audit-repo` first." and stop.

## Step 2: Parse failing practices

Read the checklist and extract all unchecked items (lines starting with `- [ ]`). Each line contains a practice slug like `safety/read-only-first-rule`.

Group them by priority: FOUNDATIONAL first, then RECOMMENDED, then OPTIONAL.

## Step 3: Confirm scope with user

Present the list of practices to apply:

```
Found N failing practices from audit dated YYYY-MM-DD:

FOUNDATIONAL (will fix these first):
  1. safety/read-only-first-rule -- Add RULE 0 section to CLAUDE.md
  2. ...

RECOMMENDED:
  3. versioning/major-minor-patch-build -- Add 4-segment version and commit rule
  4. ...

Apply all? Or specify which ones (e.g., "1,2,4" or "foundational only"):
```

Wait for user confirmation before proceeding.

## Step 4: Apply each practice

For each approved practice, in priority order:

1. Read the practice file at `C:\Github\BP\practices\<concern>\<slug>.md`
2. Run the CHECK steps to verify it's still failing (skip if already fixed)
3. Follow the IMPLEMENT steps to apply the practice
4. Re-run CHECK steps to verify it now passes
5. Mark the item as done in `.claude/bp-audit.md` (change `- [ ]` to `- [x]`)

Between practices, show a brief status update:
```
[3/7] Applied versioning/major-minor-patch-build -- CHECK: 3/3 passing
```

## Step 5: Handle failures

If a practice cannot be fully applied (e.g., requires manual steps, external setup, or user decisions):
- Mark it with `- [~]` in the checklist (partially applied)
- Add a note: `(partial: <what remains>)`
- Continue to the next practice

## Step 6: Final report

After all practices are processed, output:

```
Fix-audit complete for <repo-name>:
  Applied: N practices
  Partial: N practices (need manual follow-up)
  Skipped: N practices (already passing)

  Previous score: Y/X (old%)
  Estimated new score: Y'/X (new%)

  Manual follow-up needed:
  - <practice>: <what remains>
```

Remind the user to review changes and commit when satisfied.
