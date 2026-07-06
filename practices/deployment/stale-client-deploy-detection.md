---
concern: deployment
tech: [nextjs, react, docker]
priority: recommended
source-repo: supportforge-platform
applies-to: [nextjs, react, spa]
---
# Stale-Client Deploy Detection with Build-Baked Version + Poll Endpoint

## PATTERN
Auto-deployed SPAs leave already-open browser tabs running the old client bundle indefinitely. Stale tabs are worse than cosmetic: they can call Server Actions that no longer exist or POST payloads the new API rejects. The fix has three small parts:

1. **Bake a version stamp into the build.** In `next.config.js`, read the version from the repo's root `package.json` (bumped every commit by changelog/versioning discipline) and expose it via the `env` key as `NEXT_PUBLIC_APP_VERSION`. It gets inlined into both the client bundle and the server at build time, so every deployment carries its own stamp.
2. **Serve the running version.** A tiny route handler (`/api/version`, `force-dynamic`, `Cache-Control: no-store`) returns the baked-in version of the *currently deployed* server.
3. **Poll and prompt.** A client component mounted in the root layout polls the endpoint every 60s and on `visibilitychange` (tab regains focus). When the server's version differs from the version the client bundle was built with, render a persistent notice with a "Refresh now" button (`window.location.reload()`) and a "Later" dismiss that remembers the dismissed version, so it re-appears only when yet another deploy lands.

## WHY
- No infrastructure needed: no WebSocket channel, no service worker, no feature-flag service. Two tiny files plus one config line.
- The version source is the repo itself, not a build arg someone must remember to pass. If the repo bumps version every commit, detection is automatic and exact.
- Polling + focus check covers the real failure mode: a tech leaves the tab open all day. The focus check catches them the moment they come back.
- Comparing an inlined constant against a live endpoint is deploy-atomic: old client asks new server, mismatch is guaranteed the moment the new container serves traffic.

## EXAMPLE
From supportforge-platform (`dashboard/`):

`next.config.js`:
```js
// Root package.json version is bumped on every commit; baking it into the
// build lets stale clients detect that a newer deploy is live.
const { version: appVersion } = require('../package.json')
// ...
env: { NEXT_PUBLIC_APP_VERSION: appVersion },
```

`src/app/api/version/route.ts`:
```ts
export const dynamic = 'force-dynamic'
export function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown' },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
```

`src/components/shell/UpdateNotice.tsx` (client component, root layout): inlines `BUILT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION`, polls with `fetch('/api/version', { cache: 'no-store', signal })` on a 60s interval + `visibilitychange`, aborts in-flight fetches on cleanup via `AbortController`, and shows when `serverVersion !== BUILT_VERSION && serverVersion !== dismissedVersion`.

## CHECK
How to verify if a repo already follows this:
- [ ] The build inlines a per-deploy version stamp (env key in `next.config.js` or equivalent)
- [ ] An uncached endpoint returns the running deployment's version
- [ ] A root-level client component polls it and prompts for refresh on mismatch
- [ ] The prompt persists (not an auto-dismissing toast) and dismissal is per-version

## IMPLEMENT
Steps to adopt this:
1. Ensure something bumps a version on every deployable commit (package.json version, git SHA build arg, or CI-injected stamp).
2. Inline it into the client bundle at build time (`env` in next.config.js, `define` in Vite).
3. Add the `/api/version` route handler with `force-dynamic` and `no-store`.
4. Add the polling notice component to the root layout; use `cache: 'no-store'`, an `AbortController`, and a focus/visibility recheck.
5. If the app has auth middleware, confirm the version endpoint is reachable without a session (stale detection must work on the login page too).

## NOTES
- The endpoint must live *outside* any BFF proxy path that forwards to a separate backend, or you will compare the frontend bundle against the backend's version.
- In dev the built and served versions always match, so the notice never renders; to test, stub `window.fetch` for the endpoint and dispatch `visibilitychange` (or wait out one poll interval).
- `document.visibilityState` guards the focus path; headless/preview browsers report `hidden`, so rely on the interval when testing there.
- Auto-reloading without a prompt is tempting but hostile: it can destroy an in-progress ticket reply. Always prompt.
- Auto-discovered by practice-scout from supportforge-platform commit ab995b9e
