---
concern: security
tech: [postgres, typescript, go, mcp]
priority: recommended
applies-to: [postgres, typescript, go, mcp]
tags: [approvals, fingerprint, sha256, idempotency, human-in-the-loop, select-for-update]
---
# Bind a human approval to an exact request with a line-format fingerprint, and consume it single-use in the dispatch transaction

## PATTERN
Bind every human approval to a SHA-256 fingerprint of a versioned, fixed-order line format describing the exact request, and consume the approval single-use inside the same database transaction that inserts the job it authorizes.
The fingerprint input is plain newline-terminated `key:value` lines in a fixed order: a version tag, tenant, requester, every safety-relevant parameter (engine, timeout), the target IDs lowercased, deduplicated and sorted, and the SHA-256 of the exact payload bytes. At dispatch the server recomputes the fingerprint from the incoming request, locks the matching approved row, re-checks anything that may have changed since approval, marks it consumed, inserts the job and writes the audit event, all in one transaction.

## WHY
- **No canonical JSON.** Node and Go (and others) disagree on key order, escaping, number formats and undefined/null, so a JSON-based hash that two languages must reproduce drifts silently. A line format has nothing to canonicalize.
- **Exact bytes.** Hashing the payload bytes with no trimming or line-ending normalization means one changed character, one added target or a longer timeout is a new approval, which is what an approver expects.
- **Single use without races.** Consuming in the dispatch transaction under `SELECT ... FOR UPDATE` means ten concurrent identical calls dispatch exactly once; a failed insert leaves the approval unconsumed.
- **Staleness.** Rules, policy mode, grants or target ownership can change between approval and use; re-checking at consumption stops an old approval authorizing something it would no longer allow.

## EXAMPLE
```ts
// fingerprint.ts
export function fingerprint(r: Req): string {
  const ids = [...new Set(r.deviceIds.map((d) => d.toLowerCase()))].sort().join(',');
  const lines = [
    'app-approval-v1',
    `tenant:${r.tenantId}`,
    `requester:${r.requesterId}`,
    `engine:${r.engine}`,
    `timeout:${r.timeoutS}`,
    `devices:${ids}`,
    `script-sha256:${sha256Hex(new TextEncoder().encode(r.script))}`,
  ];
  return sha256Hex(new TextEncoder().encode(lines.map((l) => l + '\n').join('')));
}
```
```sql
-- consume, inside the dispatch transaction
SELECT id, tier, mode_at_request FROM approval
 WHERE fingerprint = $1 AND status = 'approved' AND consume_by > now()
 FOR UPDATE;
-- app re-checks tier, mode, grants, devices; if stale: UPDATE ... SET status = 'stale'
UPDATE approval SET status = 'consumed', consumed_at = now(), consumed_job_id = $2 WHERE id = $3;
INSERT INTO job (...) VALUES (...);
INSERT INTO audit_event (...) VALUES (...);
COMMIT;
```

## CHECK
How to verify if a repo already follows this:
- [ ] The approval hash input is a fixed-order text format with a version tag, not `JSON.stringify` or a canonical-JSON library.
- [ ] Target IDs are lowercased, deduplicated and sorted before hashing; payload bytes are hashed unmodified.
- [ ] Every parameter that changes what runs (engine, timeout, run-as) is in the fingerprint.
- [ ] Consuming the approval and inserting the job happen in one transaction with a row lock.
- [ ] A test fires N concurrent identical requests and asserts exactly one job.
- [ ] Shared test vectors (CRLF vs LF, BOM, non-ASCII, duplicate/uppercase IDs) are asserted in every language that computes or checks the hash.

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Define the line format and version tag in one shared module; write vectors to a JSON fixture.
2. Store the fingerprint, the exact payload and the target list on the approval row.
3. Move consumption into the dispatch transaction with `SELECT ... FOR UPDATE`, plus staleness checks.
4. Add the concurrency test and the vector tests; bump the version tag whenever the format changes.

## NOTES
- Free-text fields shown to the approver (a reason) can stay out of the fingerprint, but store the text the approver saw.
- If an identical fingerprint is already pending, return that request rather than creating a duplicate.
- Related: LL-G nodejs/json-canonicalization-diverges-from-go, typescript/hash-persisted-json-representation, architecture/persist-before-dispatch.
