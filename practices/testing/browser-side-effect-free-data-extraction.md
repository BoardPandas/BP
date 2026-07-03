---
concern: testing
tech: [javascript, browser, vitest, es-modules]
priority: recommended
source-repo: tcg
applies-to: [javascript, typescript, browser]
---

# Split side-effect-free data out of a module that mutates the DOM at import time

## PATTERN

When a browser module exports a useful DATA CONSTANT (a lookup table, a preset
map, a config object) but ALSO runs code at module-load time that touches
`document`/`window`/`localStorage` (a "bootstrap" module — applies a theme,
wires a global listener, reads persisted state), split the constant into its
own zero-side-effect module. The bootstrap module imports and re-exports it
so existing callers of the bootstrap module are unaffected; new callers that
only need the data import the split-out module directly.

```js
// BEFORE: theme.js — importing this ANYWHERE runs setManaTheme() against
// document.documentElement, even in a Node test with no DOM.
export const MANA_PRESETS = { W: {...}, U: {...}, ... };
setTheme(readTheme());
setManaTheme(readMana(), { skipStore: true }); // <-- throws under Node/vitest

// AFTER: mana-presets.js — pure data, zero side effects, safe anywhere.
export const MANA_PRESETS = { W: {...}, U: {...}, ... };

// theme.js — re-exports so existing `import { MANA_PRESETS } from "theme.js"`
// call sites still work unchanged.
import { MANA_PRESETS } from "./mana-presets.js";
export { MANA_PRESETS };
setTheme(readTheme());
setManaTheme(readMana(), { skipStore: true });

// A NEW module that only needs the data imports the pure half directly:
import { MANA_PRESETS } from "./mana-presets.js";
```

## WHY

- A vitest suite running under `environment: "node"` (no DOM) throws at
  import time the moment it (transitively) imports a module with an
  unguarded `document.documentElement` access — even if the test never
  calls the function that touches it. The failure is a module-load crash,
  not a clean test failure, so it's confusing to debug from the stack trace
  alone.
- The alternative fixes are worse: duplicating the constant (two sources of
  truth that drift), mocking `document` globally for the whole test file
  (hides a real bug if the bootstrap code SHOULD run in some other context),
  or switching the test environment to `jsdom` just to import one constant
  (slower, and doesn't fix the actual coupling — the module still shouldn't
  run a document mutation as an import-time side effect).
- Splitting is a few lines, is fully backward-compatible (the bootstrap
  module re-exports), and makes the dependency direction explicit: "this
  code needs the DATA" vs "this code needs the BEHAVIOR."

## EXAMPLE

Real split from `tcg` (dashboard, P4): `dashboard/src/public/shell/theme.js`
originally defined `MANA_PRESETS` inline and then called `setManaTheme()` at
module scope, so any file importing `MANA_PRESETS` for its own purposes (a
new module deriving a per-element accent, unrelated to the document-level
theme bootstrap) also triggered the full theme bootstrap — which threw under
vitest's `node` environment (no `document`). The data moved to
`dashboard/src/public/shell/mana-presets.js` (zero imports, zero side
effects); `theme.js` now imports and re-exports it, unchanged for every
existing caller.

## CHECK

- [ ] Does this module export at least one plain data constant that would be
      useful independent of the module's bootstrap behavior?
- [ ] Does the SAME module also run code at the top level (outside any
      function) that touches `document`, `window`, `localStorage`, or
      similar globals absent in a headless test runner?
- [ ] Would a test importing ONLY the data constant currently have to also
      pay for (or guard against) the bootstrap side effect?

## IMPLEMENT

1. Create a new sibling module containing ONLY the data constant(s), with no
   top-level statements beyond the export itself.
2. In the original module, import the constant from the new module and
   `export { ... }` it again, so its existing public API is unchanged.
3. Update the original module's own top-level bootstrap code to use the
   re-exported (or directly imported) binding — no behavior change.
4. New consumers that only need the data import the NEW module directly,
   never the bootstrap module.
5. Add a one-line comment on the data module noting it must stay free of
   side effects, and on the bootstrap module noting where the data actually
   lives now.

## NOTES

- This pattern generalizes beyond theme/CSS constants: any "config object +
  auto-apply on load" module (feature flags, a persisted-preference reader
  that also patches `window`, an analytics init that also defines a shared
  event schema) is a candidate whenever something else legitimately needs
  just the schema/config.
- Keep the re-export in the bootstrap module rather than deleting the old
  export path — silently changing every existing import site's path is a
  bigger, riskier diff than the actual fix needs to be.

Auto-discovered by practice-scout from tcg commit 1ab1b523.
