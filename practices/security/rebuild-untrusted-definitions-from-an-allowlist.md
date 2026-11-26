---
concern: security
tech: [typescript, nodejs, mcp, gateway]
priority: recommended
applies-to: [any-service-that-relays-third-party-definitions, mcp-gateway, plugin-host]
---
# Rebuild a relayed third-party definition from an allowlist, and bound every string before any regex

## PATTERN
When a service lists or relays a definition that another party wrote (a tool, a plugin manifest, a view's metadata, a skill), build the outgoing object from named fields, each with a type check and a bound. Never copy the incoming object and delete the fields you dislike.

- Take only the fields you decided on; read each one defensively (`unknown`, not `any`).
- Bound each: maximum length, byte size, element count, allowed characters or values. Refuse or drop what does not fit and count what was dropped.
- Check length before running a regex, a spread or a loop over the value, so the work depends on your limit and not on the sender's string length.
- Strip or refuse control characters in anything shown to a user or used in an address.
- Set trust-relevant fields yourself (a read-only hint, an owner label, a title prefix naming the source); never pass the sender's claim through.

## WHY
A denylist covers the keys you thought of. An allowlist makes a key you did not think of unable to reach the consumer: a metadata field that marks the item as something special, points at another resource, or changes how a host sandboxes it. Bounds before regex keep a hostile, very long string from costing more than your limit allows. Rebuilding also means a new upstream field is ignored until someone decides to support it.

## EXAMPLE
```ts
const MAX_NAME = 64, MAX_DESCRIPTION = 2000, MAX_SCHEMA_BYTES = 32 * 1024;
const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function promote(raw: unknown, source: string): Tool | { skipped: string } {
  if (!isPlainObject(raw)) return { skipped: "not an object" };
  const { name, description, inputSchema, _meta } = raw;
  if (typeof name !== "string" || name.length > MAX_NAME || !NAME_RE.test(name) || name.includes("__")) {
    return { skipped: "unusable name" };                         // length first, then regex
  }
  if (!isPlainObject(inputSchema) || byteLength(inputSchema) > MAX_SCHEMA_BYTES) return { skipped: "schema too large" };
  return {
    name,
    description: `[${source}] ${cutToCodeUnits(String(description ?? ""), MAX_DESCRIPTION)}`,
    inputSchema,
    annotations: { readOnlyHint: classifyOurselves(name) },      // our classification, not the sender's claim
    _meta: pickKnown(_meta),                                      // a few named keys only
  };
}
```

## CHECK
How to verify if a repo already follows this:
- [ ] Every outgoing third-party definition is built field by field, not by cloning and pruning
- [ ] Each string field has a length bound checked before any regex or iteration
- [ ] Control characters are rejected or stripped in names, addresses and labels
- [ ] Trust fields (read-only, owner, label) come from your own code
- [ ] A test feeds an object with an extra, unexpected key and asserts it does not appear in the output

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. List the fields the consumer needs; write one function that returns a new object from exactly those.
2. Give every field a type check and a limit; return a reason when something is refused and count refusals.
3. Move length checks ahead of regexes; cut text on code-point boundaries rather than mid surrogate pair.
4. Add a test with unexpected keys, oversize values and control characters.

## NOTES
- Truncating (with a visible marker) is right for descriptions; refusing is right for names and addresses.
- Related LL-G entry on relaying third-party view metadata: a relayed `_meta.ui.domain` is wrong behind a gateway.
