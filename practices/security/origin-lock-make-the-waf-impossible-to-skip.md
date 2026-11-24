---
concern: security
tech: [cloudflare, railway]
priority: recommended
applies-to: [cloudflare, any origin behind a reverse proxy or WAF]
---
# Origin Lock: Make the WAF Impossible to Skip

## PATTERN
A proxy or WAF protects an origin only when every request must pass through it. A hosting platform
often also serves the app on its own generated domain, and a client that already holds a connection to
the origin never sees a DNS change. Both let requests skip the WAF.

Make the proxy stamp a secret on every request it forwards, and make the origin refuse any request
for a listed host that lacks a valid stamp:

1. **Edge stamp.** A Cloudflare Transform Rule (phase `http_request_late_transform`, action "Modify
   request header", operation `set`) adds `x-edge-auth` with a secret. Its expression lists exactly
   the proxied hosts.
2. **Origin gate.** Middleware refuses a request for a listed host whose `x-edge-auth` does not match
   any accepted secret. It compares in constant time. Accepting a list of secrets lets you rotate
   without downtime.
3. **Log-only first.** Ship the gate with an enforce flag off. It logs each request that would have
   been refused, with its host, path, user-agent and whether `cf-ray` is present.
4. **Enforce after the log is clean.** Turn enforcement on once the log shows no legitimate caller
   without the header for a full day, including long-lived clients such as agents and WebSockets.
5. **Verify from outside.** A request sent straight to the origin under a listed host name must get
   403. The same request through the proxy must still get its normal answer.

The secret lives in the secret store only. It is never printed, logged or committed.

## WHY
- A WAF rule protects nothing if a client can reach the origin directly. Scanners and attackers both
  find origin addresses, and a Host header can be forged.
- A forged `CF-Connecting-IP` misleads any rate limit or allow list keyed on it. The gate stops that
  as well, because the forged request has no edge stamp.
- Log-only first finds the callers that would break. An enforced gate with no log leaves the first
  unknown caller to discover the outage.

## EXAMPLE
Edge stamp (Cloudflare Transform Rule, set via the Rulesets API or the dashboard):
```
Expression: (http.host in {"app.example.com" "api.example.com"})
Action:     rewrite request header  x-edge-auth  = <secret>
```

Origin gate (Express, TypeScript):
```ts
import { timingSafeEqual } from "node:crypto";

const secrets = (process.env.EDGE_AUTH_SECRETS ?? "").split(",").filter(Boolean);
const hosts = new Set((process.env.EDGE_AUTH_HOSTS ?? "").split(",").filter(Boolean));
const enforce = process.env.EDGE_AUTH_ENFORCE === "true";

app.use((req, res, next) => {
  if (!hosts.has(req.hostname)) return next();
  const got = req.get("x-edge-auth") ?? "";
  const ok = secrets.some(
    (s) => s.length === got.length && timingSafeEqual(Buffer.from(s), Buffer.from(got)),
  );
  if (ok) return next();
  console.warn(JSON.stringify({ edgeAuth: "missing", host: req.hostname, path: req.path,
    ua: req.get("user-agent"), cfRay: req.get("cf-ray") ?? null, enforced: enforce }));
  if (enforce) return res.status(403).type("text/plain").send("Forbidden");
  next();
});
```

Outside check (replace the names with your own):
```
curl -sS -o /dev/null -w '%{http_code}\n' --connect-to app.example.com:443:<origin>.up.railway.app:443 https://app.example.com/
# expect 403 once enforced
curl -sS -o /dev/null -w '%{http_code}\n' https://app.example.com/
# expect the normal answer (200 or 307)
```

## CHECK
How to verify a repo already follows this:
- [ ] Every host the origin answers is in `EDGE_AUTH_HOSTS`, including any platform-generated domain
      attached to the same service.
- [ ] A direct request to the origin under a listed host, with no stamp, gets 403 once enforced.
- [ ] The stamp is compared in constant time, and the secret is absent from logs and the repo.
- [ ] The gate was log-only for at least 24 h before enforcement, and the log showed no legitimate
      caller missing the stamp.
- [ ] Long-lived clients (agents, WebSockets, HTTP/2 pools) reconnected through the proxy before
      enforcement. A proxied DNS record does not move a connection that is already open.

## IMPLEMENT
Steps to adopt this in a repo that doesn't have it:
1. Generate a random secret of at least 32 bytes and store it in the secret store, never in the repo.
2. Add the edge stamp as a Transform Rule on the proxied hosts only.
3. Add the origin gate with `EDGE_AUTH_ENFORCE` unset, and deploy it.
4. Wait 24 h and read the log for the `edgeAuth: "missing"` lines. Fix any legitimate caller first.
5. Set `EDGE_AUTH_ENFORCE=true`, then run the outside check above.
6. To rotate, add the new secret to `EDGE_AUTH_SECRETS` and update the Transform Rule. Once the
   stamp uses the new value everywhere, remove the old secret.

## NOTES
- The gate guards only the hosts it lists. Check every hostname the origin answers, and list the ones
  that have no edge stamp under a separate rule. A direct request to an unlisted name is not refused.
- A health-check path may need an exemption. Keep it as narrow as possible, and test it with lookalike
  paths (trailing slash, case change, encoded dot segments), since a prefix match can let them through.
- Connection reuse: a proxied record does not move a connection that is already open. Enforce only
  after the clients have reconnected through the proxy.
- The stamp is not an authentication. It proves the request passed the proxy, not who sent it.
  Keep the application's own authentication in place.
