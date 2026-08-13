---
concern: resource-lifecycle
tech: [node, typescript, express, mcp, docker]
priority: recommended
source-repo: BoardPandas/MCP
applies-to: [node, typescript, long-running-servers, websocket-servers, session-brokers]
---
# Every long-lived in-memory resource needs an owner, a TTL, a cap, and a drain

## PATTERN

Any resource a server holds across requests — a session map, a connection pool, a cache, a
spawned child process, a subscription, a timer — needs all four of these. Three out of four
still leaks.

1. **Owner.** Exactly one place is responsible for release, and releasing it cascades to
   everything it owns. If a session owns a child process and a credential, closing the
   session must kill the process and revoke the credential.
2. **TTL.** A `lastSeenAt` stamp refreshed on use, plus a sweeper that releases anything
   past the window. Never let release depend on a remote peer choosing to say goodbye.
3. **Cap.** A per-principal limit and a global limit, enforced **before** acquisition, not
   after. Return a typed rejection rather than allocating and hoping.
4. **Drain.** A signal handler that releases everything on `SIGTERM`/`SIGINT`, clearing
   timers *first* so nothing fires against half-torn-down state.

The rule of thumb: **if the only thing that frees a resource is a well-behaved peer, it will
leak.** Peers close laptops, lose networks, and get OOM-killed themselves.

## WHY

- **Politeness is not a lifecycle.** Protocols that end a session on an explicit
  disconnect message (MCP streamable-HTTP's `DELETE`, WebSocket close frames, "unsubscribe"
  calls) only cover cooperative clients. The uncooperative ones are exactly the ones you
  must survive.
- **Off-heap resources are invisible to the tools you will reach for.** A leaked child
  process, socket, or file handle never appears in a heap snapshot and never triggers V8's
  heap-limit path. The container is SIGKILLed by the cgroup OOM killer — exit 137, no stack,
  no `JavaScript heap out of memory` banner, nothing in the application log. Engineers lose
  hours to heap profiling and `--max-old-space-size` for a leak that was never on the heap.
- **Idle leaks hide from metrics.** Idle child processes hold tens of MB while burning
  almost no CPU, so a CPU graph stays flat right up to the kill.
- **Caps turn an outage into an error message.** Without one, a client stuck in a
  reconnect loop takes the whole service down; with one, it gets a 429 and everyone else
  keeps working.
- **Without a drain, every deploy orphans resources** and hands the mess to the container
  runtime, which is also why shutdown bugs stay invisible in development.

## EXAMPLE

`packages/mcp-bridge/src/gateway/sessions.ts` — TTL and sweeper:

```ts
interface BridgeSession { transport: Transport; userId: string; lastSeenAt: number }
const sessions = new Map<string, BridgeSession>();

export function touchSession(id: string): void {
  const s = sessions.get(id);
  if (s) s.lastSeenAt = Date.now();          // stamp per request, not per open stream
}

export async function sweepIdleSessions(idleMs: number): Promise<number> {
  const cutoff = Date.now() - idleMs;
  const stale = [...sessions.entries()].filter(([, s]) => s.lastSeenAt < cutoff);
  for (const [id, s] of stale) {
    sessions.delete(id);                     // drop first, so a close() that never fires
    try { await s.transport.close(); }       // its callback cannot pin the entry forever
    catch (err) { console.error("[sessions] close failed:", err); }
  }
  return stale.length;
}

// unref() so the sweeper never holds the event loop open; the caller must clear it first.
export function startSessionSweeper(intervalMs: number, idleMs: number): () => void {
  const h = setInterval(() => void sweepIdleSessions(idleMs).catch(console.error), intervalMs);
  h.unref();
  return () => clearInterval(h);
}
```

`packages/mcp-bridge/src/gateway/router.ts` — cap before acquisition:

