---
concern: deployment
tech: [python, bash, smoke-tests, secrets, live-checks]
priority: recommended
applies-to: [live-checks, smoke-tests, deploy-verification, secrets-management]
---
# Live-check scripts hold secrets in memory only and guard their own output

## PATTERN
A script that checks a real deployment (signs in, obtains tokens, calls authenticated endpoints) handles real secrets and prints a lot. It follows three rules:

1. **Secrets live in memory only.** Values obtained during the run (passwords, tokens, device credentials, one-time codes) are kept in variables and registered with one in-process registry. They are never written to disk, a temp file, an environment file or the shell history.
2. **Every printed line passes through a scrubber, and a scrub is a failure.** One output function is the only way the script prints. It removes any registered secret from the line before printing. If it had to remove anything, that is counted, and a non-zero count makes the whole run fail: a secret reached the output path, and the scrubber only limited the damage.
3. **No child process may receive a secret in its arguments.** The one function that starts child processes inspects the argument list first and refuses to start the process if any argument contains a registered secret.

## WHY
Live-check output is exactly what gets pasted into reports, tickets and chat, and captured by CI logs and agent transcripts. A secret in one failing assertion message or one echoed command line is then in several systems that cannot be cleaned. Scrubbing alone hides the symptom and lets the leak path stay; counting a scrub as a failure forces the path to be fixed. Arguments of child processes are visible to every user on the host through the process list, which no output scrubbing can undo, so that case must be refused before it happens.

## EXAMPLE
Generic sketch (Python):

```python
class Secrets:
    def __init__(self):
        self._values, self.scrubbed = [], 0

    def hold(self, value: str) -> str:              # register every secret the moment it exists
        if value:
            self._values.append(value)
        return value

    def scrub(self, line: str) -> str:
        for v in self._values:
            if v in line:
                line = line.replace(v, "[REDACTED]")
                self.scrubbed += 1                   # a scrub is a failure, reported at the end
        return line

    def check_argv(self, argv: list[str]) -> None:
        if any(v in arg for v in self._values for arg in argv):
            raise RuntimeError("refusing to start a child process with a secret in its arguments")

secrets = Secrets()

def out(line: str) -> None:                          # the ONLY print in the script
    print(secrets.scrub(line))

def run(argv: list[str], stdin: str | None = None):  # the ONLY way to start a process
    secrets.check_argv(argv)
    return subprocess.run(argv, input=stdin, text=True, capture_output=True)

# end of run:
if secrets.scrubbed:
    out(f"FAIL: {secrets.scrubbed} line(s) contained a held secret")
    sys.exit(1)
```

Captured output of child processes goes through `out` as well.

## CHECK
- [ ] The script writes no secret to disk, temp files or environment files.
- [ ] There is one output function; no other `print`/`echo` exists in the script.
- [ ] The output function removes held secrets and the run fails if it ever had to.
- [ ] There is one process-spawning function and it refuses arguments containing a held secret.
- [ ] A self-test feeds a held secret to the output function and to the spawner and sees the failure and the refusal.

## IMPLEMENT
1. Add the registry and register each secret where it is first obtained.
2. Replace every print with the scrubbing output function; lint or grep for stray prints.
3. Route every subprocess through the checking spawner; pass secrets to children on standard input instead.
4. Fail the run on a non-zero scrub count.
5. Add the self-test and run it in CI without real secrets.

## NOTES
Register derived forms too where they are equally sensitive (a base64 or URL-encoded copy of a token will not match the raw value). A negative scan of logs for secrets needs a control that must match; see LL-G `kb/bash/ssh-grep-f-dash-reads-patterns-from-the-pipe.md`.
