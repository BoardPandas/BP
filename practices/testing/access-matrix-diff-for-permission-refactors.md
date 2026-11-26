---
concern: testing
tech: [typescript, jest, vitest]
priority: recommended
applies-to: [role-based-access, permission-refactors, navigation-refactors]
---
# Prove an access-preserving refactor by dumping the full viewer matrix before and after and diffing it

## PATTERN
When a refactor must not change who can see or do what (restructuring a nav,
moving gates into a new module, merging pages), do not rely on the handful of
role cases the unit tests name. Enumerate **every** combination of the inputs
the access decision reads, dump the decision for each, and require the dump to
be byte-identical before and after the change.

1. Write a small script that imports the function under refactor by path and
   prints, for each viewer, the sorted set of things that viewer gets.
2. Run it on the commit before the change and save the output.
3. Run it after the change and compare. Any difference is either a bug or a
   decision someone must make deliberately.
4. Keep a reduced version of the matrix in the test suite as exact-set
   assertions, so later changes have to edit the expectation on purpose.

## WHY
Access rules are small boolean expressions over a few inputs, and the bugs live
in combinations nobody thought to test: the admin whose per-workspace level was
lowered, the state while permissions are still loading, the non-admin who holds
a high workspace level. A hand-picked test list mirrors the author's mental
model, so it passes exactly when the author's model is wrong.

The input space is usually tiny: a few roles times a few levels per workspace
is hundreds or thousands of combinations, which run in well under a second. The
dump turns "no access rule changed" from a claim in a pull-request description
into something a reviewer can verify with `cmp`.

It also changes the review of later, intentional changes: the diff of the dump
is the list of affected viewers, in plain text.

## EXAMPLE
```ts
// scratch/nav-matrix.ts  --  tsx nav-matrix.ts <abs path to module> > out.json
const LEVELS = ['none', 'technician', 'member', 'manager', 'admin'] as const
const ROLES = {
  admin:      { isAdmin: true,  isManager: false, isStaff: true },
  manager:    { isAdmin: false, isManager: true,  isStaff: true },
  technician: { isAdmin: false, isManager: false, isStaff: true },
  nonstaff:   { isAdmin: false, isManager: false, isStaff: false },
}
const mod = await import(pathToFileURL(process.argv[2]).href)
const hrefs = (viewer: object) =>
  mod.settingsNav(viewer).flatMap((s) => s.items.map((i) => i.href)).sort()

const out: Record<string, string[]> = {}
for (const [role, flags] of Object.entries(ROLES)) {
  out[`${role}|loading`] = hrefs({ ...flags })            // permissions not loaded yet
  for (const tickets of LEVELS) for (const rmm of LEVELS)
    for (const people of LEVELS) for (const reports of LEVELS)
      out[`${role}|t=${tickets}|r=${rmm}|p=${people}|c=${reports}`] =
        hrefs({ ...flags, levels: { tickets, rmm, people, client_reports: reports } })
}
process.stdout.write(JSON.stringify(out, null, 1))
```
```bash
git stash -u   # or check out the base commit in a worktree
tsx scratch/nav-matrix.ts "$PWD/src/lib/nav/settings.ts" > before.json
# ...apply the refactor...
tsx scratch/nav-matrix.ts "$PWD/src/lib/nav/settings.ts" > after.json
cmp before.json after.json && echo "IDENTICAL for 2,504 viewers"
```
```ts
// In the suite: the invariant that must never depend on a workspace level,
// walked over every combination rather than sampled.
it('offers the staff page to a site admin whatever their workspace levels', () => {
  for (const levels of everyLevelMap()) {
    expect(hrefs({ isAdmin: true, isStaff: true, levels })).toContain('/settings/staff')
  }
})
```

## CHECK
How to verify if a repo already follows this:
- [ ] Access decisions are pure functions of an explicit viewer object, so they can be called without rendering or a database.
- [ ] The suite has exact-set assertions (the whole set of destinations per viewer), not only "contains X" checks.
- [ ] At least one invariant is asserted over every combination of inputs rather than a sample (for example "this page never depends on a workspace level").
- [ ] The "still loading" state of the viewer is one of the cases.
- [ ] The last access refactor's description states a before/after comparison over the full matrix.

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Make the decision callable in isolation: extract the rules into pure functions of `{ role flags, levels, capabilities }`.
2. List the inputs the rules actually read and their value sets. Include "not loaded yet".
3. Write the dump script outside the repo's source tree (a scratch directory), importing the module by absolute path so the same script runs against any commit.
4. Capture the baseline on the commit before the refactor. Refactor. Compare. Investigate every differing key.
5. Commit a reduced matrix as exact-set tests, plus the full-walk test for each invariant that must hold everywhere.
6. For later intentional changes, attach the diff of the dump to the change description.

## NOTES
- Sort the output and use a stable key format so the comparison is meaningful.
- Dump what the viewer gets (hrefs, tab ids, enabled actions), not how it is grouped, so a regrouping does not show as an access change.
- If the full product is too large, fix the inputs a rule does not read and vary the rest; say which were fixed.
- This proves the client-side offer did not change. Server-side gates need their own tests; the two are compared deliberately, not assumed equal.
