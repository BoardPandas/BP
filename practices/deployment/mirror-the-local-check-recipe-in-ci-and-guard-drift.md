---
concern: deployment
tech: [github-actions, just, make, npm-scripts, ci]
priority: recommended
applies-to: [ci, github-actions, monorepos, task-runners]
---
# Mirror the local check recipe in CI step by step, and guard against drift with a script that compares the two lists

## PATTERN
The project has one local "check everything" recipe (`just check`, `make check`, `npm run check`). CI does not call that recipe as a single step and does not maintain its own independent idea of what to run. Instead:

1. **CI mirrors the recipe step by step.** Each command in the local recipe is its own CI step, in the same order, so the CI log shows which check failed and steps can be cached or parallelised.
2. **A drift guard compares the two lists.** A small script extracts the list of commands from the local recipe and the list from the workflow, normalises them, and fails if either side has a command the other lacks.
3. **The guard is itself one of the checks**, so it runs locally and in CI.

## WHY
Both simpler arrangements fail quietly. If CI just runs the local recipe as one step, a failure is one opaque red box, and nothing can be cached or run in parallel. If CI lists its steps by hand, the two lists drift: a check added to the local recipe never runs in CI, and everything stays green while the new check protects nothing on the branch that matters. Mirroring gives readable CI; the comparison script makes the mirror self-enforcing instead of a convention people have to remember.

## EXAMPLE
`justfile` (generic):

```just
check:
    cargo fmt --check
    cargo clippy --workspace --all-targets -- -D warnings
    cargo nextest run --workspace
    pnpm -C web lint
    pnpm -C web test
    node scripts/check-ci-mirror.mjs
```

`.github/workflows/ci.yml` (generic): one `run:` per recipe line, same order.

`scripts/check-ci-mirror.mjs` (generic sketch):

```js
import { readFileSync } from "node:fs";

const norm = (s) => s.trim().replace(/\s+/g, " ");
const recipe = readFileSync("justfile", "utf8")
  .split(/^check:\s*$/m)[1].split(/^\S/m)[0]            // body of the check recipe
  .split("\n").map(norm).filter(Boolean);
const ci = [...readFileSync(".github/workflows/ci.yml", "utf8").matchAll(/^\s*(?:-\s+)?run:\s*(.+)$/gm)]
  .map((m) => norm(m[1]));

const ALLOWED_CI_ONLY = new Set([/* setup steps that have no local counterpart */]);
const missingInCi = recipe.filter((c) => !ci.includes(c));
const extraInCi = ci.filter((c) => !recipe.includes(c) && !ALLOWED_CI_ONLY.has(c));
if (missingInCi.length || extraInCi.length) {
  console.error("CI and the local check recipe have drifted:", { missingInCi, extraInCi });
  process.exit(1);
}
```

## CHECK
- [ ] There is one local recipe that runs every check.
- [ ] The CI workflow runs the same commands as separate steps, in the same order.
- [ ] A script compares the two lists and fails on a difference in either direction.
- [ ] That script is part of the local recipe and of CI.
- [ ] Deliberate CI-only steps (toolchain setup, caches) are in an explicit allowlist, not silently ignored.

## IMPLEMENT
1. Consolidate local checks into one recipe if they are scattered.
2. Rewrite the CI job as one step per recipe command.
3. Write the comparison script for the project's recipe and workflow formats; keep the allowlist of CI-only steps short and commented.
4. Add the script to the recipe and to CI.
5. Prove the guard: add a dummy line to the recipe only, see the script fail, remove it.

## NOTES
The gotcha this answers is LL-G `kb/github-actions/guard-in-check-all-but-not-in-ci.md`. Where CI flags legitimately differ from local ones (for example `--no-fail-fast` in CI only), encode that difference in the normaliser rather than exempting the whole command; see LL-G `kb/github-actions/tests-asserting-system-tool-output-fail-on-older-ci-image.md`.
