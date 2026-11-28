---
concern: security
tech: [http-client, ssrf, dns, rust, hyper]
priority: recommended
applies-to: [server-side-fetch, webhooks, oauth, link-previews, http-client]
---
# Bind an SSRF address filter to the connection, not to a check made before it

## PATTERN
When a server fetches a URL chosen by someone else (client metadata, a webhook target, a link preview), the address that is **vetted** must be the address that is **dialled**:

1. **Resolve once, inside the connector's resolver.** The resolver looks the name up, drops every address that is not publicly routable (loopback, private, link-local, unspecified, multicast and the IPv6 equivalents), and hands the connector only what is left. There is no second lookup.
2. **Refuse IP-literal hosts at URL validation.** Connectors typically skip the resolver for literals, so the filter would never run.
3. **Refuse redirects.** Every 3xx is a failure, not a hop to follow.
4. **Cap size and time.** A maximum response size enforced while reading, and one deadline for the whole exchange.
5. **Budget per caller and per host.** A limit on how many fetches one caller can trigger, and on how many requests go to one target host, so the fetcher cannot be used to probe or flood.

## WHY
The usual check, "resolve the hostname, look at the address, then call the HTTP client with the URL", vets one answer and connects to another: the client resolves again, and the second answer can differ (DNS rebinding). Filtering inside the resolver removes the gap because there is only one resolution. IP literals and redirects are the two ways round a resolver-based filter, so they are closed explicitly. The caps and budgets cover what an attacker can still do with a permitted address.

## EXAMPLE
Generic sketch (Rust-flavoured pseudocode):

```text
validate(url):
    require scheme == https
    require host is a DNS name          # refuse IPv4 and bracketed IPv6 literals
    require no userinfo, expected port

resolver(name):                          # installed on the connector
    addrs = system_lookup(name)
    vetted = [a for a in addrs if is_public(a)]
    if vetted is empty: fail "blocked address"
    return vetted                        # the connector dials only these

fetch(caller, url):
    validate(url)
    budget.charge(caller); budget.charge(host(url))
    resp = client(resolver, redirects = none).get(url) with deadline(TOTAL)
    if 300 <= resp.status < 400: fail "redirect refused"
    return read_at_most(resp.body, MAX_BYTES)
```

## CHECK
- [ ] The address filter runs in the resolver the connector uses; no code resolves the host separately beforehand.
- [ ] URLs with IP-literal hosts are refused before any connection.
- [ ] The client does not follow redirects, and a 3xx response is an error.
- [ ] Response size and total time are capped.
- [ ] Fetches are budgeted per caller and per target host.
- [ ] Tests cover: a name resolving to a private address, an IPv4 literal, a bracketed IPv6 literal, a 302, an oversized body, a slow body.

## IMPLEMENT
1. Find every place the server fetches a caller-supplied URL; route them all through one fetch function.
2. Write the filtering resolver and install it on that function's connector.
3. Add URL validation (scheme, DNS-name host, no literals), disable redirects, add the size and time caps.
4. Add the per-caller and per-host budgets.
5. Write the tests in the checklist against a local test server.

## NOTES
The gotcha behind rule 2 is LL-G `kb/rust/hyper-util-httpconnector-skips-custom-resolver-for-ip-literals.md`; the one behind rule 3 is LL-G `kb/oauth/client-id-metadata-document-fetch-must-not-follow-redirects.md`.
