---
concern: database
tech: [nodejs, typescript, postgres]
priority: recommended
applies-to: [any-single-replica-service-with-a-per-owner-cap]
---
# Enforce a per-owner cap by chaining count-then-insert per owner in process, and name the advisory-lock upgrade

## PATTERN
A per-owner cap ("at most N active tasks per user") done as `SELECT count(*)` followed by `INSERT` lets concurrent requests all pass the count before any insert lands. On a service that runs as one replica, serialise the pair per owner with an in-process promise chain:

- Keep a `Map<ownerId, Promise<void>>`.
- Assign the new chain link before any `await`, so a second caller in the same tick queues behind the first.
- Make every stored link settle without rejecting, so one failed call cannot wedge later ones.
- Delete the key when its chain drains, so the map is empty when idle.
- Write down that more than one replica needs a database-level lock instead (a transaction-scoped advisory lock keyed on the owner).

## WHY
The race is invisible in tests that issue requests one at a time and appears only under concurrency, where it lets an owner exceed the cap by the number of simultaneous requests. A chain is a few lines and needs no schema change. Naming the limit stops it from being copied to a multi-replica service where it silently does nothing.

## EXAMPLE
```ts
const chains = new Map<string, Promise<void>>();

export async function insertUnderCap(input: NewTask, cap: number): Promise<Task | null> {
  const previous = chains.get(input.userId) ?? Promise.resolve();    // read and assigned before any await
  const attempt = previous.then(async () => {
    if ((await countActive(input.userId)) >= cap) return null;
    return insertTask(input);
  });
  const link = attempt.then(() => undefined, () => undefined);       // never rejects
  chains.set(input.userId, link);
  void link.then(() => { if (chains.get(input.userId) === link) chains.delete(input.userId); });
  return attempt;
}
```
Multi-replica version: inside one transaction, `SELECT pg_advisory_xact_lock(hashtext($ownerId))`, then count, then insert.

## CHECK
How to verify if a repo already follows this:
- [ ] Count and insert for one owner cannot interleave
- [ ] A concurrent test fires more requests than the cap at once and asserts exactly `cap` succeed
- [ ] The map is empty when idle (a test helper exposes its size)
- [ ] The single-replica assumption is written next to the code

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Replace separate `count` and `insert` calls with one function that performs both under the chain.
2. Route every insert through it.
3. Add a concurrency test and an idle-size test.
4. If the service ever scales out, switch to the advisory-lock version before adding a replica.

## NOTES
- A unique constraint cannot enforce "at most N"; use a lock, a counter row updated atomically, or this chain.
