---
concern: claude-config
tech: [claude-code]
priority: foundational
source-repo: vigilis
applies-to: [any]
---
# Byte-Budget CLAUDE.md and Flow Detail Downward

## PATTERN
Treat CLAUDE.md as procedural control loaded into every session, and govern its size in bytes, not lines:

1. **Byte budget.** State the budget as "keep under N KB (`wc -c`)", around 10 KB for a large project. Line budgets are silently gamed: appended content arrives as ever-longer single lines and the file stays "compliant" while its token cost compounds (observed: 179 lines but 37.5 KB, with single 3,345-character lines).
2. **Detail flows downward.** Each module/feature gets a 3-to-4-line entry in CLAUDE.md: what it is, where it lives, the conventions that prevent breakage (guard names, deprecation warnings, canonical schema paths), and a pointer to `docs/features/X.md` where the full design lives. The doc-sync ritual after completing work writes full detail into the feature doc and only the pointer upward; never a feature-summary paragraph into CLAUDE.md.
3. **Calibrate stated limits to measured reality.** Any numeric rule in CLAUDE.md (component size, function length) must be one the codebase substantially meets, set near the p95 of healthy code and ideally machine-enforced. A rule violated hundreds of times erodes the authority of every other rule in the file.

## WHY
CLAUDE.md is a per-session context tax: a 37.5 KB file costs roughly 10k tokens in every conversation, mostly duplicating feature docs that are only needed when actually working on that feature. Pointer entries preserve routing ("this module exists, here are its invariants, read the doc") at a fraction of the cost. And because the file is the project's rulebook, its own credibility is load-bearing: gamed budgets and mass-violated limits teach every future session that the rules are decorative.

## EXAMPLE
From vigilis: CLAUDE.md cut from 37,570 to 10,234 bytes with zero information loss, in two steps: first a parity-audit commit moved every CLAUDE.md-only fact into `docs/features/*.md`; then the rewrite collapsed each module entry to the pointer template. Module entry shape:

```markdown
- **Commissions**: partner workspace `src/app/(commissions)/commissions/[partnerId]/*`;
  guards `withCommissionsReadonly`/`withCommissionsMember` (no grant bypass; do NOT gate
  on `partners.commissionsEnabled`, deprecated). Pipeline in `worker/commission-processor.ts`;
  pure cores in `src/lib/commissions/`. -> `docs/features/COMMISSIONS.md`
```

Doc-sync rule addition (`.claude/rules/doc-sync.md`): "Full feature detail goes DOWNWARD into docs/features/X.md ... Never paste a feature summary paragraph into CLAUDE.md. After any CLAUDE.md edit, verify `wc -c CLAUDE.md` stays under 10,240 bytes."

## CHECK
How to verify if a repo already follows this:
- [ ] CLAUDE.md budget is stated in bytes/KB, not lines, and `wc -c` passes
- [ ] No single line in CLAUDE.md exceeds a few hundred characters
- [ ] Module/feature entries are pointers (3-to-4 lines + doc link), with full designs in per-feature docs
- [ ] The doc-sync rule directs detail downward and includes the byte-budget check
- [ ] Numeric limits stated in CLAUDE.md are substantially met by the codebase (spot-check the worst offenders)

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Measure: `wc -c CLAUDE.md` and list lines over 500 characters; measure any stated numeric limits against the codebase.
2. Parity-audit FIRST: for each oversized entry, move every fact that exists only in CLAUDE.md into the matching feature doc (create it if missing), in its own commit, so the trim is provably lossless.
3. Rewrite entries to the pointer template; delete changelog narration (dates, "replaced X" history); git holds history.
4. Change the budget rule to bytes; add the `wc -c` check to the doc-sync ritual.
5. Reset gamed numeric limits to measured-p95 values, paired with ratchet enforcement (see linting-formatting: "Ratchet Quality Limits with a Grandfather Baseline").

## NOTES
Related LL-G gotcha: `kb/claude-code/line-budgets-gamed-by-long-lines.md`. Complements the existing "Hierarchical CLAUDE.md Structure" practice: hierarchy spreads instructions across files; this practice governs the weight of the always-loaded root.
