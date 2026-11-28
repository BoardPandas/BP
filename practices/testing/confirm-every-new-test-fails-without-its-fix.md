---
concern: testing
tech: [testing, git, regression-tests, sql]
priority: recommended
applies-to: [all-repos, bug-fixes, security-fixes, regression-tests]
---
# Confirm every new test fails without its fix

## PATTERN
A test written alongside a fix is not finished until it has been seen to **fail**:

1. Write the fix and its test.
2. **Revert the fix only** (keep the test), run **only that test**, and require a failure whose message is about the behaviour being fixed.
3. **Restore the fix**, run the test again and require a pass.
4. If the test passes without the fix, it does not test the fix: repair the test before going on.

For checks written in SQL or as policy assertions (grants, row-level security, constraints), do the equivalent with a small script of deliberate schema defects: apply each defect to a scratch database and require the check to fail.

## WHY
A test that has only ever passed has proved nothing. Tests written after the fix pass on the first run, and that pass is indistinguishable from a test that asserts the wrong thing, targets the wrong code path, is skipped by a guard, or matches text that would be there anyway. Running it once against the unfixed code costs a minute and is the only evidence that the test can detect the defect. It matters most for security fixes, where a vacuous test becomes the documented proof that a hole is closed.

## EXAMPLE
Fix not yet committed (generic):

```bash
git stash push -- src/auth/throttle.rs            # 1. take the fix out, keep the new test
cargo nextest run -E 'test(valid_credential_after_exhausted_budget)'   # 2. only that test: must FAIL
git stash pop                                      # 3. put the fix back
cargo nextest run -E 'test(valid_credential_after_exhausted_budget)'   #    must PASS
```

Fix already committed:

```bash
git checkout HEAD~1 -- src/auth/throttle.rs       # the file as it was before the fix
npx vitest run src/auth/throttle.test.ts -t "valid credential after exhausted budget"   # must FAIL
git checkout HEAD -- src/auth/throttle.rs         # restore
```

Record the result where reviewers see it, for example one line per test in the change description: `fails without fix: yes (assertion: expected 200, got 429)`.

## CHECK
- [ ] Each test added with a fix has been run against the code without the fix and failed.
- [ ] The failure was the intended assertion, not a compile error, a missing fixture or a timeout.
- [ ] The fix was restored and the test passes.
- [ ] SQL and policy checks have been run against deliberate defects and failed on each.
- [ ] The change description or report states this for each new test.

## IMPLEMENT
1. Keep fix and test in separate files or hunks so the fix can be reverted alone.
2. After writing a test, run the revert, run-one-test, restore sequence above.
3. For SQL checks, keep a small script of one-line schema defects next to the checks and run it when they change.
4. Add a line to the review checklist: "new tests shown failing without the fix".

## NOTES
The SQL half is described in full in `practices/database/mutation-test-a-migrations-verification-script.md`. Read the failure message: a test that fails for an unrelated reason without the fix has not been validated either. Related gotcha: LL-G `kb/vitest/negative-text-assertion-vacuous-after-copy-change.md` describes a negative assertion that goes vacuous.
