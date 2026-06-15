---
concern: llm-resilience
tech: [typescript, validation, design]
priority: recommended
source-repo: tcg
applies-to: [any]
---
# Reconcile LLM self-assessments against deterministic checks directionally

## PATTERN

When an LLM emits a self-reported assessment (a grade, a severity, a verdict, a score) and
you also have a deterministic check of the same quantity, do NOT force them into agreement
symmetrically. The two directions of disagreement carry DIFFERENT epistemic weight, because
the deterministic check is almost always a presence-detector -- a floor, not a ceiling (see
BP `validation`). Reconcile directionally:

- **LLM below the deterministic grade:** the deterministic check found a concrete marker the
  LLM understated. The deterministic floor wins -- the input is AT LEAST that grade. Correct
  the LLM up and say why (which marker).
- **LLM above the deterministic grade:** the deterministic check's curated rules did not
  catch what the LLM read, but a floor-style check CANNOT refute something it does not list.
  So the higher LLM read is plausible-but-unverified, NOT wrong. Do not stomp it down to the
  deterministic number; flag it as "the writer may be correctly seeing an engine the curated
  checks don't cover -- plausible, not deterministically verified."

Always carry the DETERMINISTIC number as the defensible anchor in your data model (the one
value you can defend without trusting LLM prose), and treat its presence as the signal that
the prose drifted. Append a directional note; never silently rewrite the LLM's number.

## WHY

The naive reconciler forces `prose == deterministic` in both directions. That is wrong in the
"LLM above" case: it discards a correct-but-unverifiable higher read precisely when the
curated rule list has a gap -- the exact situation the LLM is most useful for catching. And
it is unsafe in the "LLM below" case if you trust the prose over the floor. Asymmetric
handling keeps the deterministic floor authoritative where it has authority, while preserving
the LLM's signal where the deterministic check is structurally blind. It also produces an
honest audit trail: a reader sees both numbers and the reason they differ, instead of a
single number that hides a disagreement.

## EXAMPLE

From tcg's `dashboard/src/lib/verdict-reconcile.ts` (reconciling an improve-deck writer's
prose `Verdict: B<N>` line against the deterministic Commander bracket grade):

```typescript
const note =
  parsed.bracket < grade.bracket
    ? `> Deterministic bracket check: the prose Verdict reads B${parsed.bracket}, but the
       grader found bracket-defining markers that place this deck at B${grade.bracket} at
       minimum. The grader is a floor on the checked criteria, so the prose understates it.`
    : `> Deterministic bracket check: the prose Verdict reads B${parsed.bracket}, higher than
       the grader's B${grade.bracket}. The grader only checks curated criteria and cannot
       certify the absence of combos, so the higher prose read may be the writer correctly
       flagging an engine the curated list does not cover -- plausible but not
       deterministically verified.`;

// assessedBracket always carries the DETERMINISTIC grade -- the number we can defend without
// trusting prose. Its mere presence signals the prose drifted.
return { markdown: withNote, assessedBracket: grade.bracket };
```

## CHECK

How to verify if a repo already follows this:
- [ ] Where an LLM verdict is compared to a deterministic check, the disagreement is handled
      asymmetrically (the two directions produce different notes/behavior), not forced to equality.
- [ ] The deterministic value is stored as the canonical/defensible anchor, separate from the
      LLM's reported value.
- [ ] An LLM read ABOVE the deterministic floor is preserved and labeled "unverified," not
      overwritten with the lower deterministic number.
- [ ] The reconciliation produces a visible note explaining the disagreement, not a silent rewrite.

## IMPLEMENT

Steps to adopt this in a repo that doesn't have it:
1. Locate every place an LLM self-grades/scores and a deterministic check exists for the same quantity.
2. Add a parser that extracts the LLM's reported value from its output (tolerant of formatting).
3. Branch on direction: below-floor -> correct up with the marker; above-floor -> keep the LLM
   value, annotate as plausible-but-unverified.
4. Persist the deterministic value as the canonical anchor; surface both values + the reason.
5. Add tests for all three cases: agreement (no note), prose-below (raise + note), prose-above
   (keep + unverified note).

## NOTES

- Foundation: this is the floor/ceiling principle (BP `validation`, "a presence-checking
  validator is a floor, not a ceiling") applied to the specific case of an LLM self-assessment
  versus a deterministic check.
- Pairs with the fail-closed verification entry in this concern: when the LLM's claim cannot be
  verified at all, degrade safely; when it can be partially verified, reconcile directionally.
- Avoid regex lookbehind in the verdict parser if the output is also rendered client-side --
  lookbehind is a parse-time SyntaxError on older iOS Safari (see LL-G `typescript`). Capture a
  prefix group instead.
