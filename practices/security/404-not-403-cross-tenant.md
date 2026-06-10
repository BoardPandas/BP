---
concern: security
tech: [nodejs, typescript, express, rest-api]
priority: recommended
source-repo: supportforge-platform
applies-to: [any-multi-tenant-api]
---
# Return 404, Not 403, on Cross-Tenant Lookups by ID

## PATTERN
When an authenticated caller requests a resource by identifier and the resource exists but belongs to another tenant, return the same response as "does not exist" (404), not 403. Implement it structurally: scope the lookup query by the caller's tenant (JOIN/WHERE on the tenant column) so a cross-tenant row is simply not found, rather than fetching the row first and comparing tenant ids in code.

```text
not found        -> 404
wrong tenant     -> 404 (same body, same timing profile)
right tenant     -> 200
```

403 remains correct for same-tenant role failures (the caller may know the resource exists but lacks permission on it).

## WHY
A 403 on an existence check confirms the identifier is valid, which converts sequential or guessable IDs into an enumeration oracle: an attacker can map how many customers/users/tickets exist, which ids are live, and target them through other channels. Returning 404 makes cross-tenant probing indistinguishable from probing random ids. Scoping the query (rather than post-fetch comparison) also removes the fail-open class of bugs where the comparison is written wrong (see the LL-G entry on compound tenant guards failing open on NULL) and avoids a second query.

## EXAMPLE
From supportforge-platform, the fix for an unauthenticated persona IDOR (src/routes/personas.ts):

```ts
// WRONG: global lookup, tenant never checked, sequential ids enumerable
const row = await db.query(
  `SELECT id, client_id, email, persona_portrait FROM end_users WHERE id = $1`, [id]);

// RIGHT: tenant-scoped lookup; cross-tenant ids are simply not found
router.get(`${API_V1}/personas/by-user-id/:id`, requireStaff, async (req, res) => {
  const user = (req as any).user;
  const row = await db.query(
    `SELECT eu.id, eu.client_id, eu.email, eu.persona_portrait
     FROM end_users eu JOIN clients c ON eu.client_id = c.id
     WHERE eu.id = $1 AND c.msp_id = $2 LIMIT 1`,
    [id, user.msp_id]
  );
  if (!row.rows.length) return res.status(404).json({ error: 'not_found' });
  ...
});
```

## CHECK
How to verify if a repo already follows this:
- [ ] By-id GET endpoints scope the SQL by the caller's tenant instead of comparing after fetch
- [ ] Cross-tenant requests return a body identical to genuine not-found
- [ ] Tests assert 404 (not 403) for the wrong-tenant case
- [ ] Platform-admin bypasses are explicit branches, not the default path

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Grep route files for by-id lookups (`WHERE id = $1` without a tenant column in the same query).
2. Rewrite each as a tenant-scoped JOIN/WHERE; delete post-fetch tenant comparisons.
3. Normalize the not-found response shape so existing 403 branches collapse into 404 for cross-tenant.
4. Add a wrong-tenant 404 regression test per endpoint.

## NOTES
Where ids are UUIDv4, enumeration pressure is lower but the practice still holds (logs, referrers, and support tickets leak ids). Use 403 only when revealing existence is intended, e.g. same-tenant RBAC denials.
