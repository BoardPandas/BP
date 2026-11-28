---
concern: testing
tech: [code-review, security-review, ai-agents, layered-architecture]
priority: recommended
applies-to: [authentication, oauth, protocol-servers, multi-layer-builds, agent-built-code]
---
# Review each layer with an independent security pass before building the next layer on it

## PATTERN
When a system is built in layers (storage and policy, then identity, then the protocol endpoints, then the user interface), each layer gets a security review **before** the next one is started:

1. The review is **independent**: done by a person, or a separate agent session, that did not write the layer and is not given the authors' conclusions. It gets the code and the specification, not a summary of why the code is right.
2. The reviewer is asked for **blockers**: ways to bypass a check, forge or replay a value, exhaust a resource, or reach data across a boundary. Style is out of scope.
3. Every blocker is fixed, with a test that fails without the fix, before work on the next layer begins.
4. The review also reads the layer's **tests as claims**: a test that asserts insecure behaviour is a finding, not evidence.

## WHY
Authors test what they intended, so their tests encode their misunderstandings. In the build this practice comes from, every independent pass found at least one blocker that the authors' own tests had codified as intended behaviour: the suite was green because it asserted the flaw. A review at the end finds the same defects after other layers have been built on them, when fixing one means changing every layer above it. A pass per layer keeps each fix local.

## EXAMPLE
Brief for the reviewer (generic):

```text
Scope: the identity layer only (paths: ...). Specification: ...
You did not write this code. Do not assume the tests are correct: where a test asserts
behaviour that weakens security, report the test as well as the code.
Report only blockers, each with: the attack in one sentence, the file and line, and a
request or sequence that demonstrates it. No style comments.
Out of scope: layers not yet built.
```

Gate in the plan:

```text
Layer 2 (identity)   build -> independent security pass -> fix blockers (+ failing-first tests) -> DONE
Layer 3 (OAuth)      may start only when layer 2 is DONE
```

## CHECK
- [ ] The plan has a security-review gate between layers, not only at the end.
- [ ] Each review was done by someone, or a session, that did not write the layer and was not handed the authors' conclusions.
- [ ] Review findings include tests that assert insecure behaviour, where present.
- [ ] Each blocker has a fix and a test shown to fail without it.
- [ ] No layer was started while the layer below had open blockers.

## IMPLEMENT
1. Mark the layer boundaries in the plan and add a review gate after each.
2. Write the reviewer brief once and reuse it, changing only scope and specification.
3. Run the pass with a fresh reviewer per layer; give code and specification, not conclusions.
4. Fix blockers with failing-first tests, then open the next layer.
5. Record per layer: blockers found, fixed, and the tests that changed meaning.

## NOTES
See `confirm-every-new-test-fails-without-its-fix.md` for step 4. This is a review of design and behaviour; it does not replace dependency and secret scanning.
