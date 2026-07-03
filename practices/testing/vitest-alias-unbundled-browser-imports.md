---
concern: testing
tech: [vitest, vite]
priority: recommended
source-repo: tcg
applies-to: [vitest, unbundled-static-js, browser-frontend]
---
# Alias absolute browser-style imports in vitest.config.ts, don't rewrite them to relative

## PATTERN
When a codebase's browser JS has no bundler (static files served directly:
no webpack/vite/esbuild build step for the frontend) and uses absolute-path
imports like `import { x } from "/shared/util.js"` -- correct for a browser
pointed at the server's static root, but unresolvable by Node/vitest, which
has no server to resolve a leading `/` against -- add `resolve.alias`
entries to `vitest.config.ts` that map those exact prefixes to their real
filesystem locations. Do not rewrite the source files' imports to relative
paths just to make them testable; that diverges from the whole codebase's
established convention for the sake of one test file.

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const PUBLIC_DIR = fileURLToPath(new URL("./src/public", import.meta.url));

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  resolve: {
    alias: [
      { find: /^\/shared\//, replacement: `${PUBLIC_DIR}/shared/` },
      { find: /^\/sections\//, replacement: `${PUBLIC_DIR}/sections/` },
    ],
  },
});
```

A second, related issue this surfaces: if the unbundled static directory
(`src/public/`) was never meant to be part of the TypeScript program (no
build step, plain JS) but got swept in incidentally by a broad
`"include": ["src"]` in `tsconfig.json`, the first `.ts` test file placed
there will fail with TS7016 ("could not find a declaration file") when it
imports a plain `.js` sibling, since `allowJs` is off. Fix this by excluding
that directory from `tsconfig.json` explicitly (documenting the existing,
previously-implicit intent), NOT by turning on `allowJs` globally -- doing
that risks the REAL build (a plain `tsc` with emit, not `--noEmit`) suddenly
transpiling and copying the entire untouched frontend into `dist/`, which
nothing then consumes (the server serves the static directory from source,
not from `dist/`).

## WHY
- The absolute-path import convention is usually already correct and
  intentional for how the app is served; changing it for testability is a
  larger, riskier diff than a five-line config addition, and creates two
  import styles in the same codebase (relative in tested files, absolute
  everywhere else) that will confuse the next person who copies a pattern
  from the wrong file.
- `vitest`'s module resolution goes through Vite's resolver (which alias
  config affects) independent of `tsconfig.json`'s `include`/`exclude` --
  test *discovery* still works even after excluding a directory from the TS
  program, since `vitest.config.ts`'s own `include` glob is what vitest
  actually uses to find test files.
- `allowJs: true` is a program-wide switch: enabling it to satisfy one new
  test file's import silently pulls every other untyped `.js` file the
  broad `include` already matched into the TypeScript program too, which is
  a much larger and less obvious blast radius than the fix actually needs.

## CHECK
- [ ] `vitest.config.ts` has `resolve.alias` entries for every absolute
      import prefix the browser code actually uses (grep for `from "/` in
      the tested files' import graph).
- [ ] `tsconfig.json` explicitly excludes any directory that is static,
      unbundled browser code with no build step -- not relying on it being
      incidentally uncompiled just because no `.ts` file happens to live
      there yet.
- [ ] The repo's real build command (not just the `--noEmit` typecheck
      variant) does not emit anything under the excluded static directory
      into `dist/`.

## IMPLEMENT
1. Identify the absolute-path prefixes the browser code imports with (e.g.
   `/shared/`, `/sections/`, `/ds/`).
2. Add a `resolve.alias` array to `vitest.config.ts` mapping each prefix
   (as a regex anchored to the start, `/^\/prefix\//`) to its real
   filesystem path via `fileURLToPath(new URL(...))`.
3. If the static directory isn't already excluded from `tsconfig.json`,
   add it to `exclude` (not `allowJs`), with a comment explaining why.
4. Re-run both the real build command and the typecheck command to confirm
   neither changed behavior for existing files.

## NOTES
Auto-discovered by practice-scout from tcg, Commander Companion P2 (game
tracker state-module tests needed to import sibling `shared/` helpers via
the codebase's existing absolute-import convention; version bump to
3.150.0.0).
