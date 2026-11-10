# BP: Best Practices Knowledge Base

This repo is a machine-readable knowledge base of proven coding patterns and best practices. It is the complement to LL-G (Lessons Learned & Gotchas): where LL-G tracks what NOT to do, BP tracks what TO do.

## How to Use This KB (RULE 3 Protocol)

**Before starting new work or onboarding a repo:**
1. Read `llms.txt` in this repo root -- it lists all concerns and links to their indexes
2. Load the `llms.txt` for each concern relevant to your current task
3. Load individual entry files marked FOUNDATIONAL, or any entry whose title matches the specific task

Do not load every entry. Use the two-level index to load only what is relevant.

## Entry File Format

Each entry file uses this structure:

```
---
concern: <concern-category>
tech: [tech1, tech2]
priority: foundational|recommended|optional
applies-to: [tech1, tech2]
---
# Entry Title

## PATTERN
What the proven pattern looks like and how it works.

## WHY
Why this is better than alternatives. What problems it prevents.

## EXAMPLE
Code or config from the source repo (with file paths).

## CHECK
How to verify if a repo already follows this:
- [ ] Check condition 1
- [ ] Check condition 2

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Step one
2. Step two

## NOTES
Edge cases, caveats, related practices.
```

`source-repo: <repo-name>` is optional. Omit private repository names and source evidence because this repository is public. Older entries may still carry public source metadata.

## Priority Legend

- **FOUNDATIONAL** -- universal patterns that every repo should follow. Always load these.
- **RECOMMENDED** -- strong patterns for repos with matching tech tags. Load when relevant.
- **OPTIONAL** -- nice-to-have patterns. Skip unless explicitly asked.

## Adding a New Practice

Run `/add-practice` from any repo session. The skill collects the details and proposes the entry through authenticated `gh`, after privacy and duplicate review, and writes the entry file, the concern `llms.txt` and the master `llms.txt` entry count as one commit.

Use the skill for both existing and new categories. Publish the entry and both indexes as one atomic GitHub commit. A new category requires:
1. Create `practices/<concern>/<slug>.md` using the entry format above
2. Create `practices/<concern>/llms.txt` with the entry's bullet under `## Entries`
3. Add the concern's line to the master `llms.txt`, with a count of 1 entry

## Skills

| Skill | Purpose |
|-------|---------|
| `/add-practice` | Manually add a new best practice entry |
| `/audit-repo` | Audit a repo against applicable practices, save checklist to target repo |
| `/apply-practice <slug>` | Apply a single practice to a target repo |
| `/fix-audit` | Apply all failing practices from the most recent audit |
| `/review-practices` | Review all entries for quality/conflicts, search web for new practices |

## Practice Scout (Auto-Discovery)

The practice-scout agent (`.claude/agents/practice-scout.md`, Haiku) can be launched by a personal hook or instruction. It reads recent commits or the staged diff, searches BP on GitHub for existing coverage, and uses the add-practice workflow for at most one evidenced, reusable practice. Publishing requires session authorization, privacy review, one atomic GitHub commit and exact-commit CI verification. Most runs produce nothing.

Scout entries end NOTES with "Auto-discovered by practice-scout." Private source evidence stays out of the public entry and commit message.

## KB Location

This repo lives at `C:\Github\BP`. All paths in `llms.txt` and per-concern indexes are relative to the repo root.
