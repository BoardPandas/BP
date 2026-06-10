---
concern: dependencies
tech: [nodejs, npm, ci, github-actions]
priority: foundational
source-repo: supportforge-platform
applies-to: [any-nodejs-repo]
---
# Gate CI on npm audit --omit=dev and Remove Unused Dependencies Carrying Advisories

## PATTERN
Two complementary habits:

1. Run `npm audit --omit=dev --audit-level=high` as a CI step. Scoping to production dependencies keeps the gate actionable: dev-only advisories (test runners, build tooling) rarely represent runtime risk and create alert fatigue that gets the whole gate disabled.
2. When an advisory lands on a dependency, first ask whether the package is used at all: `grep` the source for its imports before reaching for upgrades or overrides. An unused dependency with a critical advisory is removed, not patched.

## WHY
Unused dependencies are pure liability: they enlarge the supply-chain attack surface, trip audits, and slow installs while contributing nothing. The reflex to "upgrade or override" wastes effort and leaves the liability in place. The source case: `npm audit` flagged samlify (critical, signed-SAML signature bypass) pulled in via `@better-auth/sso`; grep showed the SSO package was imported nowhere, so the correct fix was deleting one line from package.json, not engineering an override. Without the CI gate, that advisory had sat unnoticed because audits only ran when a human remembered.

## EXAMPLE
CI step (.github/workflows/ci.yml):

```yaml
- name: Audit production dependencies
  run: npm audit --omit=dev --audit-level=high
```

Triage flow when the gate fails:

```bash
npm ls samlify                  # who pulls it in?
# -> @better-auth/sso > samlify
grep -ri "@better-auth/sso" src/ dashboard/ admin/ --include=*.ts --include=*.tsx
# -> no hits: the package is unused
npm uninstall @better-auth/sso  # remove the liability instead of overriding the advisory
```

## CHECK
How to verify if a repo already follows this:
- [ ] CI contains an `npm audit --omit=dev` (or equivalent) step that fails the build at high/critical
- [ ] No production dependency in package.json lacks at least one import in source
- [ ] Advisory triage history shows removals of unused packages, not only version overrides

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Run `npm audit --omit=dev` locally; triage existing findings (remove unused, upgrade used, override only as last resort with a comment).
2. Add the CI step once the baseline is clean, at `--audit-level=high`.
3. Periodically (or via a dependency-audit skill) grep each production dependency for imports and prune the unused ones.

## NOTES
pnpm/yarn equivalents: `pnpm audit --prod`, `yarn npm audit --environment production`. For monorepos, run the audit at the root so hoisted transitive deps are covered. Beware false "unused" results for packages loaded via side effects, CLI bins, or framework conventions (express middleware registered by string, next plugins); confirm with the lockfile reverse tree before removing.
