---
concern: testing
tech: [typescript, javascript, esm, vitest, jest, node]
priority: recommended
source-repo: tcg
applies-to: [typescript, javascript, node]
---

# Use a dynamic `await import()` inside `beforeAll`, not a static import, when a test sets an env var to override a module's load-time config

## PATTERN

When a test needs `process.env.SOME_OVERRIDE = X` to take effect before the
module under test (or its transitive dependencies) captures that env var at
import time, the module-under-test must be loaded with a DYNAMIC `await
import(...)` call inside `beforeAll`/`beforeEach` -- never a static top-level
`import ... from "..."`.

```ts
// BEFORE (broken): the static import is hoisted by the ES module spec to run
// BEFORE any of this file's own top-level statements -- including the
// process.env line below it. The module (and its whole transitive import
// chain) captures the environment's PRE-override value.
process.env.SOME_DIR_OVERRIDE = tmpDir;
import { routesUnderTest } from "./routes.js"; // already loaded, wrong config

// AFTER (correct): the dynamic import is a normal expression, evaluated in
// FILE ORDER at the point it's awaited -- which is after the env var is set,
// because it lives inside beforeAll(), which runs after all static imports
// (including this file's own) have already resolved.
process.env.SOME_DIR_OVERRIDE = tmpDir;

let app: Hono;
beforeAll(async () => {
  const { routesUnderTest } = await import("./routes.js"); // sees the override
  app = new Hono();
  app.route("/", routesUnderTest);
});
```

## WHY

- ES modules hoist ALL static `import` statements to the top of a file's
  evaluation, regardless of where they're textually written. This is a
  language-level guarantee (not a bundler quirk), so writing the import
  "after" the `process.env` line in source order does NOT help -- the
  import still runs first.
- A module that reads `process.env.X` at its own top level (a common pattern
  for "resolve this directory/config once, cache it in a module-level
  const") permanently captures whatever the env var was BEFORE any test file
  had a chance to override it -- usually the real default, not the test's
  throwaway value.
- The failure mode is silent and confusing: the test doesn't error, it just
  exercises the WRONG underlying data (the real directory/database/config
  instead of the hermetic fixture), producing failures (or worse, false
  passes) that look unrelated to import order. Route-handler tests that
  expect 200 return 404 with no obvious cause; the fix looks like an ACL bug
  when it's actually an import-order bug.
- A dynamic `import()` call is a normal runtime expression (technically a
  function call returning a Promise), not a hoisted declaration, so it runs
  exactly where it's textually placed -- which, inside `beforeAll`, is
  guaranteed to be after the file's own top-level `process.env` assignment.

## EXAMPLE

`dashboard/src/routes/proxy/decks.test.ts` (tcg) already used this pattern
correctly: `process.env.PROXY_DECKS_DIR_OVERRIDE = TMP` at file scope, then
`const { registerDeckRead } = await import("./deck-read.js");` inside
`beforeAll`. A sibling test file (`app-game-decks.test.ts`) initially copied
the env-var-override structure but used a STATIC top-level import for the
route module under test, which silently pointed every request at the real
(non-overridden) deck directory -- five tests failed with 404 where 200 was
expected, with no indication the cause was import ordering rather than the
route logic itself. Switching to the same dynamic-import-in-beforeAll shape
fixed it immediately, with no other code change.

## CHECK

- [ ] Does this test file set a `process.env.X` (or similar global
      config override) at its own top level, intended to affect a module
      it's about to test?
- [ ] Does that module (or something it imports) read `process.env.X` at
      ITS OWN top level (module-load time), not inside a function called
      later?
- [ ] Is the module-under-test currently loaded via a static
      `import ... from "..."` anywhere in the test file?

If all three are true, the import needs to move to a dynamic `await
import(...)` inside `beforeAll`.

## IMPLEMENT

1. Set the env var override at the test file's top level, as early as
   possible (before any other statement that might trigger the real import
   chain, e.g. via a helper you also import statically).
2. Remove the static `import { X } from "./module-under-test.js"` line.
3. Inside `beforeAll` (or the first place the module is actually needed),
   add `const { X } = await import("./module-under-test.js");` and use the
   destructured binding from there on (module-level `let` + assignment, or
   keep everything that depends on it inside/after `beforeAll`).
4. Double-check every OTHER static import in the test file too -- if any of
   THEM transitively pulls in the module that reads the env var (e.g. a
   shared helper that itself imports the config-reading module), that
   import needs the same dynamic treatment, or it re-introduces the bug via
   a different path.

## NOTES

- This applies to Jest the same way it applies to Vitest -- both run on
  real ES module semantics (or CommonJS interop that preserves the same
  hoisting behavior for `import`), so the underlying cause is a language
  guarantee, not a test-runner quirk.
- `vi.mock(...)` / `jest.mock(...)` calls are a DIFFERENT mechanism (hoisted
  by the test runner's own transform, to run before even static imports) and
  are unaffected by this -- this note is specifically about a plain
  `process.env` assignment plus a module that reads it eagerly.
- The fix generalizes beyond directory overrides: any test-time global
  config a module capture-reads at load time (a feature-flag env var, a
  base-URL override, a fake-clock installation that must precede an import)
  has the same hazard and the same fix.

Auto-discovered by practice-scout from tcg commit (fix pass following 1ab1b523, 2026-07-02).
