---
concern: testing
tech: [vitest, jest, bash, ci, node]
priority: recommended
source-repo: vigilis
applies-to: [vitest, jest, playwright, pytest, go-test, ci]
---
# Reproduce load-dependent test flakes under forced CPU contention, and measure before/after at the same load

## PATTERN

When a test fails only in a full-suite run and passes in isolation, do not try to
reproduce it by re-running the suite. On a fast, idle machine the suite may never
generate the contention that triggers the failure, and you will conclude "cannot
reproduce" from a run that was never capable of reproducing it.

Instead, saturate the CPU deliberately: start roughly 2x core-count busy-loop
processes, run the suite, and kill them on exit. Then use the *same* harness at
the *same* hog count for both the baseline and the post-fix verification.

Three rules make this trustworthy:

1. **Trap-kill the spinners on `EXIT`**, so a failed or interrupted run cannot
   leave them burning cores in the background.
2. **Baseline first.** Prove the harness reproduces the failure *before* you
   change anything. A harness that never reproduces the bug cannot validate the
   fix.
3. **Compare like with like.** A green run at normal load after a fix proves
   nothing, because a green run at normal load was the *starting* condition.

## WHY

Load-dependent failures are the most expensive kind of flake, because the honest
reading of the evidence is wrong. A suite that reports 1-5 different failures per
run trains a team to re-run rather than read the output, which is exactly the
state in which a real regression gets waved through as "just the flaky one".

Without a way to force the failure you are left with two bad options: raise a
timeout until the symptom disappears, or declare it unreproducible. Both leave
the signal degraded.

Measured on the source repo, on an otherwise idle 32-core machine:

| Condition | Result |
|---|---|
| Full suite, normal load, before fix | green 6 / 6 runs |
| Full suite, 64 spinners, before fix | **failed on run 2 of 2** |
| Full suite, 64 spinners, after fix | green 5 / 5 runs |

The first row is why this practice exists. Six clean runs is enough evidence to
close an investigation, and it would have been the wrong call.

The stressed failure also pointed straight at the cause rather than just proving
existence: it landed on a case asserting over a pure string-building function
with no I/O and no clock — something that cannot fail an assertion — so the
`Test timed out in 5000ms` could only be import latency inside the test's budget.

## EXAMPLE

`scripts/stress-test.sh` (keep it out of the repo if you prefer; it is a
diagnostic, not a build step):

```bash
#!/usr/bin/env bash
# Amplify the CPU contention a full-suite run already creates, so a
# load-dependent flake reproduces on demand instead of once every N runs.
set -uo pipefail

N=${STRESS_HOGS:-$(( $(nproc) * 2 ))}
LOG=${1:-stress-run.log}

pids=()
for _ in $(seq "$N"); do
  bash -c 'while :; do :; done' &
  pids+=($!)
done
# Without this, a failed run leaves N cores pinned until the box is rebooted.
trap 'kill "${pids[@]}" 2>/dev/null' EXIT

npx vitest run > "$LOG" 2>&1
echo "EXIT=$?" >> "$LOG"
```

Baseline, then fix, then verify — same hog count both times:

```bash
# 1. Prove the harness reproduces it BEFORE changing anything.
for i in 1 2 3; do
  STRESS_HOGS=64 ./scripts/stress-test.sh "baseline-$i.log"
  grep -E "^ FAIL|Tests " "baseline-$i.log"
done

# 2. Apply the fix.

# 3. Verify at the same load. More runs than the baseline needed.
for i in 1 2 3 4 5; do
  STRESS_HOGS=64 ./scripts/stress-test.sh "fixed-$i.log"
  grep -E "^ FAIL|Tests " "fixed-$i.log"
done
```

Read the runner's own timing summary before theorising about the cause — it
usually names the bottleneck outright:

```
Duration 39.03s (transform 308.31s, setup 30.55s, import 919.47s, tests 35.62s)
```

Aggregate import time 26x the test time means module loading, not test logic, is
what contention starves.

## CHECK

How to verify if a repo already follows this:

- [ ] Is there a documented way to reproduce a flake under load (a script, a
      runbook section, or a CI job), rather than only "re-run it"?
- [ ] When a flaky test was last fixed, does the commit message or PR cite a
      before/after comparison at a stated load — not just "passes now"?
- [ ] Does any spinner/stress helper `trap ... EXIT` to clean up its own
      processes?
- [ ] Have recent flake fixes changed a timeout value without any evidence the
      failure was reproduced first? (That is the anti-pattern this replaces.)

## IMPLEMENT

Steps to adopt this in a repo that doesn't have it:

1. Write the harness above into `scripts/stress-test.sh` (or your scratch
   directory) and `chmod +x` it. Default the hog count to ~2x `nproc`.
2. Reproduce first. Run it 2-3 times against the *unmodified* tree and confirm
   the failure appears. If it does not, raise `STRESS_HOGS` or check whether the
   flake is order-dependent rather than load-dependent (see NOTES).
3. Capture the runner's timing summary from a stressed run and record which
   phase dominates — it is the evidence for what to fix.
4. Apply the fix, then re-run the harness at the same hog count, more times than
   the baseline needed.
5. Put both numbers in the commit message: what reproduced it, and what the fix
   ran clean against. "Green 5/5 at 64 spinners, against a baseline that failed
   1 of 2" is a claim a reviewer can check; "no longer flaky" is not.

## NOTES

**This detects load-dependent flakes, not every flake.** If stress does not
reproduce it, suspect a different class before adding more hogs:

- **Order dependence / shared state** — try the runner's shuffle or sequence
  options (`vitest --sequence.shuffle`, `jest --runInBand`), or run the suspected
  pair of files together.
- **Real time and dates** — a test that fails near midnight, a month boundary, or
  in another timezone is a clock bug; pin the clock instead.
- **Genuine external I/O** — a live network or database dependency in a unit test.

**Prefer removing the cost over widening the budget.** Stress reproduction tells
you a timing failure is real; it does not license raising the timeout as the fix.
In the source repo the actual fix was to stop doing expensive module loading
inside the test body, with the timeout raised only as a net for the few cases
that genuinely must load late — see the related practice
[dynamic-import-for-env-override-hermetic-tests.md](dynamic-import-for-env-override-hermetic-tests.md),
which covers the legitimate case for a late import and puts it in `beforeAll`
rather than in the test body, where its cost would land on a per-test timeout.

**Cheap to run, so run it more than once.** A full suite that takes ~40s idle
took ~95s under 64 spinners in the source repo — a handful of stressed runs is
still a couple of minutes, which is far cheaper than shipping a fix that only
looked green.

**On a shared or CI machine, keep the hog count modest** and always verify the
trap fired (`pgrep -f 'while :'`) before walking away.
