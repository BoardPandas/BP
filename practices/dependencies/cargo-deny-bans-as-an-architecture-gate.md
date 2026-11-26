---
concern: dependencies
tech: [rust, cargo, cargo-deny]
priority: recommended
applies-to: [rust, cargo]
---
# Use cargo-deny bans as an architecture gate, not just a licence and advisory check

## PATTERN
When an architectural decision rules a crate out ("one crypto backend", "roots come from the OS store, not a bundled list", "no AGPL parser"), put the crate in `[bans] deny` in `deny.toml` with a `reason` that states the decision. "The build contains no X" then becomes a failing `cargo deny check bans` in CI instead of a manual `cargo tree -i X` inspection that someone runs once and nobody repeats.

Ban every crate that would signal the violation, not just the obvious one: both the `-sys` and the safe wrapper of a crypto backend, and both root-store crates.

## WHY
Transitive dependencies change on every `cargo update` and every feature flag. SDKs and database crates often enable a different TLS backend or a bundled certificate store by default, and a single missed `default-features = false` pulls it back in silently. A manual check passes on the day it is made and is stale on the next lockfile change. A ban is checked on every CI run, names the decision in the failure message, and is reviewed in the same diff as the dependency change that breaks it.

## EXAMPLE
`deny.toml`:

```toml
[bans]
multiple-versions = "warn"
wildcards = "deny"
allow-wildcard-paths = true   # workspace crates depend on each other by path
deny = [
    { name = "some-agpl-crate", reason = "AGPL-3.0-only" },
    { name = "aws-lc-sys", reason = "this project uses the ring crypto provider" },
    { name = "aws-lc-rs", reason = "this project uses the ring crypto provider" },
    { name = "webpki-roots", reason = "roots come from the OS store" },
    { name = "webpki-root-certs", reason = "roots come from the OS store" },
]
```

The manual check it replaces, which should now print "did not match any packages" and be needed only as a diagnostic:

```bash
cargo tree -i aws-lc-sys
cargo tree -i webpki-roots
```

CI runs `cargo deny check` (or at least `check bans`) on every push. A licence entry that is deliberately absent from `[licenses] allow` (for example the licence of the banned roots crate) backs the same decision from the other side.

## CHECK
- [ ] `deny.toml` has a `[bans] deny` list naming each crate an architectural decision excludes, each with a `reason`.
- [ ] CI runs `cargo deny check bans` and fails the build on a violation.
- [ ] Adding one banned crate to a scratch branch (for example by enabling the default TLS feature of an SDK) turns the check red.

## IMPLEMENT
1. List the architecture decisions that are expressed as "the build must not contain X".
2. For each, find every crate that would bring X in (`cargo tree -i <crate>` on a branch that does the wrong thing) and add each to `[bans] deny` with a one-line `reason`.
3. Run `cargo deny check bans` locally; fix any real hit by turning off default features on the offending dependency rather than removing the ban.
4. Add the command to CI and to the local `check` recipe.
5. Prove the gate fires once: enable the forbidden feature on a scratch branch and confirm the failure names the ban.

## NOTES
`[graph] all-features = false` means a ban only sees the features your build enables. Add a job with `--all-features` if optional features are shipped. A ban does not replace reading `cargo update` diffs. Related: `npm-audit-prod-ci-prune-unused.md`.
