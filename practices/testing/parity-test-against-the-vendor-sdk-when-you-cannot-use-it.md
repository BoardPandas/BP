---
concern: testing
tech: [typescript, vitest, jest, mcp, sdk]
priority: recommended
applies-to: [any-repo-that-reimplements-a-vendor-component]
---
# When you cannot attach the vendor's extension, re-implement it and test parity against the real one

## PATTERN
Sometimes a vendor SDK ships a component you cannot use as designed (it needs a class your server is not built on, or it cannot wrap your transport). If you re-implement its behaviour, keep a parity test: stand the vendor component up in a test, feed both implementations the same input, and assert equal answers. Make differences explicit and short, each with a comment saying why it is intended (for example a different cache hint or a wider URI template).

## WHY
A copy drifts silently. The vendor changes a field name, a size limit or a default in a minor release, your copy keeps the old behaviour, and clients written against the vendor's behaviour break in the field while your own unit tests, written from your reading of the old behaviour, stay green. A parity test turns the upgrade into a failing test with a precise diff.

## EXAMPLE
```ts
// The vendor's own implementation over the same fixture folder, as the reference.
function referenceServer(files: Fixture) {
  const mcp = new McpServer({ name: "reference", version: "1.0.0" });
  new SkillsExtension({ root: files.dir }).attach(mcp);
  return connect(mcp);
}

describe("parity with the vendor's skills extension", () => {
  it("lists the same skills", async () => {
    const [ours, theirs] = await Promise.all([ourServer(files).call("skills/list"), referenceServer(files).call("skills/list")]);
    expect(normalise(ours)).toEqual(normalise(theirs));     // normalise() drops only the documented differences
  });
  it("serves the same file bytes and digests", async () => { /* same shape for skills/get */ });
});
```

## CHECK
How to verify if a repo already follows this:
- [ ] Each re-implemented vendor behaviour has a test that runs the vendor's version on the same input
- [ ] The allowed differences are listed in one place, each with a reason
- [ ] The test runs in CI and fails on a vendor version bump that changes behaviour

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Write a fixture both implementations can read.
2. Start the vendor component in the test, on whatever host class it supports.
3. Compare the answers for each method, normalising only the documented differences.
4. Pin the vendor version so an upgrade is a deliberate change that re-runs the comparison.

## NOTES
- Test through the real request path of each side, not by calling internal functions.
- Related LL-G entry: the SDK's skills extension attaches only to the high-level server class, which is why the copy was needed.
