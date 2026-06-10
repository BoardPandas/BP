---
concern: claude-config
tech: [claude-code, planning, security-remediation]
priority: recommended
source-repo: supportforge-platform
applies-to: [any-repo-using-ai-coding-sessions]
---
# Phase-Split Remediation Plans Sized to Context Budget

## PATTERN
When a review produces a large backlog (security findings plus refactors plus housekeeping), write ONE plan document that many independent AI coding sessions execute, structured so each session can act cold:

1. Status line at the very top, updated by each implementing session (which items are done, what was deferred and why).
2. Phases sized to fit one session under roughly 50 percent context usage, ordered by risk: security P0s ship first and alone.
3. Every finding carries file:line evidence VERIFIED by reading the code (not just an agent's claim), the problem excerpt, and a fail-closed fix prescription, so the implementing session does not re-derive the analysis.
4. Tests-first instruction per fix: write the regression test, see it fail, then fix.
5. Operational gotchas pre-seeded in a Lessons Learned section (manual migration apply, secrets-sync quirks, things that bit previous sessions), with an instruction to route generalizable discoveries to the shared knowledge base.
6. Repo conventions restated inline (commit format, changelog/version rules) so the session does not need to rediscover them.

## WHY
A single mega-session degrades as context fills: late phases get sloppy exactly where care matters most. Splitting by phase keeps each session sharp and makes progress resumable and auditable; the status line turns the plan into the coordination point between sessions that share no memory. Verifying findings before writing the plan prevents sessions from "fixing" hallucinated issues. Pre-seeded gotchas stop each session from rediscovering the same deployment traps. This structure was validated in practice: phases 1 and 4 of the source plan shipped cleanly in separate sessions, and the deferred items were recorded in the status line instead of being silently dropped.

## EXAMPLE
From supportforge-platform, `tasks/remediation-2026-06-security-and-quality.md` (abridged skeleton):

```markdown
# Remediation Plan: Security Fixes + Code Quality + Housekeeping
**Status:** in-progress. Phases 1 and 4 complete (migration 326 applied to prod).
REMAINING: 3.1 StandardTable dedup, 3.3 component splits, 2.2.1 service extraction.
**Origin:** Full-repo review 2026-06-09. All P0 findings verified by reading the code.

## How to use this document
One phase per session; keep each under 50% context. Session A: Phase 1 (security, ship alone)...
Each session MUST first: check the LL-G knowledge base, read commit/changelog rules, write tests before fixes.

## Phase 1: Security fixes (P0, ship first)
### 1.1 Cross-tenant ticket leak via clientId === 'all'
**File:** src/routes/tickets.ts (verified excerpt of the flawed query)
**Fix:** (fail-closed prescription, explicit decisions called out)
**Tests:** (the regression matrix: wrong tenant, no tenant, admin, unauthenticated)
...
## Lessons Learned / Gotchas
- DB migrations are applied manually to prod via psql; say so loudly when adding one.
- Doppler config does not auto-sync to Northflank; runtime env update is a full replace.
```

## CHECK
How to verify if a repo already follows this:
- [ ] Multi-session work items live in a plan file with a top status line that sessions update
- [ ] Phases are explicitly sized to one session each, security first
- [ ] Findings include verified file:line evidence and a concrete fix prescription
- [ ] The plan ends with a Lessons Learned / Gotchas section, pre-seeded with known traps

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. After any large review, verify each load-bearing finding by reading the code before planning.
2. Write the plan into the repo's tasks/ (or equivalent) folder using the skeleton above.
3. Add a CLAUDE.md rule that plan files must end with Lessons Learned and that sessions update the status line.
4. Launch one session per phase, pointing it at the plan file as its only briefing.

## NOTES
Defer-and-record beats squeeze-and-finish: when a phase item turns out entangled (a "mechanical" dedup that touches build tooling), the right move is to mark it deferred in the status line with the reason, not to push through with degraded context.
