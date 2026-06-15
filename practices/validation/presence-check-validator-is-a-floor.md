---
concern: validation
tech: [typescript, validation, design]
priority: foundational
source-repo: tcg
applies-to: [any]
---
# A presence-checking validator is a floor, not a ceiling

## PATTERN

When a deterministic validator works by detecting the PRESENCE of known markers (a
curated list, a ruleset, a signature scan), it can confirm "this input is AT LEAST
severity X" but it can NEVER certify "this input is AT MOST X" or "this input is clean."
Absence of a finding is not proof of absence of the problem -- it only means none of the
CHECKED markers matched, and the curated/known set is never exhaustive.

Two design obligations follow:

1. **Monotonic in the safe direction.** Any downstream step that folds in additional
   evidence may only move severity conservatively (raise it), never lower it, and must
   refuse to act where it has no authority. Keep it a pure function so it is trivially
   testable and side-effect-free.

2. **Phrase absence as "unverified," not "clean."** When the validator finds nothing, the
   output must say "no marker from the checked set matched -- this does NOT certify the
   input is clean; verify by hand," never "clean / safe / passed." A consumer who reads
   "clean" as "safe" is silently misled exactly when the curated list has a gap.

## WHY

The natural instinct is to treat a validator's pass/fail as symmetric truth ("the linter
passed, so the code is fine"; "the grader found no combo, so the deck is combo-free"). For
any PRESENCE-detector backed by a non-exhaustive list, the negative result is fundamentally
weaker than the positive one. Designing as if they are symmetric produces false all-clears
-- the failure mode behind a whole class of "but the check said it was fine" incidents. A
floor result that later gains evidence should ratchet up, never down, and a "found nothing"
result should read as "didn't look everywhere," not "nothing there."

## EXAMPLE

From tcg's Commander bracket grader (`dashboard/src/lib/bracket-grader.ts`):

Monotonic upgrade -- `applyConfirmedInfinites` takes a tool-confirmed infinite combo and
raises a deck's grade, never lowers it, and refuses on cases it has no authority over:

```typescript
export function applyConfirmedInfinites(
  grade: BracketResult,
  confirmed: ConfirmedInfinite[],
): BracketResult {
  const clean = confirmed.filter((c) => (c.cards && c.cards.length > 0) || c.reason);
  if (clean.length === 0) return grade;
  // A format-banned deck's illegality is the headline; never overwrite it.
  if (grade.flags.bannedInCommander.length > 0) return grade;

  // Already B3+: combos are allowed there -- record provenance, do NOT change the number.
  if (grade.bracket >= 3) {
    return { ...grade, flags, rationale: [...grade.rationale, provenanceNote] };
  }
  // B1/B2: a confirmed self-contained infinite means the deck IS a combo deck -> raise to B3.
  return { ...grade, bracket: 3, bracketLabel: bracketLabel(3), flags, rationale: [...] };
}
```

Absence phrased as unverified -- the grader's own clean-B2 rationale string:

```
"...no combos from the curated known-combo list. That list is not exhaustive, so this
does NOT certify the deck is combo-free; verify combos from oracle text by hand."
```

## CHECK

How to verify if a repo already follows this:
- [ ] Validators/graders/scanners backed by a curated or signature list state, on a "found
      nothing" result, that the check is non-exhaustive and absence is not certification.
- [ ] Any function that adjusts a validator's verdict with extra evidence only moves it in
      the conservative direction (raises severity / tightens), never relaxes it.
- [ ] Such adjusters are pure (return a new result, no mutation) and short-circuit on inputs
      they have no authority to reclassify.
- [ ] No user-facing copy says "clean / safe / passed" where the underlying check can only
      prove "no known-bad marker matched."

## IMPLEMENT

Steps to adopt this in a repo that doesn't have it:
1. Inventory presence-detectors (linters, signature/rule scanners, combo/interaction
   detectors, allow/deny validators, severity graders). For each, identify what a NEGATIVE
   result actually proves.
2. Reword every "clean / safe / passed" output whose check is non-exhaustive into an
   explicit "no checked marker matched -- not a clean certification" message.
3. Make any verdict-adjustment step monotonic in the safe direction and pure; have it
   short-circuit on cases outside its authority (e.g. already-higher severity, hard-fail
   states) rather than recomputing or lowering.
4. Add tests that assert the adjuster never lowers severity and never touches the
   out-of-authority cases.

## NOTES

- Corollary practice for the LLM case: "Reconcile LLM self-assessments against deterministic
  checks directionally" (BP `llm-resilience`) -- when an LLM's self-reported verdict
  disagrees with the deterministic floor, the two directions of disagreement mean different
  things and must be handled asymmetrically. This floor/ceiling principle is the foundation
  that reconciliation rule rests on.
- Related failure mode in LL-G: reasoning-model spirals (`llm-integration`) and the broader
  tcg eval-reliability work, where over-trusting a silent presence-detector produced false
  "no infinite" all-clears.
