---
concern: monorepo
tech: [pnpm, typescript, node]
priority: recommended
source-repo: tcg
applies-to: [pnpm-workspaces, typescript-monorepos]
---
# workspace:* Dependencies + TS Project References over Relative dist/ Imports

## PATTERN
In a pnpm monorepo where one package consumes another's compiled output, declare the dependency properly instead of importing built files by relative path:

1. Each consumed package gets a real name, a `"main"`/`"exports"` map pointing at its `dist/`, and `"types"` pointing at its declaration output.
2. Consumers declare `"<pkg>": "workspace:*"` in `package.json` and import by package name (`import { x } from "rules-engine"`), never by filesystem path (`import { x } from "../../../rules-engine/dist/index.js"`).
3. Add TypeScript project references (`"references": [{ "path": "../rules-engine" }]` + `"composite": true` on the leaf) so `tsc --build` compiles packages in dependency order and rebuilds stale leaves automatically.
4. CI/Docker builds run leaf packages before consumers (or just `tsc --build` at the root).

## WHY
Relative `../../../<pkg>/dist/` imports create the "stale dist" failure class: editing a leaf package's source does nothing until that package's own build runs, and the consumer happily compiles against (and Node happily imports) the old output. The failure mode is "I made the change, rebuilt, restarted, and the bug is still there" -- one of the most expensive-to-diagnose loops in monorepo development. Teams end up writing documentation (build-order runbooks, "rebuild the world" scripts) to manage a problem the toolchain can eliminate outright:

- `workspace:*` makes the dependency graph explicit and machine-readable; pnpm topologically orders installs and recursive builds.
- Project references make `tsc --build` skip-or-rebuild correctly based on actual staleness, so a stale leaf is rebuilt rather than silently consumed.
- Cannot-find-module errors point at a package name instead of a brittle `../../../` path that breaks when files move.

The source repo (tcg) documented the failure class in a rules file (`.claude/rules/builds.md`: four build pipelines, "the most painful failure mode is 'I made the change, restarted the server, but the bug is still there'") -- documentation that becomes unnecessary once the toolchain enforces ordering.

## EXAMPLE
Anti-pattern (tcg, `dashboard/src/routes/proxy.ts` and `dashboard/src/lib/forge-verify.ts`):

```ts
import { renderCard } from "../../../proxy-pipeline/dist/lib/canvas-renderer.js";
import { createForgeStore } from "../../../forge-bridge/dist/store.js";
```

Target pattern:

```jsonc
// rules-engine/package.json (leaf)
{
  "name": "rules-engine",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
}

// dashboard/package.json (consumer)
{ "dependencies": { "rules-engine": "workspace:*" } }
```

```jsonc
// rules-engine/tsconfig.json
{ "compilerOptions": { "composite": true, "declaration": true } }

// dashboard/tsconfig.json
{ "references": [{ "path": "../rules-engine" }] }
```

```ts
// consumer code
import { verifyClaim } from "rules-engine";
```

Build everything in order: `tsc --build dashboard` (or `pnpm -r --workspace-concurrency=1 run build` ordered by the dependency graph).

## CHECK
How to verify if a repo already follows this:
- [ ] `grep -r "\.\./\.\./.*/dist/" --include="*.ts"` returns nothing
- [ ] Cross-package deps appear as `workspace:*` in consumer `package.json` files
- [ ] Leaf packages have `composite: true` and consumers have `references`
- [ ] A clean clone builds with one root command in correct order
- [ ] No runbook/doc exists whose purpose is "remember to build X before Y"

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Give each consumed package a proper `exports` map (types + default) pointing at its `dist/`.
2. Add `workspace:*` deps to consumers; run `pnpm install` to wire the symlinks.
3. Mechanically rewrite `../../../<pkg>/dist/...` imports to package-name imports (grep for the pattern; deep imports need either subpath exports or refactoring to the barrel).
4. Add `composite: true` to leaves, `references` to consumers; switch the root build to `tsc --build`.
5. Update Dockerfiles: builder stage runs `pnpm install` at the workspace root so symlinks exist, builds leaves then consumers (or one `tsc --build`); runtime stage uses `pnpm deploy` or copies the workspace packages' `dist/` alongside the consumer.
6. Delete the now-redundant build-order runbook, or reduce it to "run the root build."

## NOTES
Highest-blast-radius step is the Docker build: the runtime stage must end up with the workspace packages present (pnpm symlinks don't survive naive `COPY` of a single package). Do the migration as its own change, alone, and watch the deploy. Extracted as the remediation for tcg's documented four-pipeline build-order hazard; the relative-dist scheme does work when documented, so treat this as RECOMMENDED hygiene, not an emergency. Related: pnpm-turborepo-structure.md, shared-packages-pattern.md.
