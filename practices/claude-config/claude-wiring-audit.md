# Claude wiring audit: a portable checklist for any repo

A procedure for auditing another repo's `.claude/` setup against the failure modes found
in tcg on 2026-07-28. Everything here is repo-agnostic.

**The premise.** Rule scoping and hooks fail **silently** when miswired. There is no
startup validation, no warning, and a dead rule or hook is indistinguishable from a
working one. So the failure mode is never "it broke" -- it is "it never worked, and the
repo has been operating for months as though it did." Reading the config does not catch
it, because the config *looks* right. That is the whole problem.

**The trap this creates.** When enforcement is quietly dead, humans conclude the model is
ignoring the rules and respond by adding more rules and stronger wording. That inflates
always-on context, which lowers the salience of every rule including the ones that work.
The intervention makes the symptom worse. Audit before adding anything.

> **Contract note.** Checks A, C, H and I below encode Claude Code behaviour as observed
> **2026-07-28**. If the product changes, these become wrong. Re-verify before trusting
> them on a much later date, and update rather than deleting a failing assertion.

> **Exclude worktrees from every grep here.** Agent worktrees are full checkouts, so they
> carry stale copies of `.claude/` and will report defects you already fixed. Append
> `| grep -v '\.claude/worktrees/'` to any command below that scans a directory tree.
> This bit during the first run of this very checklist.

---

## Phase 1: automated (5 minutes)

Copy `scripts/check-claude-wiring.mjs` from tcg into the target repo. It is dependency-free
(node built-ins only) with no hardcoded paths, so it runs as-is.

```bash
node scripts/check-claude-wiring.mjs; echo "exit=$?"
```

It covers checks A-C and reports E. Expect real findings on any repo that has never run
it. Then wire it in permanently:

```json
// package.json
"check:claude": "node scripts/check-claude-wiring.mjs"
```

```yaml
# .github/workflows/ci.yml -- BEFORE install/build, so it fails fast
- name: Claude wiring guard (rule scoping + hook matchers)
  run: pnpm run check:claude
```

### A. Rule frontmatter format

`paths:` is the only scoping key Claude Code reads. Cursor's `.mdc` keys (`globs:`,
`alwaysApply:`) are silently ignored, which means the file loads in **every** session --
the exact inverse of `alwaysApply: false`.

```bash
grep -rln 'globs:\|alwaysApply:' .claude/rules/     # any hit is a bug
```

**Fix.** Convert `globs:` to `paths:`. For a rule that genuinely should always load,
**delete the frontmatter entirely** -- that is what unconditional loading looks like on
purpose. Do not convert an `alwaysApply: true` file to `paths:`; that silently scopes a
rule meant to be global.

### B. Dead globs

A `paths:` glob matching zero files is a rule that can never fire, and it looks identical
to one that simply has not been triggered yet. Very common after a refactor, or when
rules were generated from a template rather than the actual tree.

```bash
# spot-check by hand
ls -d src/** dashboard/src/** 2>/dev/null | head
```

**Fix.** Point the glob at real directories, or drop it. In tcg one rule was scoped to
`lib/`, `app/`, `worker/`, `api/` -- none of which existed -- while omitting the directory
holding 1,053 files.

### C. Hook matcher syntax

A hook `matcher` matches the **tool name** (`Edit`, `Write|Edit`, `Bash`). The
`Tool(pattern)` form is `permissions` syntax; in a matcher it matches nothing and the hook
never runs.

```bash
python3 -c "
import json;d=json.load(open('.claude/settings.json'))
[print(ev, m.get('matcher')) for ev,b in d.get('hooks',{}).items() for m in b if m.get('matcher')]"
```

Any matcher containing `(` is dead.

**Fix.** `matcher: "Bash"` for the tool, then `if: "Bash(git commit*)"` on the individual
handler for argument filtering. **Also self-filter inside the script** -- `if` fires
conservatively on commands containing opaque substitutions, and it matches any subcommand
of a compound command (`git add X && git commit` fires it).

### E. Always-on context budget

Reported by the script. Target: **under ~10k tokens**. Above that, individual rules stop
being salient regardless of wording.

The biggest single lever is usually `@` imports in `CLAUDE.md` -- they are unconditional
and are easy to miss because they cause no *violation*, only cost. In tcg two imports were
10,325 tokens, 48% of the entire budget, loaded during Docker and CSS work.

```bash
grep -n '^@' CLAUDE.md
```

---

## Phase 2: manual (30 minutes, the script cannot do these)

### F. Has any hook ever actually run?

The decisive test. Hook stdout does not reliably surface in a tool result, so a file
marker is the only honest check.

```bash
# temporarily prepend to a hook command in settings.json:
#   printf '[%s] fired\n' "$(date +%s)" >> /tmp/hook-probe;
# then trigger it (edit a file / make a commit) and:
cat /tmp/hook-probe
```

Empty means dead. **Do this once per distinct matcher**, not once per repo. In tcg, six
hooks across two matchers had never executed.

### G. Silenced hooks

```bash
grep -n '2>/dev/null.*|| true' .claude/settings.json
```

That combination discards the error stream *and* the exit code, making every future
breakage unfalsifiable. In tcg it hid three stacked defects in one hook for months.

**Fix.** Let it fail loudly, or log to a file. Never silence a hook you have not first
watched succeed.

### H. Hooks that shell out with a path

There is **no `$CLAUDE_FILE_PATH`**. Hook input arrives as JSON on stdin
(`tool_input.file_path`). The variable expands to `""`, and an empty path is **not** a
no-op -- `biome/prettier/eslint --write ""` walks the entire repo. With parallel agent
sessions that can overwrite another session's in-progress work.

