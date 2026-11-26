---
concern: security
tech: [typescript, nodejs, mcp, gateway]
priority: recommended
applies-to: [mcp-gateway, plugin-registry, any-aggregator-of-untrusted-sources]
---
# Pin a shared name to its owner across requests when untrusted sources can offer the same one

## PATTERN
When a service merges names from several sources into one namespace (tools from different servers, routes from plugins) and some sources are third-party, do not recompute "who owns this name" from the current responses. Keep a per-user ownership record:

- A name, once offered and listed, stays with its source until that source has gone a long time without offering it. The period must exceed any client's cache of the list (hours, not minutes).
- A slow, failing, rate-limited or capped source does not free its names.
- Order of trust decides conflicts: a built-in source outranks a custom one; a stable order breaks ties only between names nobody holds.
- After a restart the record is empty. Hold a third-party source's new names back until every source that sorts before it has answered, or has been failing for a set time.
- Resolve calls against the record, so what a client was shown is what runs.
- State the limit: an in-memory record cannot decide between two untrusted sources across a restart. Persisting it closes that gap, and is a decision for the product owner.

## WHY
Clients and models keep an older list and write arguments for the server it named. If ownership is derived afresh, a source added later (or one that answered first after a blip) can take a name over, and the arguments go to a different server with no error. That is a silent cross-source data leak, and the sources most able to exploit it are the ones you trust least.

## EXAMPLE
```ts
const TTL_MS = 2 * 60 * 60 * 1000;
type Reservation = { source: string; freshAt: number };

function ownerOf(name: string, offeredBy: string[], book: Map<string, Reservation>, now: number): string {
  const held = book.get(name);
  const holds = held && now - held.freshAt <= TTL_MS;
  const trusted = offeredBy.find(isBuiltIn);
  if (holds && !(trusted && !isBuiltIn(held.source))) {
    if (offeredBy.includes(held.source)) held.freshAt = now;
    return held.source;
  }
  const winner = trusted ?? [...offeredBy].sort()[0];
  book.set(name, { source: winner, freshAt: now });
  return winner;
}
```

## CHECK
How to verify if a repo already follows this:
- [ ] Ownership of a shared name is stored, not recomputed per request
- [ ] The retention period is longer than the longest client cache of the listing
- [ ] A failing or slow source keeps its names
- [ ] Built-in sources outrank custom ones in a documented order
- [ ] There is a documented rule for the first requests after a restart
- [ ] The remaining limit (two untrusted sources after a restart) is written down

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Add the record keyed by user and name, with a freshness time.
2. Replace the per-request derivation with a lookup that falls back to the trust order only for unheld names.
3. Add the restart hold-back for untrusted sources and a cap on names one source may hold.
4. Test: list, add a competing source that sorts first, list again; the original owner keeps the name.

## NOTES
- The LL-G entry on tool-name maps outliving client caches describes the failure and its code.
- Only callers that are shown the shared names should be able to create records, so an unrelated request cannot fill the book.
