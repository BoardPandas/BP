---
concern: claude-config
tech: [claude-code, node, ci]
priority: foundational
source-repo: tcg
applies-to: [claude-code, any-repo-with-dot-claude]
---
# Verify the .claude Wiring in CI, Do Not Trust That It Works

## PATTERN
Treat `.claude/` as executable configuration and gate it in CI, exactly like a build.
A dependency-free script asserts the properties that fail SILENTLY:

1. **No rule uses Cursor `.mdc` keys.** `paths:` is the only scoping key Claude Code
   reads. `globs:` / `alwaysApply:` are ignored, so `alwaysApply: false` makes the file
   load in EVERY session -- the inverse of what it says.
2. **Every `paths:` glob matches at least one real file.** A glob matching nothing is a
   rule that can never fire, and it is indistinguishable from one that simply has not
   been triggered yet.
3. **Every hook matcher is a bare tool name** (`Edit`, `Write|Edit`, `Bash`). The
   `Tool(pattern)` form is `permissions` syntax; in a `matcher` it matches nothing and
   the hook never runs. Argument filtering belongs in the per-handler `if` field.
4. **The always-on context budget is reported**, and warns past a ceiling.
5. **Hooks that silence both stderr and exit code are flagged** (`2>/dev/null || true`),
   because that combination makes every future breakage unfalsifiable.

Run it pre-install as a fail-fast gate, alongside other cheap guards.

## WHY
Every one of these fails without an error message. There is no startup validation, no
warning, and a dead rule or hook is indistinguishable from a passing one. So the failure
mode is not "it broke" -- it is "it never worked, and the repo has been operating for
months as though it did." Reviewing the config by eye does not catch it, because the
config *looks* correct; that is the whole problem.

The cost compounds in a specific way: when the enforcement layer is quietly dead, humans
conclude the model is ignoring the rules, and respond by adding more rules and stronger
wording. That inflates always-on context, which reduces the salience of every rule
including the ones that do work. The intervention makes the symptom worse.

Measured on the source repo before this gate existed:
- **9 of 15** rule files loaded unconditionally (Cursor keys or no frontmatter)
- **5 globs** matched zero files, so those rules had never fired
- **all 5** `git commit` hooks plus format-on-save had never executed once
- **~21.7k tokens** of always-on context before the user typed anything

Adding the gate and fixing what it found cut always-on context by 53%. Note the second
number is the more damning one: changelog discipline had been followed on 24 consecutive
commits, which everyone read as proof the changelog hook worked. It had never run. A rule
being obeyed is not evidence that its enforcement mechanism executes.

## EXAMPLE
`scripts/check-claude-wiring.mjs` (node built-ins only, no deps, no repo-specific paths):

```js
// 1. Cursor keys invert scoping
if (front && /^\s*(globs|alwaysApply)\s*:/m.test(front)) {
  errors.push(`${file}: uses Cursor .mdc keys. Claude Code ignores them, so this loads
    in EVERY session -- the opposite of alwaysApply:false. Use paths:.`);
}

// 2. dead globs
const hits = globSync(g, { exclude: (p) => p.includes("node_modules") }).length;
if (hits === 0) errors.push(`${file}: glob ${JSON.stringify(g)} matches 0 files.`);

// 3. hook matchers must be tool names
const TOOL_MATCHER = /^[A-Za-z][A-Za-z0-9_]*(\|[A-Za-z][A-Za-z0-9_]*)*$/;
if (m !== undefined && !TOOL_MATCHER.test(m)) {
  errors.push(`${event} matcher ${JSON.stringify(m)} is not a tool name;
    Tool(pattern) is permissions syntax and matches nothing.`);
}
```

`.github/workflows/ci.yml` -- pre-install so it fails fast:

```yaml
      - name: Claude wiring guard (rule scoping + hook matchers)
        run: pnpm run check:claude
```

`package.json`:

```json
"check:claude": "node scripts/check-claude-wiring.mjs"
```

## CHECK
How to verify if a repo already follows this:
- [ ] A script asserts rule frontmatter uses `paths:` and not `globs:` / `alwaysApply:`
- [ ] Every `paths:` glob is checked against the filesystem for at least one match
- [ ] Hook matchers are validated as bare tool names
- [ ] The always-on context total is measured and has a stated ceiling
- [ ] The check runs in CI, not just locally
- [ ] At least one hook has been empirically probed (file marker) rather than assumed

## IMPLEMENT
1. Copy `scripts/check-claude-wiring.mjs` into the repo. It has no dependencies and no
   hardcoded paths, so it runs as-is.
2. Add `"check:claude": "node scripts/check-claude-wiring.mjs"` to `package.json`.
3. Run it once locally and fix what it finds. Expect real findings on any repo that has
   never run it; treat a dead glob as a decision to make, not noise to silence.
4. Wire it into CI **before** the install/build steps so it fails fast.
5. Probe each hook once with a file marker (`printf '%s\n' "$path" >> /tmp/hook-probe`)
   and confirm it actually fires. Hook stdout does not reliably surface in a tool result,
   so a file marker is the only honest test.
6. Set the always-on ceiling to something slightly above current reality, so growth is a
   deliberate decision rather than slow accretion.

## NOTES
- Checks 1 and 3 encode Claude Code's frontmatter and hook-matcher contract as observed
  2026-07-28. If that contract changes, this guard is what tells you -- update it
  deliberately rather than deleting the failing assertion.
- The guard cannot detect the residual case: a rule that IS loaded and gets skipped
  anyway. That is a real and separate problem. The observed correlation is that salience
  tracks MECHANISM, not wording: rules with a gate firing at the moment of the action get
  followed, prose rules do not, however many times they say MANDATORY. Prefer converting
  a chronically-ignored rule into a hook over restating it more forcefully.
- Complements `path-scoped-rules.md` and `hook-configuration.md`, which cover how to
  author these; this covers proving they work.
- Related gotchas: `kb/claude-code/cursor-frontmatter-keys-ignored.md`,
  `kb/claude-code/hook-matcher-tool-names-only.md`,
  `kb/claude-code/hook-empty-path-formats-repo.md` in LL-G.
