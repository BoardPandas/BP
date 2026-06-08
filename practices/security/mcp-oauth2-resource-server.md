---
concern: security
tech: [better-auth, oauth, mcp, nextjs, typescript]
priority: recommended
source-repo: MCP (@wellforce/mcp-bridge)
applies-to: [better-auth, oauth, mcp, nextjs, typescript]
---
# Host MCP Servers as RFC 9728/8707 OAuth 2.1 Resource Servers (Better Auth)

## PATTERN

When a service hosts multiple MCP connectors behind one origin and acts as its own OAuth 2.1 Authorization Server, use Better Auth's `@better-auth/oauth-provider` + `jwt()` plugins (the built-in `mcp()` plugin is deprecated in Better Auth 1.6.x). Make every connector its own OAuth *resource*:

- **Per-resource RFC 9728 metadata.** Serve protected-resource metadata at `/.well-known/oauth-protected-resource/<resource-path>` whose `resource` equals the exact URL the client connected to. Point the gateway's `401` challenge at that per-resource document: `WWW-Authenticate: Bearer resource_metadata="<…/that-resource>"`.
- **Per-resource audience binding (RFC 8707).** The client sends the resource URL as the `resource` param; the provider stamps it as the token `aud`. The resource server validates `aud == <connector URL>`, so a token minted for one connector cannot be replayed against another sharing the same origin.
- **Stateless local verification.** Verify access tokens as JWTs against the published JWKS (`createRemoteJWKSet` + `jwtVerify`), not a per-request DB lookup. Token `iss` is `${BETTER_AUTH_URL}/api/auth` (the auth API base), not the bare origin.
- **Mirror discovery to root.** MCP clients probe the domain root, not `/api/auth`. Mirror `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` to root by proxying the Better Auth handler, so the document never drifts from the plugin's own output.
- **Native at-rest protection.** Rely on the plugin defaults: `storeTokens` and `storeClientSecret` default to `"hashed"`, access tokens are stateless JWTs (never stored), and the JWKS private key is encrypted with `BETTER_AUTH_SECRET`. Do not hand-roll reversible DB encryption for tokens.

## WHY

- DCR alone is not what blocks strict clients; RFC 9728 compliance is. A single origin-level `resource` makes a spec-compliant client (and MCP Inspector) reject the connection because the advertised `resource` does not equal the URL it connected to. Per-resource metadata fixes that.
- Per-resource audience binding is real defense in depth in a multi-connector gateway: it stops token replay across connectors that share one origin.
- Local JWKS verification removes a per-request DB round-trip and the deprecated `getMcpSession` footgun (it treated expired tokens as valid; `jwtVerify` enforces `exp`).
- Hashing a bearer token (looked up by equality) is strictly safer than reversible AES-at-rest, and it is the plugin default — less code, smaller attack surface.

## EXAMPLE

`src/auth.ts` — provider config (replaces the deprecated `mcp()` plugin):

```ts
const mcpResourceUrls = PROVIDER_IDS.map((p) => `${env.betterAuthUrl}/mcp/${p}`);
// Under the openid scope the provider adds userinfo as a SECOND token audience and validates
// every audience against validAudiences, so it must be listed too (see NOTES).
const userinfoAudience = `${env.betterAuthUrl}/api/auth/oauth2/userinfo`;

export const auth = betterAuth({
  baseURL: env.betterAuthUrl,
  disabledPaths: ["/token"], // keep oauth2's /oauth2/token; disable jwt()'s bare /token
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/consent",
      allowDynamicClientRegistration: true,       // RFC 7591
      allowUnauthenticatedClientRegistration: true, // MCP clients register before any session
      validAudiences: [...mcpResourceUrls, userinfoAudience], // RFC 8707
      scopes: ["openid", "profile", "email", "offline_access"],
    }),
  ],
});
```

`server.ts` — per-resource PRM + root discovery mirror:

```ts
app.get("/.well-known/oauth-authorization-server", (_req, res) =>
  proxyAuthMetadata(".well-known/oauth-authorization-server", res)); // proxies auth.handler()

app.get("/.well-known/oauth-protected-resource/mcp/:provider", (req, res) => {
  if (!isProviderId(req.params.provider)) return res.status(404).json({ error: "unknown_resource" });
  res.json({
    resource: `${env.betterAuthUrl}/mcp/${req.params.provider}`,    // == the connected URL
    authorization_servers: [new URL(env.betterAuthUrl).origin],
    jwks_uri: `${env.betterAuthUrl}/api/auth/jwks`,
    bearer_methods_supported: ["header"],
  });
});
```

