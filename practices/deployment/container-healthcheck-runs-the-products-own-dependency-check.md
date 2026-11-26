---
concern: deployment
tech: [docker, docker-compose, healthcheck]
priority: recommended
applies-to: [docker, docker-compose]
---
# Make the container health check run the product's own dependency check, and fail on any error

## PATTERN
Give the binary a `check` subcommand that exercises every start-up dependency and exits non-zero on any failure, then use it as the container health check:

```yaml
healthcheck:
  test: ["CMD", "app", "check"]
```

The command validates the configuration, confirms the database login is the restricted role, reads each queue, lists a key under each object-storage prefix, and reads the mail provider's sending status. Every check runs even if an earlier one failed (so one run lists every problem), passes print `ok   <name>` on stdout, failures print `FAIL <name>: <reason>` on stderr, and the exit code is non-zero if any failed. "Healthy" then means every dependency answered correctly, not that the process is alive or that no known-bad string appeared.

## WHY
A health check that looks for one known-bad signature (a log line, a status code, a specific error text) is a denylist: it fires on transient errors it does not recognise, and stays green on new failure modes it was never taught. A check that asserts the dependencies actually work is an allowlist and cannot be fooled by an error it has not seen. Because the same command is what an operator runs by hand, a red health check is diagnosed with one command and one readable line per dependency, and a deploy script can wait for `healthy` knowing it means something.

## EXAMPLE
`compose.yaml`:

```yaml
services:
  app:
    command: ["serve"]
    healthcheck:
      test: ["CMD", "app", "check"]
      interval: 60s
      timeout: 20s      # the check makes several remote calls
      retries: 3
      start_period: 30s
      start_interval: 5s   # probe every 5 s while starting, so a deploy sees `healthy` in seconds
```

The check's output, one line per dependency:

```text
ok   config
ok   database role (restricted, no BYPASSRLS)
ok   queue inbound
ok   queue events
ok   object storage inbound/
ok   mail provider sending status
```

A failure keeps going and reports all problems, then exits 1:

```text
FAIL queue events: access denied
```

A deploy script waits on the container's health and, on failure, prints the last health results so the failing line is visible:

```bash
docker inspect --format '{{range .State.Health.Log}}{{.ExitCode}} {{.Output}}{{end}}' "$cid"
```

## CHECK
- [ ] The image or compose file declares one `healthcheck` that runs a command shipped in the product itself.
- [ ] The command fails (non-zero) when the config is invalid, a credential is wrong, or any listed dependency cannot be reached; revoke one permission on a test environment and confirm it goes unhealthy.
- [ ] The health check does not grep for a single known error string.
- [ ] `timeout` exceeds the slowest dependency call, and `start_period` covers startup.

## IMPLEMENT
1. Add a `check` subcommand that builds the same clients as the server and performs one cheap, read-only call per dependency (no writes, no sends).
2. Run all checks even after a failure; print `ok`/`FAIL` lines; exit non-zero if any failed. Never print a secret in a reason.
3. Point the compose or Dockerfile health check at it with `interval`, `timeout`, `retries` and `start_period` sized for the remote calls.
4. Have the deploy script wait for `healthy` and dump `State.Health.Log` on failure.
5. Test the check against mocked clients for both a passing and a failing dependency.

## NOTES
Every probe makes real remote calls, so keep the interval long once started (a minute) and use `start_interval` only for the start period. Keep the probes read-only so a health check can never change state or incur cost.
