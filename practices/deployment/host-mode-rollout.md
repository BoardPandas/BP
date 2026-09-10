---
concern: deployment
priority: recommended
tags: [next-js, multi-tenancy, subdomain, dns, rollout, env-config]
tech: [nextjs, typescript, better-auth]
applies-to: [nextjs, multi-tenant]
---
# Env-Driven Host-Mode Helper for Staged Subdomain Rollout

## CONTEXT

Apps that plan a future split from one origin to multiple subdomains (e.g. single `app.example.com` today -> `admin.example.com` + `app.example.com` later) often block code work on DNS provisioning. The natural-feeling refactor -- middleware checks `request.headers.get("host")` and branches -- fails fast in the single-host era because there is nothing to branch on, leading teams to defer the architecture work entirely.

A host-mode helper unblocks the architecture: build the multi-host code path now, drive it from env vars, and let the unset state degrade gracefully to single-host behavior. The DNS cutover then becomes a one-line env flip rather than a code change.

## PATTERN

### Pure helper

```ts
// src/lib/auth/host-mode.ts
export type HostMode = "platform" | "app" | "single";

export type HostConfig = {
  platformHost?: string | null;
  appHost?: string | null;
};

export function getHostMode(host: string | null | undefined, config: HostConfig): HostMode {
  if (!config.platformHost && !config.appHost) return "single";
  const normalized = normalizeHost(host);
  if (!normalized) return "single";
  const platform = normalizeHost(config.platformHost);
  const app = normalizeHost(config.appHost);
  if (platform && normalized === platform) return "platform";
  if (app && normalized === app) return "app";
  return "single"; // unknown host (preview deploy, localhost) -> safe fallback
}

function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const lower = host.toLowerCase().trim();
  if (!lower) return null;
  const noPort = lower.split(":")[0];
  return noPort.startsWith("www.") ? noPort.slice(4) : noPort;
}

export function readHostConfigFromEnv(env = process.env): HostConfig {
  return {
    platformHost: env.PLATFORM_HOST ?? null,
    appHost: env.APP_HOST ?? null,
  };
}
```

### Middleware that's a no-op until the env flips

```ts
// middleware.ts
const mode = getHostMode(request.headers.get("host"), readHostConfigFromEnv());

if (mode === "platform" && !isPublicPath(pathname) && !isPlatformPath(pathname)) {
  const appHost = process.env.APP_HOST;
  return appHost
    ? NextResponse.redirect(new URL(pathname, "https://" + appHost))
    : new NextResponse(null, { status: 404 });
}

if (mode === "app" && isPlatformPath(pathname)) {
  const platformHost = process.env.PLATFORM_HOST;
  return platformHost
    ? NextResponse.redirect(new URL(pathname, "https://" + platformHost))
    : new NextResponse(null, { status: 404 });
}

// 'single' mode falls through to existing single-host behavior.
```

### Route groups, URLs unchanged

Use Next.js route groups to separate per-plane content WITHOUT changing URLs. `src/app/(platform)/admin/platform/users/page.tsx` and `src/app/(app)/admin/org/[orgId]/page.tsx` mount at `/admin/platform/users` and `/admin/org/[orgId]/`. URLs are stable across the rollout; only the hostname that serves them changes.

### BetterAuth (or session) cross-subdomain config

```ts
// src/lib/auth/index.ts
advanced: {
  ...(process.env.COOKIE_DOMAIN
    ? { crossSubDomainCookies: { enabled: true, domain: process.env.COOKIE_DOMAIN } }
    : {}),
},
trustedOrigins: parseTrustedOrigins(),  // comma-separated env, fall back to NEXT_PUBLIC_APP_URL
```

The conditional spread means: cookie domain is unset on single-host (default secure cookies, no cross-domain leakage); set `COOKIE_DOMAIN=.example.com` at cutover.

## CUTOVER CHECKLIST

When DNS lands, the rollout is a Doppler/`.env` change:

```
PLATFORM_HOST=admin.example.com
APP_HOST=app.example.com
COOKIE_DOMAIN=.example.com
TRUSTED_ORIGINS=https://admin.example.com,https://app.example.com
```

Plus updating any external OAuth redirect URIs to point at the new hosts.

## ANTI-PATTERN

```ts
// Hardcoded host detection blocks deployment until DNS is ready.
if (host === "admin.example.com") { /* ... */ }

// Hardcoded route-group-to-host coupling without an env seam.
// Future you has to edit code, not config, when DNS finally arrives.
```

## CHECK

How to verify a repo already follows this:
- [ ] Host branching lives in one pure helper taking `(host, config)`, not scattered `request.headers.get("host")` comparisons
- [ ] With neither host env var set the helper returns `single` and the middleware is a no-op
- [ ] An unknown host (preview deploy, localhost) falls back to `single` rather than erroring or redirecting
- [ ] Hosts come from env (`PLATFORM_HOST` / `APP_HOST`), never hardcoded
- [ ] Normalization lowercases, strips the port, and strips a leading `www.`

## IMPLEMENT

1. Add the pure `getHostMode` / `normalizeHost` / `readHostConfigFromEnv` helper.
2. Branch in middleware on the returned mode, with `single` doing nothing at all.
3. Unit-test all three modes plus the unknown-host fallback **while still on one origin** -- that is the whole point: the architecture lands before DNS exists.
4. At cutover set `PLATFORM_HOST`, `APP_HOST`, `COOKIE_DOMAIN` and `TRUSTED_ORIGINS` in the secret store, and update external OAuth redirect URIs.

## NOTES

- Why `single` not `unknown`: in pre-cutover and preview environments, the safe behavior is "serve everything" (single-host fallback), not "serve nothing." `unknown` would tempt teams to throw or 404, breaking previews.
- Pure helper, env-reading helper, and middleware are deliberately separate: server components, API guards, and tests can all call `getHostMode()` with hand-built configs without depending on `process.env`.
- Test the helper exhaustively (case-insensitive matching, port stripping, `www.` stripping, partial rollout where only one of the two hosts is configured). Middleware integration tests can be skipped if the helper is well-covered -- the middleware is a thin wrapper.
- For multi-region or multi-brand variants, scale the same pattern to N modes (`'platform' | 'partner' | 'app' | 'single'`) without changing the seam.

## SOURCES

- Built and shipped during the multi-broker Phase 1d work in a Next.js 16 / BetterAuth 1.6 codebase; activated production via Doppler env-flip with no code redeploy.
