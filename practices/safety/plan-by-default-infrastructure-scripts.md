---
concern: safety
tech: [bash, aws-cli, infrastructure-as-scripts]
priority: recommended
applies-to: [bash, aws, cloud-infrastructure]
---
# Make infrastructure scripts plan-by-default: read-only unless --apply, every create behind an existence check

## PATTERN
A provisioning script that touches shared cloud resources follows five rules:

1. **Default mode is a plan.** With no flags the script makes only read-only calls and prints one line per resource: `create`, `update (what differs)`, `exists`, or `BLOCKED (why)`, followed by a count of each.
2. **`--apply` is the only way to change anything.** All mutating calls go through one wrapper that does nothing unless apply mode is on, so plan mode cannot mutate by accident.
3. **Every create is preceded by an existence check that tells "not found" from every other error.** The check matches the one expected not-found error code for that resource; any other failure (throttling, access denied, wrong region) stops the script instead of being read as "absent".
4. **Re-running is a no-op.** A second `--apply` reports `exists` for everything and zero creates or updates. The reconciler compares the desired document with the live one, so drift shows as `update`.
5. **An independent review precedes the first apply.** Someone (or a separate agent session) that did not write the script reads it and the plan output, looking for missing existence checks, secrets in output, and over-broad policies, and the findings are fixed before any `--apply`.

## WHY
Infrastructure scripts are the one kind of code whose first real run changes a shared environment and cannot be rolled back with `git revert`. A read-only default makes "run it and look" safe. Treating every error as "not found" is the classic failure: a transient or permission error looks like a missing resource, so the script tries to create something that exists, or worse, replaces it. The no-op second run is the cheap proof that the existence checks and the desired-state comparison agree. An independent review catches what the author's own plan output cannot, because the author already believes the script is right.

## EXAMPLE
`infra/lib.sh` (generic sketch):

```bash
# Read-only call that separates "not found" from real failures.
# Returns 0 if found (stdout in out_var), 1 if not found, dies on any other error.
aws_try_get() {
  local not_found_ere="$1" out_var="$2"; shift 2
  local rc=0
  aws "$@" --output json >"$WORK/out" 2>"$WORK/err" || rc=$?
  if (( rc == 0 )); then printf -v "$out_var" '%s' "$(cat "$WORK/out")"; return 0; fi
  if grep -Eq "$not_found_ere" "$WORK/err"; then printf -v "$out_var" ''; return 1; fi
  die "AWS read failed (aws $*): $(tr '\n' ' ' <"$WORK/err")"
}

# The only path to a mutation: a no-op unless --apply was passed.
apply_aws() { [[ "${APPLY:-false}" == "true" ]] && aws_mutate "$@" >/dev/null; return 0; }

report_create() { printf 'create   %s\n' "$1"; }
report_exists() { printf 'exists   %s\n' "$1"; }
```

```bash
if aws_try_get '\(404\)|\(NoSuchBucket\)|\(NotFound\)' out s3api head-bucket --bucket "$BUCKET"; then
  report_exists "s3 bucket $BUCKET"
else
  report_create "s3 bucket $BUCKET"
  [[ "$APPLY" == "true" ]] && aws_mutate s3api create-bucket --bucket "$BUCKET" >/dev/null
fi
```

Plan-mode output, then a second apply:

```text
$ ./bootstrap.sh            # read-only
create   s3 bucket example-stack-raw
create   sqs queue example-stack-inbound
Plan: 2 create, 0 update, 0 exists. Re-run with --apply to make these changes.

$ ./bootstrap.sh --apply && ./bootstrap.sh --apply
...
Apply: 0 create, 0 update, 14 exists.     # second run: nothing to change
```

Also worth copying: refuse to start if the environment already carries the runtime user's credentials (so the script cannot run as the wrong principal), set `set +x` and never echo a created secret, and write secrets only to the secret manager.

## CHECK
- [ ] Running the script with no arguments makes no mutating call and prints a per-resource create/update/exists list.
- [ ] Every mutating call goes through one wrapper gated on `--apply`.
- [ ] Each create is guarded by an existence check that matches a specific not-found error and fails on anything else.
- [ ] A second `--apply` on a converged environment reports no create and no update.
- [ ] The script was reviewed by someone other than its author before the first `--apply`.

## IMPLEMENT
1. Add `APPLY=false` and a `--apply` flag; make `apply_*` wrappers no-ops otherwise.
2. Write a `try_get` helper that takes the not-found pattern for that call and dies on any other error.
3. Write one reconciler per resource: read, compare with the desired document, report `exists`/`update`/`create`, and mutate only through the wrapper.
4. Print a summary with the four counts and, in plan mode, how to apply.
5. Run plan, review, apply, and apply again; the last run must show nothing to change.
6. Ask for an independent read of the script and a real plan output before the first apply; fix findings, then apply.

## NOTES
Existence checks do not detect resources that exist with the wrong settings; compare the full desired configuration per resource, as step 3 does, for anything with settings. Related: `read-only-first-rule.md` (the same discipline for an interactive agent); this entry applies it to a re-runnable script.
