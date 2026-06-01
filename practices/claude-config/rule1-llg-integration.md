---
concern: claude-config
tech: [claude-code]
priority: foundational
source-repo: tech-assistant
applies-to: [all]
---
# RULE 1: LL-G Integration Before Scripting

## PATTERN
Every repo's CLAUDE.md includes a numbered RULE 1 that mandates checking the LL-G (Lessons Learned & Gotchas) knowledge base before writing any code. The rule specifies exact steps: fetch the master index, load relevant tech sub-indexes, and read all HIGH-severity entries.

## WHY
Without this rule, Claude Code repeats known failure patterns session after session. LL-G captures hard-won debugging knowledge -- silent failures, API quirks, framework gotchas -- that would otherwise be lost between conversations. RULE 1 ensures this knowledge is consulted every time.

## EXAMPLE
From tech-assistant (`CLAUDE.md`):
```markdown
## RULE 1 -- Check LL-G Before Scripting (MANDATORY)

**At the start of any session involving scripting, API calls, or
automation -- before writing a single line -- fetch the LL-G index
and load relevant entries.**

Step 1: Fetch https://raw.githubusercontent.com/BoardPandas/LL-G/main/llms.txt
Step 2: For each technology you will use, fetch its sub-index
Step 3: Read ALL HIGH-severity entries for those technologies
Step 4: Read any MEDIUM entry whose title matches your specific task

Technologies currently in LL-G: PowerShell, Graph API, NinjaOne,
Teams/SharePoint, Next.js, Tailwind CSS, TypeScript, Godot/GDScript,
Better Auth, Bash, cmd.exe.
```

Reinforced with a path-scoped rule in `.claude/rules/llg-check.md` that triggers when editing code files.

## CHECK
How to verify if a repo already follows this:
- [ ] CLAUDE.md contains a RULE 1 section referencing LL-G
- [ ] The rule includes the 4-step fetch protocol
- [ ] The rule lists currently relevant technologies
- [ ] (Bonus) A `.claude/rules/llg-check.md` path-scoped rule exists for enforcement

## IMPLEMENT
1. Add the RULE 1 block to the repo's CLAUDE.md (copy from example above)
2. Update the technology list to match technologies used in this repo
3. Add the "Contributing back" section requiring plans to end with Lessons Learned
4. Optionally create `.claude/rules/llg-check.md` for path-scoped enforcement

## NOTES
- RULE 1 is present in: tech-assistant, 60k-mono, MCP, Janki, claude-code-bootstrap, and most active repos
- The "Contributing back" clause is equally important -- it keeps LL-G growing
- Plans MUST end with a "Lessons Learned / Gotchas" section that routes discoveries to LL-G
