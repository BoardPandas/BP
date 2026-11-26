---
concern: dependencies
tech: [nodejs, typescript, npm, esbuild]
priority: recommended
applies-to: [any-repo-that-bundles-third-party-code-into-a-self-contained-page]
---
# Pin the exact version of a third-party script bundled into a page, and test the hash of what is bundled

## PATTERN
When a build inlines third-party code into a self-contained artifact (a single HTML view, an embedded widget, a generated script), pin the dependency to an exact version (no `^` or `~`) and add a test that hashes the file that is actually bundled and compares it with a recorded SHA-256. Changing the dependency then requires updating the hash in the same commit.

## WHY
In such a page the third-party file is nearly all of the script that runs, often in a place users trust or a sandbox that is hard to inspect. A lockfile alone protects the install, not what a later rebuild embeds; a semver range, a transitive bump or a changed build step can change the shipped bytes without any line of your own code changing. A hash test makes "the script this page runs changed" a deliberate, reviewable edit.

## EXAMPLE
```json
{ "dependencies": { "ext-library": "2.0.4" } }
```
```ts
// tests/view-build.test.ts
const BUNDLED_FILE_SHA256 = "<sha-256 of the bundled file>";

it("bundles exactly the reviewed third-party script", () => {
  const file = require.resolve("ext-library/dist/app-with-deps.js");
  const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
  expect(digest).toBe(BUNDLED_FILE_SHA256);   // bump the version and this value together
});
```

## CHECK
How to verify if a repo already follows this:
- [ ] The dependency is pinned to an exact version in `package.json`
- [ ] A test hashes the file the build actually embeds
- [ ] The test message tells a developer to update the hash together with the version
- [ ] The built artifact is checked in CI from a clean tree

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Replace the version range with the exact version in use.
2. Compute the SHA-256 of the file the bundler reads and record it in a test.
3. Make the test fail with an explicit message on mismatch.
4. Review the changed script when you bump the version, then update both values.

## NOTES
- Hash the input the bundler embeds, not the final output, if your own code is also in the output.
- Pair with `npm audit` gating; the hash test does not tell you whether a version is vulnerable.
