---
name: audit-repo
description: "Audit a repo against applicable best practices from the BP knowledge base"
---

> Generated from `.claude/skills/audit-repo/SKILL.md` by `scripts/sync-codex.mjs`. Edit the source, then run `npm run sync:codex`. Claude Code tool and command names below map to Codex and Antigravity as described in `AGENTS.md` under "Codex & Antigravity runtimes".

You are auditing a repository against the BP best practices knowledge base at `C:\Github\BP`.

## Step 1: Identify the target repo

Ask the user which repo to audit if not already specified. The repo should be in `C:\Github\<repo-name>`.

## Step 2: Load repo inventory

Read `C:\Github\BP\.claude\references\repo-inventory.md` to find the target repo's tags (tech stack, frameworks, characteristics).

## Step 3: Determine applicable practices

1. Read the master `C:\Github\BP\llms.txt` to get all concern categories
2. For each concern, read its `llms.txt` index
3. For each practice entry, check if its `applies-to` tags match the repo's tags
4. All FOUNDATIONAL entries apply regardless of tags

## Step 4: Run CHECK steps

For each applicable practice:
1. Read the practice entry file
2. Execute each item in the CHECK section against the target repo
3. Mark each check as PASS or FAIL
4. Record findings

## Step 5: Generate reports

Write TWO copies of the report:

### 5a. Full report in BP (ephemeral, gitignored)
Write to `C:\Github\BP\audits\<repo-name>.md`:

```markdown
# BP Audit: <repo-name>
Date: <YYYY-MM-DD>

## Summary
- Applicable practices: X
- Passing: Y
- Failing: Z
- Score: Y/X (percentage%)

## FOUNDATIONAL (must-fix)
### [Practice Title](../practices/<concern>/<slug>.md)
- Status: PASS/FAIL
- Details: What was found
- Missing: What needs to be done (if FAIL)

## RECOMMENDED
### [Practice Title](../practices/<concern>/<slug>.md)
- Status: PASS/FAIL
- Details: What was found

## OPTIONAL
### [Practice Title](../practices/<concern>/<slug>.md)
- Status: PASS/FAIL
- Details: What was found
```

### 5b. Actionable checklist in the target repo
Write to `C:\Github\<repo-name>\.claude\bp-audit.md`:

```markdown
# BP Audit Results
Date: <YYYY-MM-DD>
Score: Y/X (percentage%)

## Failing Practices (fix with `/apply-practice <slug>`)

### FOUNDATIONAL
- [ ] `<concern>/<slug>` -- <one-line description of what's missing>
- [ ] `<concern>/<slug>` -- <one-line description of what's missing>

### RECOMMENDED
- [ ] `<concern>/<slug>` -- <one-line description of what's missing>

### OPTIONAL
- [ ] `<concern>/<slug>` -- <one-line description of what's missing>

## Passing Practices (no action needed)
- [x] `<concern>/<slug>` -- <title>
- [x] `<concern>/<slug>` -- <title>
```

This file lives in the target repo so future sessions can see what was flagged.
The slugs are directly usable with `/apply-practice` or `/fix-audit`.

If the target repo does not have a `.claude/` directory, create it.

## Step 6: Present results

Output the summary to the user:
- Total score
- List of failing FOUNDATIONAL practices (these should be fixed first)
- List of failing RECOMMENDED practices
- Path to the checklist file in the target repo
- Remind user: "Run `/fix-audit` in the target repo to apply all failing practices, or `/apply-practice <slug>` for individual ones."
