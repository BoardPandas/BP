# Infrastructure Profiles

Projects bootstrapped from this template deploy onto one of two profiles: **Cloudflare** or **Railway**. Plan-repo researches both against the project's requirements, recommends one, and the user approves it in the stack recommendation. Pick a profile whole -- the layers inside each one are designed to work together, and the two platforms do not map onto each other layer by layer (Cloudflare has no Redis and no managed Postgres; Railway has no object storage or edge network).

Two things are shared by both profiles and are not researched: **Cloudflare R2** for object storage and **Resend** for email. Auth is always **Better Auth**, hosted inside the project's own API rather than as a separate service.

## Profile Comparison

| Layer | Cloudflare | Railway |
|-------|-----------|---------|
| Frontend hosting | Workers with Static Assets (SPA or SSR via a framework adapter) | Container service (static-served SPA or SSR server) |
| Backend hosting | Workers; Cloudflare Containers for workloads Workers cannot run | Container service |
| Database | D1 (serverless SQLite), or external Postgres through Hyperdrive | Railway Postgres (one-click HA on Patroni) |
| Cache / shared state | Workers KV (read-heavy, eventually consistent), Durable Objects (strongly consistent, per-object) | Railway Redis |
| Queues / background work | Cloudflare Queues + consumer Worker | Redis-backed queue or a dedicated worker service |
| Cron | Workers Cron Triggers | Railway cron service type |
| Persistent disk | None (object storage or a database instead) | Volumes, up to 5 TB |
| Object storage | Cloudflare R2 | Cloudflare R2 |
| CDN / WAF | Native | Cloudflare proxy (orange-cloud) in front of the Railway domain |
| Auth | Better Auth on Workers | Better Auth in the API container |
| Email | Resend | Resend |

## Cloudflare Profile

```
User Browser
    |
    +---> Cloudflare edge (DNS, CDN, WAF, DDoS, TLS -- native, nothing to wire)
              |
              +---> Worker: static assets (SPA build or SSR via framework adapter)
              |         |
              |         +---> Worker: API + Better Auth endpoints
              |
              +---> R2 (public downloads, same network, zero egress cost)

API Worker
    |
    +---> D1 (SQLite)  -or-  Hyperdrive ---> external Postgres (Neon, Supabase, ...)
    +---> Workers KV (config, session cache) / Durable Objects (websockets, per-tenant state, locks)
    +---> Cloudflare Queues ---> consumer Worker (background jobs)
    +---> R2 (signed URLs for private downloads)
    +---> Resend (magic links, OTPs, transactional email)
    +---> Cloudflare Containers (long-running or non-JS workloads: ffmpeg, headless browsers, ML)

Cron Triggers ---> scheduled Worker invocations (cleanup, reports, sync, digests)
```

Notes and constraints:

- **Pages is legacy.** New projects target Workers with Static Assets; Cloudflare's feature work goes to Workers, and Static Assets reached parity with Pages in March 2026. Do not plan a Pages deployment.
- **No Redis.** KV is eventually consistent and read-optimised; Durable Objects give strong consistency for a single key's worth of state. A project that genuinely needs Redis semantics belongs on Railway.
- **D1 is SQLite, capped at 10 GB per database.** Fine for most application data. Postgres-specific needs -- extensions such as pgvector or PostGIS, heavy analytical SQL, existing Postgres schemas -- mean either Hyperdrive plus an external Postgres vendor (a second bill and a second vendor) or the Railway profile.
- **Workers are short-lived isolates.** No long-running processes, bounded CPU time per request. Long jobs go to Queues consumers or Containers.
- **Node compatibility is a flag, not a guarantee.** `nodejs_compat` covers most of the ecosystem; npm packages with native bindings do not run on Workers.
- **Better Auth runs on Workers** via `better-auth-cloudflare`, with D1, Hyperdrive, KV, and R2 bindings.

## Railway Profile