```bash
grep -rn 'CLAUDE_FILE_PATH' .claude/ | grep -v '\.claude/worktrees/'
```

**Read each hit before calling it a bug.** Using the variable as a *fallback* alongside
stdin parsing (`path="${CLAUDE_FILE_PATH:-}"; [ -z "$path" ] && path=$(parse stdin)`) is
correct and defensive. The bug is using it as the **only** source, because then it is
always empty.

**Fix.** Resolve from stdin, then hard-guard: `[ -n "$path" ] || exit 0` before shelling
out. Applies to any hook interpolating a path, not just formatters.

### I. Blocking hooks must write to stderr

A blocking hook (exit 2) has its **stdout discarded**. Write the message inside
`{ ... } >&2`, or the user gets a refused command with no reason attached.

```bash
grep -rln 'exit 2' .claude/scripts/ | xargs grep -Ln '>&2'   # files that block without stderr
```

### J. Prose pointers with no trigger

The class of rule most reliably ignored: an instruction to go read something, with nothing
that fires at the moment it matters.

```bash
grep -rn 'Check \|Read \|Review ' CLAUDE.md | grep '\.md'
```

For each, ask: **what makes this fire?** If the answer is "the model remembers," it will
not fire. Convert to a path-scoped rule, or inline the 5-10 lines that actually carry the
constraint.

Measure before assuming size is the blocker. In tcg, RULE 2 pointed at a "788 KB"
directory that was **71% PNG screenshots**; the actual README was 224 lines. It was skipped
for lack of a trigger, not for size.

### K. Do the referenced docs describe reality?

A doc that documents an abandoned convention is worse than no doc, because a session that
follows it writes a **third** inconsistent pattern.

```bash
# example: does the documented error shape match the code?
grep -rhoE 'error: *"' src/ | wc -l          # bare string
grep -rhoE 'error: *\{ *message' src/ | wc -l # structured
```

In tcg the ratio was 829 : 26 against the documented shape, and only **one line** of a
63-line doc was wrong -- which is what made it dangerous. The 19 correct rules around it
lent the wrong one credibility.

### L. Is the enforcement already there?

Before adding a hook, grep for an existing gate. In tcg a save-time 500-line check was
built while CI had enforced the same rule all along.

```bash
ls scripts/ .github/workflows/
grep -rn 'check:\|guard' package.json
```

If CI already enforces it and violations still ship, the real problem is that **CI failing
is not blocking merges** -- a different and more interesting problem than a missing rule.

### M. Worktrees inside the repo

```bash
git worktree list
du -sh .claude/worktrees/ 2>/dev/null
```

Worktrees are full checkouts, so each carries its own `biome.jsonc` / `eslint.config.js`.
Tools that discover configs by traversal abort on a nested root config. They also inflate
every `find`-based scan (tcg: 13,089 files reported vs 993 real).

**Fix.** Exclude the tree in the tool's own config (`"!.claude/worktrees"` -- note: **no**
trailing `/**` in Biome 2.2.0+). Prune stale worktrees, but check for uncommitted work
first; `git worktree remove` preserves branch refs, so only uncommitted work is at risk.

### N. Is the knowledge-base fetch pointing at the right shelf?

If the repo auto-loads LL-G/BP entries, check **which** technologies.

```bash
grep -n 'TECHS=' .claude/scripts/*.sh
```

tcg fetched `typescript nodejs bash` and omitted `claude-code` -- the one index most
relevant to editing `.claude/`. The cost: LL-G already documented the hook-matcher gotcha
*and* its fix, and the session rediscovered both from scratch. A knowledge base only helps
if the slice you load is the slice you need.

---

## Findings template

| # | Check | Finding | Severity | Fix | Done |
|---|---|---|---|---|---|
| A | frontmatter | | | | |
| B | dead globs | | | | |
| C | hook matchers | | | | |
| E | always-on budget | | | | |
| F | hooks ever fired | | | | |
| G | silenced hooks | | | | |
| H | path interpolation | | | | |
| I | blocking → stderr | | | | |
| J | untriggered pointers | | | | |
| K | doc vs reality | | | | |
| L | duplicate enforcement | | | | |
| M | worktrees | | | | |
| N | KB fetch scope | | | | |

## What good looks like

- `check:claude` exits 0 and runs in CI
- always-on context under ~10k tokens
- every hook has been probed once and observed to fire
- no `2>/dev/null || true` on a hook you have not watched succeed
- every referenced doc spot-checked against the code within the last quarter
- rules that matter have a **gate**, not just emphatic prose

## What this does NOT fix

Everything above addresses **delivery** -- content that never arrived, enforcement that
never ran. It does not address the residual case: **a rule that IS loaded and gets skipped
anyway.** That is real. It happened twice in the tcg session that produced this document,
including building a checker without noticing CI already had one.

The pattern in the evidence, offered as a working hypothesis rather than a finding:
**salience tracks mechanism, not wording.** Every rule complied with had a gate firing at
the moment of the action; every rule missed was prose, however many times it said
MANDATORY. Confound worth holding: the gated rules also have *sharp* triggers (a commit, a
save) while prose rules have fuzzy ones ("before starting UI work"). Both point the same
way for remediation, but they are different claims.

Practical consequence: when a rule is chronically ignored, **convert it to a gate** rather
than restating it more forcefully. If it cannot be gated, inline the few lines that carry
the constraint at the point of use.

## Related

- LL-G: `kb/claude-code/hook-matcher-tool-names-only.md`,
  `kb/claude-code/cursor-frontmatter-keys-ignored.md`,
  `kb/claude-code/hook-empty-path-formats-repo.md`
- BP: `practices/claude-config/verify-claude-wiring-in-ci.md`
- tcg case study: `tasks/claude-context-remediation.md`
