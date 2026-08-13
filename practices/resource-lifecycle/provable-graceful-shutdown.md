---
concern: resource-lifecycle
tech: [node, typescript, docker, dumb-init, kubernetes]
priority: recommended
source-repo: BoardPandas/MCP
applies-to: [node, typescript, containerized-servers, long-running-servers]
---
# Make graceful shutdown provable from outside the process

## PATTERN

A drain you cannot observe is a drain you do not have. Writing the handler is the easy half;
the hard half is arranging for its success and failure to be **distinguishable in the logs of
a running container**. Four rules:

1. **`exec` the app** so it is the process the supervisor waits on. Any wrapper that must
   outlive it (notably `sh -c "start || fallback"`) becomes the supervised process instead,
   and shells do not forward SIGTERM — they die, and PID 1 tears the container down
   mid-drain. Decide fallbacks *before* exec, never as an `||` retry after.
2. **`process.exitCode = 0`, never `process.exit(0)`.** Container stdout is a pipe, so writes
   are asynchronous and `exit()` discards whatever is buffered — including the line that says
   the drain finished. Set the code and let the loop empty.
3. **Release idle keep-alive sockets** (`server.closeIdleConnections()`), or the loop never
   empties and every clean drain hits the timeout instead. Rule 2 without rule 3 just trades
   one wrong answer for another.
4. **Emit an application-level line that states the outcome** — `closed N session(s); exiting`
   — and treat *that*, not the exit code, as the source of truth.

## WHY

- **The exit code is not yours.** It passes through every wrapper between your process and
  the runtime, and they overwrite it. Observed in one service: `sh -c` dying on SIGTERM
  reported **143**; after `exec`, `doppler run` reported its own **255**; the app's `0` never
  surfaced once. A check that asserts "exit 0 means clean" will be wrong in both directions.
- **Silence reads as failure, and sends you to fix what already works.** The opening
  "SIGTERM received" line survives (time passes before the exit) while the closing line is
  discarded microseconds later. Every visible signal says cut off mid-flight. Three
  hypotheses were live for that gap — truncated stdout, a rewritten exit code, a chain dying
  early — and none could be separated from outside until the handler was made to say so.
- **Local signal tests answer the wrong question.** `kill -TERM <pid>` tests forwarding down
  a chain; `dumb-init` broadcasts to the whole **process group**, signalling every wrapper
  simultaneously with the app. A layer can pass the first and fail the second, so a green
  local test reads as proof and is not. `--single-child` makes production match what you
  actually verified.
- **The first deploy of a shutdown handler proves nothing.** The pod being replaced is still
  running the *old* code. Only the deploy *after* exercises it — a trap that quietly defers
  discovery by one release.

## EXAMPLE

`packages/mcp-bridge/server.ts`:

```ts
const shutdown = async (signal: string) => {
  if (shuttingDown) return;              // a second signal must not re-enter
  shuttingDown = true;
  console.log(`[mcp-bridge] ${signal} received; draining sessions`);

  stopSweeper();                         // timers first, before state is torn down
  server.close();
  server.closeIdleConnections();         // else the loop never empties

  try {
    const closed = await closeAllSessions();
    console.log(`[mcp-bridge] closed ${closed} session(s); exiting`);   // the real signal
  } catch (err) {
    console.error("[mcp-bridge] error draining sessions:", err);
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;                  // NOT process.exit() -- it would eat the line above
};

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    const t = setTimeout(() => {
      console.error(`[mcp-bridge] drain timed out after ${signal}; forcing exit`);
      process.exit(1);
    }, 8_000);
    t.unref();                           // a backstop must not itself pin the loop
    void shutdown(signal);
  });
}
```

`packages/mcp-bridge/Dockerfile`:

```dockerfile
# Fallback decided BEFORE exec, so the app is what PID 1 waits on.
# --single-child hands the signal down link-by-link instead of broadcasting to the group.
CMD ["dumb-init", "--single-child", "--", "sh", "-c", \
     "if probe-secrets >/dev/null 2>&1; then exec run-with-secrets -- app; else exec app; fi"]
```

Verifying the shape without deploying — drive the **actual** CMD string, parsed out of the
Dockerfile rather than retyped, against a real server with a keep-alive socket held open:

```bash
CMDSTR=$(python3 -c "
import json
line=[l for l in open('Dockerfile').read().splitlines() if l.startswith('CMD [')][0]
print(json.loads(line[4:].strip())[-1])")

sh -c "${CMDSTR//app.ts/harness.ts}" > out.log 2>&1 &
SH=$!; sleep 4
curl -s -o /dev/null --keepalive-time 60 http://127.0.0.1:3999/healthz
kill -TERM $SH; wait $SH; echo "exit: $?"      # want 0 AND both log lines in out.log
```

## CHECK

How to verify if a repo already follows this:

- [ ] `grep -n "process.exit" src/ server.*` — any `process.exit(0)` on a success path is a
      truncation bug waiting to happen. Backstop/error paths are fine.
- [ ] Does the shutdown path call `closeIdleConnections()` (or otherwise release keep-alives)?
      Without it, `exitCode` alone hangs until the timeout.
- [ ] Does the Dockerfile `CMD` reach the app through `exec`? A `cmd || fallback` cannot, by
      construction.
- [ ] Does the handler log a distinct line for success, for a drain error, and for the
      timeout? If all three are silent or identical, the logs cannot tell you which occurred.
- [ ] Pull the last deploy's logs and look for the completion line. Its absence — with the
      opening line present — is this exact bug.

## IMPLEMENT

1. Add the outcome log line first, before changing anything else. It is what tells you
   whether the later changes worked.
2. Replace success-path `process.exit(0)` with `process.exitCode = 0`, and add
   `server.closeIdleConnections()` after `server.close()` in the same commit — separately,
   the first change converts a missing line into a hung shutdown.
3. Restructure the `CMD` so the app is `exec`'d, moving any `||` fallback to a pre-flight
   check that picks a branch and execs into it.
4. Add `--single-child` (or equivalent) so signals travel the chain rather than broadcasting.
5. Verify by extracting the CMD string from the Dockerfile and running it against a harness
   with a live keep-alive connection. Assert both the exit code and the presence of the
   completion line.
6. Deploy, then **restart once more** and read the logs — the deploy that ships the handler
   drains the previous version, so only the following restart exercises it.

## NOTES

- Expect the exit code to still be "wrong" after all this if a wrapper sits above you; that
  is cosmetic once the log line is trustworthy. Do not chase it into the wrapper unless
  something downstream keys on exit status.
- Sequence of symptoms seen while getting this right, all from one service, each looking like
  a different bug: exit 143 with no drain line (shell supervised) → exit 143 with the opening
  line only (stdout truncated) → completion line present, exit 255 (wrapper rewrote the code).
  Only the last is healthy and it is the one that still looks broken.
- Companion to `owner-ttl-cap-drain.md`, which covers *having* a drain; this covers proving
  it. Related failure detail in LL-G:
  `kb/nodejs/process-exit-truncates-shutdown-log.md`.