`src/gateway/router.ts` — JWKS verification + per-resource challenge:

```ts
const JWKS = createRemoteJWKSet(new URL(`${env.betterAuthUrl}/api/auth/jwks`));
const ACCEPTED_ISSUERS = [env.betterAuthUrl, `${env.betterAuthUrl}/api/auth`];

const { payload } = await jwtVerify(token, JWKS, {
  issuer: ACCEPTED_ISSUERS,
  audience: `${env.betterAuthUrl}/mcp/${provider}`, // RFC 8707 per-resource binding
});
const userId = String(payload.sub); // identity from the validated token only

function unauthorized(res, provider, message) {
  const url = `${env.betterAuthUrl}/.well-known/oauth-protected-resource/mcp/${provider}`;
  res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${url}"`);
  return res.status(401).json(rpcError(message));
}
```

## CHECK

How to verify if a repo already follows this:

- [ ] OAuth provider is `@better-auth/oauth-provider` + `jwt()`, not the deprecated `mcp()` plugin
- [ ] `GET /.well-known/oauth-protected-resource/<resource>` returns `resource` equal to the exact connector URL (not the bare origin)
- [ ] An unauthenticated request to a connector returns `401` with `WWW-Authenticate: Bearer resource_metadata="…/<that resource>"`
- [ ] The resource server verifies the JWT against the JWKS and checks `aud` equals the connector URL
- [ ] `/.well-known/oauth-authorization-server` is reachable at the domain root with `registration_endpoint` and `jwks_uri`
- [ ] No custom reversible token encryption; relying on hashed token/secret storage + encrypted JWKS key

## IMPLEMENT

Steps to adopt this in a repo that does not have it:

1. Replace `mcp()` with `jwt({ disableSettingJwtHeader: true })` + `oauthProvider({ loginPage, consentPage, allowDynamicClientRegistration, allowUnauthenticatedClientRegistration, validAudiences, scopes })`; add `disabledPaths: ["/token"]` to the betterAuth root config.
2. Set `validAudiences` to the per-resource URLs PLUS `${BETTER_AUTH_URL}/api/auth/oauth2/userinfo` (see NOTES).
3. Add a DB migration for the new tables (`oauthClient`, `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent`, `jwks`). Match Better Auth's generated column types: `string[]`/`json` -> `jsonb`, `date` -> `timestamptz`, id/FK-to-id -> `text`, and `required !== false` -> `NOT NULL` (Better Auth applies field defaults in app code, so no DB DEFAULTs). Drop any old `mcp()`-plugin tables first.
4. Serve per-resource PRM and mirror AS + OIDC metadata to the domain root in your HTTP server (proxy `auth.handler()` for the AS docs).
5. In the resource server / gateway, verify bearer tokens with `jose` against `${BETTER_AUTH_URL}/api/auth/jwks`, accepting issuer `${BETTER_AUTH_URL}/api/auth` and audience = the connector URL.
6. Build the `/consent` page the provider requires. On login, resume the paused authorize request by stripping the redirect signing params (`sig`/`exp`/`ba_iat`/`ba_pl`) before handing the query back to `/api/auth/oauth2/authorize`.

## NOTES

- **`validAudiences` must include the userinfo endpoint.** Under the `openid` scope the provider appends `${BETTER_AUTH_URL}/api/auth/oauth2/userinfo` as a second token audience and validates every audience against `validAudiences`. Omitting it rejects openid+resource token requests (what Claude's connector sends) with `requested resource invalid`.
- **Token `iss` is `${BETTER_AUTH_URL}/api/auth`**, not the bare origin. The jwt() plugin's own default issuer is the bare baseURL, so accept both when verifying.
- **Login-resume double-sig.** A leftover `sig` on the resumed authorize query yields two `sig` params on the `/consent` redirect and fails signature verification at consent submit; strip the signing params before resuming.
- Default JWT signing alg is EdDSA (Ed25519); `jose` verifies it natively. Discovery advertises `id_token_signing_alg_values_supported: ["EdDSA"]`.
- Migrating the provider invalidates pre-existing OAuth client sessions (clients re-authorize once); non-OAuth native token paths are unaffected.
- Related LL-G `better-auth` entries: `mcp()` deprecation, and mirroring `/.well-known/*` to the domain root / `getMcpSession` expiry footgun.
