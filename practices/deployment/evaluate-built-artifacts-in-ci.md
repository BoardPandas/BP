---
concern: deployment
tech: [ci, github-actions, esbuild, docker, cloudflare-workers, aws-lambda, node]
priority: recommended
source-repo: Broadside
applies-to: [any-repo-with-a-build-step, cloudflare-workers, aws-lambda, docker, node-cli, monorepo]
---
# Evaluate the built artifact in CI, not just build it

## PATTERN

A build step proves the code **compiles**. It does not prove the artifact **starts**.

Add one CI step after the build that loads the produced artifact exactly once and asserts
it initialises. For a bundled JS entrypoint that is a single command:

```bash
node --input-type=module -e "await import('$PWD/dist/index.js')"
```

Exit 0 means module evaluation succeeded. Exit 1 means the thing you were about to ship
cannot start — and you now know before deploying rather than during.

The gap this closes is narrow and specific: **code that runs at module scope**. Imports,
top-level `await`, module-level constants, schema builders, client constructors, decorator
side effects, registry registrations. None of it executes during a type check, a lint, or a
bundle. All of it executes the instant something imports the artifact for real — which,
for most deploy targets, is the deploy itself.

## WHY

**Every other gate is blind to it.** Typecheck reads types. Lint reads syntax. The bundler
resolves and concatenates. A build step that ends in "wrote dist/index.js" has asserted
nothing about whether that file can be loaded.

**Your test suite is probably blind to it too, and for a non-obvious reason.** Test runners
usually bundle with their own toolchain — Vitest with Vite/Rolldown, Jest with SWC/Babel —
which is *not* the bundler your deploy uses. Different bundlers make different decisions
about module initialisation order and lazy/eager wrapping, so the suite can import a
working module while the artifact that ships is dead. This is the trap: a fully green
suite is not evidence about the deploy artifact unless it loads *that* artifact.

**The failure lands at the worst possible moment.** Deploy targets evaluate the module as a
validation or startup step: Cloudflare Workers rejects the version at upload, Lambda fails
the init phase, a container crash-loops, a CLI dies on `--help`. So the error surfaces in a
deploy log rather than a CI log, usually after the change is already merged.

**And it can hide.** When a platform *rejects* a bad version rather than serving it, the
previous build keeps running — nothing is down, no alarm fires, and the broken deploy is
inherited by whoever pushes next.

Real cost, from the source repo: a dependency bump reordered an esbuild bundle so an eager
module called into a lazily-initialised one, producing `TypeError: ZodLazy is not a
constructor` at Cloudflare's upload validation. Typecheck, lint, 488 tests and the bundle
step were all green. The one-line evaluation check would have caught it before the push.

**It is close to free.** One command, no fixtures, no new dependency, runs in under a
second, and it fails loudly with the same error the platform would have produced.

## EXAMPLE

The CI step, placed after the build so it asserts on the real artifact
(`.github/workflows/ci.yml`):

```yaml
      - name: Typecheck
        run: pnpm typecheck
      - name: Lint
        run: pnpm lint
      - name: Test
        run: pnpm test
      - name: Bundle workers
        run: pnpm build

      # Runs AFTER the bundle, because it asserts on the built artifact rather than
      # the source -- and after typecheck/lint/test, so a failure here never skips
      # the suite.
      #
      # The invariant: the artifact must survive module evaluation. Nothing above
      # checks that -- the bundler only writes the file, and the test runner bundles
      # with a DIFFERENT toolchain, so a green suite says nothing about this file.
      - name: Built artifacts load
        run: pnpm check:bundle-order
```

A monorepo-wide checker (`scripts/check-bundle-order.mjs`) — load every built entrypoint,
report all failures rather than stopping at the first:

```js
import { readdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const failures = [];
for (const app of readdirSync("apps")) {
  const entry = `apps/${app}/dist/index.js`;
  if (!existsSync(entry)) continue;              // not every package builds one
  try {
    await import(pathToFileURL(entry).href);
  } catch (e) {
    // The message IS the deploy error you would otherwise read in a build log.
    failures.push(`${app}: ${e.message}`);
  }
}
if (failures.length) {
  console.error("Built artifact failed to evaluate:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("All built artifacts evaluate cleanly.");
```

Equivalents for other targets — same idea, one command each:

```bash
# Docker: the image built; prove the container reaches a running state.
docker run --rm --entrypoint node "$IMAGE" -e "await import('/app/dist/index.js')"

# Node CLI: tsc passing says nothing about the entrypoint loading.
node dist/cli.js --version

# AWS Lambda: import the handler module and assert the export exists.
node -e "const m = await import('./dist/handler.js'); if (!m.handler) process.exit(1)"
```

## CHECK

How to verify if a repo already follows this:
- [ ] CI has a step *after* the build that loads or executes the produced artifact
- [ ] That step runs against the build output (`dist/`, the image, the bundle), not the source
- [ ] The deploy tool's own "dry run" is not being mistaken for this — confirm whether it
      evaluates the module or merely writes it (most only write it)
- [ ] The test runner's bundler is compared against the deploy bundler; if they differ, the
      suite does not cover the shipped artifact
- [ ] In a monorepo, every deployable entrypoint is covered, not only the one that broke last

## IMPLEMENT

Steps to adopt this in a repo that doesn't have it:
1. Confirm the gap first: build, then `node -e "await import('./dist/index.js')"` locally.
   If it exits 0 today, the check will hold the line; if it exits 1, you have already found
   a live bug.
2. Add a script that loads each built entrypoint and collects failures (see the example).
   Skip packages that produce no entrypoint rather than erroring on them.
3. Wire it into `package.json` (e.g. `"check:bundle-order"`), so it is runnable locally by
   the same name CI uses.
4. Add the CI step immediately after the build, and after typecheck/lint/test so a failure
   here never prevents the suite from reporting.
5. If any artifact legitimately cannot be evaluated in plain Node — because its module scope
   touches a runtime-only global — run that one under its real runtime instead of dropping
   the check.

## NOTES

- **Loading under plain Node is a proxy, not a replica of the target runtime.** A module
  scope that touches a runtime-only global (Workers, Deno, browser) will throw for an
  unrelated reason. In practice module scope is imports and constants, so this is rare —
  and when it happens the fix is to evaluate under the real runtime, not to abandon the
  check. Initialisation-order faults reproduce identically in Node, because they are plain
  JavaScript evaluation order.
- **Importing runs the module — make sure that is safe.** An entrypoint that starts a
  server or opens a connection at module scope will do so here. That is usually a design
  smell worth fixing anyway (side effects belong behind an exported `main()`); if you cannot
  change it, evaluate in a subprocess with a timeout and treat "still alive after N ms" as
  success.
- **Marked RECOMMENDED rather than FOUNDATIONAL** only because a repo with no build step has
  no artifact to evaluate. For anything that bundles, containerises, or compiles before
  shipping, treat it as foundational — it is the cheapest gate in the file and it covers a
  class nothing else does.
- The inverse failure is worth recognising as the same shape: a gate that reports success
  without having checked the thing that has to be true in production. Migration ledgers,
  smoke checks that only assert HTTP 200, and lint rules scoped to files nobody edits all
  fail this way.
- Related LL-G entry documenting the concrete failure this came from:
  `kb/cloudflare/dry-run-does-not-evaluate-bundle.md`.