```ts
if (sessionCount() >= MAX_SESSIONS_TOTAL) {
  return res.status(503).json(rpcError("Server at session capacity; retry shortly"));
}
if (countSessionsForUser(userId) >= MAX_SESSIONS_PER_USER) {
  return res.status(429).json(rpcError(`Too many concurrent sessions (max ${MAX_SESSIONS_PER_USER}).`));
}
// ...only now spawn the child / allocate the resource
```

`packages/mcp-bridge/server.ts` — drain, in the order that matters:

```ts
const stopSweeper = startSessionSweeper(60_000, 30 * 60_000);

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;                  // a second SIGTERM must not re-enter
  shuttingDown = true;
  stopSweeper();                             // 1. timers first
  server.close();                            // 2. stop accepting
  await closeAllSessions();                  // 3. release, cascading to children
  process.exit(0);
};

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    const t = setTimeout(() => process.exit(1), 10_000);  // backstop for a wedged release
    t.unref();
    void shutdown(signal);
  });
}
```

## CHECK

How to verify if a repo already follows this:

- [ ] Grep for long-lived state: `new Map(`, `new Set(`, connection pools, `spawn(`, `fork(`.
      For each, ask what deletes an entry — if the only answer is a callback fired by a
      remote peer's goodbye message, it leaks.
- [ ] Confirm a TTL exists: is there a `lastSeenAt`/`updatedAt` field and something that
      reads it on an interval? `grep -rn "setInterval\|lastSeen\|idle\|ttl" src/`
- [ ] Confirm caps exist and are checked *before* allocation, not after.
- [ ] Confirm a drain exists: `grep -rn "SIGTERM\|SIGINT" src/ server.*`. If nothing
      matches, every deploy orphans whatever the process held.
- [ ] Confirm sweeper intervals are `unref()`'d and cleared in the shutdown path.
- [ ] Check the deploy logs for `exit 137` with no `JavaScript heap out of memory` banner —
      that combination is a cgroup OOM on off-heap resources and is the symptom of this gap.

## IMPLEMENT

1. Inventory every cross-request resource and write down, for each, the single place that
   releases it. Anything with no answer, or whose answer is "the client tells us", is the bug.
2. Add a `lastSeenAt: number` to the record and stamp it in the request path, after auth
   passes and before the handler runs.
3. Write the sweeper as a plain exported function taking the idle window as a parameter, so
   it is unit-testable without timers. Have it delete the map entry *before* awaiting
   release, and catch release errors per item so one failure cannot abort the sweep.
4. Start it with `setInterval(...).unref()` and return a stop function. Do not start timers
   at module load — start them where you can also stop them.
5. Add per-principal and global caps in the acquisition path, before allocating, each with a
   distinct status code (429 vs 503) so the two are distinguishable in logs.
6. Add the signal handler: clear timers, stop accepting, release everything, exit — with a
   re-entry guard and an `unref()`'d force-exit backstop.
7. Test the eviction logic directly with a fake resource whose `close()` is a spy, including
   the case where `close()` rejects. Mutation-check it: neuter the cutoff and confirm the
   eviction tests actually fail.

## NOTES

- **Pick the touch granularity deliberately.** Stamp per *request*, not per open stream. A
  session holding one idle stream past the window is idle by any useful definition. Be aware
  this is user-visible: an idle client now gets disconnected and must reconnect, so choose a
  window generous enough (30 min is a reasonable default) that normal use never notices.
- **Raising the memory limit is not a fix.** It buys time proportional to the increase and
  does not change the slope. Ship it as a stopgap while the reaping lands, and say so.
- **Verify the drain on the deploy after the one that ships it.** The pod being replaced
  when you deploy the handler is still running the old code, so the first deploy proves
  nothing — look for the drain log lines on the *next* one.
- Related LL-G entries: `kb/mcp/session-and-child-leak-without-delete.md` (the failure this
  prevents, with the exit-137 diagnosis) and `kb/nodejs/` on timers outliving graceful
  shutdown (why `stopSweeper()` comes first).