```
User Browser
    |
    +---> Cloudflare edge (DNS + orange-cloud proxy: CDN, WAF, DDoS, TLS)
              |
              +---> Railway frontend service (SPA container or SSR container)
              |         |
              |         +---> Railway API service (private network)
              |
              +---> Cloudflare R2 (public downloads)

Railway API Service
    |
    +---> Railway Postgres (application data + Better Auth tables; HA via Patroni)
    +---> Railway Redis (sessions, caching, job queues)
    +---> Volume (persistent disk, when the workload needs one)
    +---> Cloudflare R2 (signed URLs for private downloads)
    +---> Resend (magic links, OTPs, transactional email)

Railway cron service ---> scheduled tasks on their own schedule
```

Notes and constraints:

- **Services share a private network.** API-to-Postgres and API-to-Redis traffic stays internal and unmetered. Only the public edge is billed as egress.
- **R2 is across the internet from Railway compute.** Hand clients signed R2 URLs so bytes flow browser-to-R2 directly instead of being proxied through the API and billed as Railway egress.
- **Cloudflare in front needs Full (Strict) TLS.** Railway provisions its own certificate for a custom domain; "Flexible" breaks the origin handshake.
- **ACME versus proxy ordering.** Keep the Cloudflare record grey-cloud (DNS-only) until Railway has issued the certificate, then switch it to orange. Alternatively add a WAF bypass rule for `/.well-known/acme-challenge/*` so renewals do not need the proxy toggled off.
- **HTML is not cached by default.** Fine for an SPA. For SSR, add explicit Cache Rules for pages worth caching and send `Cache-Control: no-store` for pages that must not be.

## Choosing a Profile

Signals that decide it outright:

| Requirement | Profile |
|-------------|---------|
| Postgres extensions (pgvector, PostGIS), existing Postgres schema, or data well past 10 GB | Railway |
| Redis semantics, long-running processes, background workers, persistent disk | Railway |
| Runtime with native dependencies (Python ML, ffmpeg, headless browsers, Elixir) | Railway |
| Globally distributed read-heavy traffic where edge latency is the product | Cloudflare |
| Spiky or low-volume traffic where idle cost should be near zero | Cloudflare |
| Mostly-static frontend plus a thin API, data that fits SQLite | Cloudflare |
| Websockets for presence, collaboration, or per-room state | Either (Durable Objects on Cloudflare, a container on Railway) |

When nothing forces the choice, weigh operational simplicity: Cloudflare is one vendor, one bill, and no CDN wiring; Railway is a conventional container model with real Postgres and Redis, at the cost of a Cloudflare proxy in front.

## Auth Methods (Better Auth)

All projects include these auth methods by default, on either profile:

- Email/password sign-in and sign-up
- Social sign-in (Google, Microsoft)
- Magic link
- Passkey (WebAuthn)
- Two-factor authentication (TOTP)

## Desktop Projects

A desktop application does not get a hosting profile by default. Plan-repo establishes the delivery target first; a local-first desktop app has no infrastructure section at all, and its data lives in a local store (SQLite or the framework's equivalent).

A profile enters a desktop plan only when the app needs a server for something specific:

- **Accounts, sync, or multi-device state** -- pick a profile as above and plan an API exactly as a web project would; Better Auth still handles auth, with the desktop client holding tokens in the OS keychain.
- **Licensing or telemetry** -- usually a thin API; the Cloudflare profile is the cheaper fit.
- **Auto-update artifacts** -- R2 alone. Update manifests and signed installers are static files; hosting them needs no compute on either profile.

## What plan-repo Still Decides

Beyond the profile, plan-repo researches and recommends:

- Language and runtime (TypeScript/Bun, TypeScript/Node, Go, Rust, Python, etc.)
- Frontend framework, and whether it ships as a static SPA or an SSR server
- Backend framework
- UI component library and styling approach
- ORM or query builder, matched to the profile's database
- Developer tooling (package manager, bundler, linter, formatter, test runner)
- For desktop targets: the desktop framework and shell, local data store, packaging, code signing, and auto-update strategy
