---
concern: linting-formatting
tech: [node, typescript, ci]
priority: recommended
source-repo: vigilis
applies-to: [any]
---
# Ratchet Quality Limits with a Grandfather Baseline

## PATTERN
When retrofitting a quality limit (file size, lint rule, bundle size, type coverage) onto an existing codebase that already violates it, do not choose between "fix everything first" and "rule nobody enforces." Snapshot every current violator into a committed baseline file at its current measured value, then add a check script with ratchet semantics:

- A file NOT in the baseline that violates the limit fails the check.
- A baselined file that grows past its recorded value fails the check.
- A baselined file may shrink; the check warns to lower (or remove) its entry.
- Stale baseline entries (deleted files) produce a cleanup warning.
- The script header explicitly forbids adding entries to silence a failure; the only sanctioned regeneration is after a deliberate limit change.

New debt stops immediately at zero refactor cost; old debt shrinks opportunistically under a companion rule: "if you make a non-trivial change to a baselined file, pay down its entry as part of the change."

## WHY
A limit the codebase already violates hundreds of times is not a rule, it is noise that trains contributors (and AI sessions) to ignore the rest of the rulebook. A big-bang cleanup is high-risk and never prioritized. The ratchet decouples enforcement (immediate, free) from cleanup (incremental, opportunistic), and the baseline file doubles as a visible, reviewable debt register that only ever shrinks.

## EXAMPLE
From vigilis: `scripts/check-file-size.cjs` + `scripts/file-size-baseline.json`, wired as `pnpm check:file-size`. Limits: components 300 lines, source files 600, tests 1,000; vendored `src/components/ui/` excluded. 65 files grandfathered at introduction; 62 after the first paydown pass.

```js
if (f in baseline) {
  if (n > baseline[f]) fail(`grew from ${baseline[f]} to ${n} lines; split it instead of growing it`);
  else if (n <= limit) warn(`now under limit; remove its baseline entry`);
  else if (n < baseline[f]) warn(`shrank; lower its baseline entry to ${n}`);
} else if (n > limit) {
  fail(`${n} lines exceeds the ${limit}-line limit; split it (do NOT add it to the baseline)`);
}
```

Set numeric limits at the measured p95 of the existing healthy code (vigilis: p95 was 336 lines, limit set to 300/600), not at an aspirational number; the gap between rule and reality is what killed the previous rule.

## CHECK
How to verify if a repo already follows this:
- [ ] Quality limits in the docs match what a measurement of the codebase shows is achievable (no rule violated en masse)
- [ ] A committed baseline file exists for any limit the codebase predates
- [ ] A check script fails on new violations and on baseline growth, and is wired into package.json scripts (and CI if present)
- [ ] The script's header forbids baseline additions as a fix

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Measure the real distribution (p50/p90/p95/max) of the metric across the codebase; set the limit near the p95 of healthy code.
2. Write the check script with the ratchet semantics above and a `--write-baseline` regeneration mode; gotcha: if it walks `git ls-files`, guard file reads against ENOENT (index-tracked files can be absent on disk).
3. Generate the baseline, commit script + baseline together, and update the repo's coding standards to cite the enforced limits and the "pay down on non-trivial change" rule.
4. Add the check to CI alongside lint/type-check/test.
5. Schedule deliberate refactors only for the worst tail (vigilis: 4 files over 1,000 lines); leave the rest to the ratchet.

## NOTES
Companion gotchas in LL-G: `kb/nodejs/git-ls-files-missing-on-disk.md` (the ENOENT guard) and `kb/typescript/split-dispatcher-multiplies-any.md` (a cost to budget when the paydown splits dispatcher files). Plan template: vigilis `tasks/file-size-ratchet-and-claude-md-diet.md`.
