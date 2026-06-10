---
concern: security
tech: [node, typescript, hono, mcp, oauth]
priority: recommended
source-repo: tcg
applies-to: [node, typescript, any-service-adding-an-ai-tool-layer-on-an-existing-authed-api]
---
# Internal Loopback Bridge for Privileged In-Process Callers (MCP/AI tool layers)

## PATTERN
When an AI/MCP/tool layer lives in the same process as an existing authenticated REST API, do not give the tool layer its own copies of authorization logic and do not give it direct DB access. Instead, tool handlers "loop back" over localhost HTTP into the existing REST routes, authenticated by an internal bridge:

1. A per-process secret generated at startup with `crypto.randomBytes(32)` -- never configured, never persisted, never logged. It cannot leak from config because it does not exist in config.
2. The tool layer attaches the secret plus the verified caller identity (from the OAuth token it already validated) as internal headers on the loopback request.
3. A middleware on the REST side verifies the secret with `crypto.timingSafeEqual`, then re-derives the user record server-side from the verified user ID (DB lookup) rather than trusting the carried email/name fields. The carried identity is an id-only assertion.
4. On secret mismatch or unresolvable ID, fall through to normal auth -- never fail open.

Result: ACL, validation, rate limits, and audit logging exist in exactly one place (the REST routes), and the tool layer holds zero elevated trust.

## WHY
- The alternative (tool handlers re-implementing ACL or querying the DB directly) duplicates the authorization surface; the two copies WILL drift, and the drift is a silent privilege bug.
- A per-process random secret is strictly better than a shared env-var secret for same-process loopback: nothing to rotate, nothing to leak from Doppler/env dumps, and a restart re-keys it.
- Re-deriving identity from the verified ID makes the design one-bug-proof: even if a future code path lets a caller influence the bridge header, the email-keyed ACL downstream cannot be steered, because the email comes from the directory record, not the header.
- Constant-time comparison removes the timing side channel on the secret check.

## EXAMPLE
From the tcg repo (`dashboard/src/lib/mcp/internal-bridge.ts` + `dashboard/src/middleware/resolveInternalMcpUser.ts`):

```ts
// internal-bridge.ts -- secret exists only in process memory
const INTERNAL_SECRET = randomBytes(32);
export const INTERNAL_SECRET_HEADER = "x-internal-mcp-secret";
export const INTERNAL_USER_HEADER = "x-internal-mcp-user";

export function verifyInternalSecret(candidate: string | undefined): boolean {
  if (!candidate) return false;
  const buf = Buffer.from(candidate, "hex");
  return buf.length === INTERNAL_SECRET.length && timingSafeEqual(buf, INTERNAL_SECRET);
}

// middleware -- id-only assertion; identity re-derived from the directory
export const resolveInternalMcpUser: MiddlewareHandler = async (c, next) => {
  if (verifyInternalSecret(c.req.header(INTERNAL_SECRET_HEADER))) {
    const raw = c.req.header(INTERNAL_USER_HEADER);
    const asserted = raw ? safeJsonParse(raw) : null;
    if (asserted && typeof asserted.id === "string") {
      const user = await getUserById(asserted.id); // server-side re-derivation
      if (user) {
        c.set("user", user);
        c.set("mcpInternal", true);
      }
    }
  }
  await next(); // unresolved -> normal auth path, never fail open
};

// MCP tool handler -- writes go through the real REST route
const res = await loopback("PATCH", `/api/proxy/decks/${slug}`, body, verifiedUser);
```

## CHECK
How to verify if a repo already follows this:
- [ ] Tool/AI handlers contain no direct DB writes and no ownership/ACL conditionals of their own
- [ ] Writes from the tool layer hit the same route handlers the UI uses
- [ ] The bridge secret is generated at startup (`randomBytes`), not read from env/config
- [ ] Secret comparison uses `timingSafeEqual`, not `===`
- [ ] The REST-side middleware re-derives the user from the asserted ID via a directory lookup; carried email/name are never trusted
- [ ] Secret and bridge headers are excluded from request logging

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Create an `internal-bridge` module: startup `randomBytes(32)` secret, header constants, `verifyInternalSecret()` with constant-time compare, and a `loopback(method, path, body, user)` helper that targets `http://127.0.0.1:<own port>`.
2. Add a middleware ahead of normal auth that, on valid secret, resolves the user by the asserted ID from the directory and marks the context as internal; on anything else, falls through.
3. Rewrite tool/AI handlers to call `loopback()` instead of touching the DB or duplicating checks. Delete any ACL logic that now lives in two places.
4. Audit logging: record tool calls at the dispatch layer, redacting argument bodies; the REST side keeps its existing audit.
5. Test: a loopback call with a forged email but valid ID must act as the directory user; a wrong secret must behave as anonymous.

## NOTES
This pattern is for SAME-PROCESS (or same-pod localhost) loopback only. The per-process secret breaks across multiple replicas behind a load balancer -- for multi-process topologies, swap the transport for direct in-process route invocation (e.g. `app.request()` in Hono) or a shared signed token, keeping the id-only-assertion and single-ACL-surface properties. Related: the mcp-oauth2-resource-server practice covers how the outer OAuth layer verifies the caller before the bridge is ever invoked.
