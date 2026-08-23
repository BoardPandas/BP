---
name: plan-repo
model: opus
effort: high
description: Analyze project requirements and recommend the best tech stack for the current year. Deploys onto one of two infrastructure profiles (Cloudflare or Railway), chosen by research; desktop targets are researched separately (Tauri, Electron, Wails, Flutter, native). Researches languages, frameworks, UI libraries, and tooling, then generates README, design guardrails, and tools reference. Run this before init-repo.
user-invocable: true
disable-model-invocation: true
argument-hint: [optional: project name or description]
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - WebFetch
  - WebSearch
  - Agent(explorer)
---

# Plan Repository

You have been asked to plan a new project before initializing it with Claude Code. This skill recommends the best tech stack based on project requirements and current best practices. Follow these steps exactly.

## Important: Date Awareness

Check the current date FIRST and record it in YYYY-MM-DD form. The steps below refer to it as `<DATE>`. All recommendations must reflect the state of the ecosystem as of `<DATE>`, not cached knowledge. Every framework version, every library comparison, every "best practice" must be verified with WebSearch. Subagents do not know the date unless you tell them: write the literal date into every research prompt (e.g., "as of 2026-07-08"), never the phrase "as of today's date".

## Important: Infrastructure Profiles

Read `.claude/references/infrastructure.md` FIRST. Anything that deploys to a server runs on one of two profiles, and you pick one whole rather than mixing layers:

- **Cloudflare** -- Workers for frontend and API, D1 or Hyperdrive-fronted Postgres, KV and Durable Objects, Queues, Cron Triggers, native CDN/WAF.
- **Railway** -- container services for frontend and API, Railway Postgres and Redis, cron service, volumes, with a Cloudflare proxy in front for CDN/WAF.

The profile is a research decision like any other layer: Step 4 compares the two against this project's requirements and Step 5 presents the winner for approval. Do not ask the user to pick it up front, and do not offer platforms other than these two.

These pieces are fixed on both profiles and are never researched:

- **Object storage:** Cloudflare R2 (public downloads direct, private via signed URLs)
- **Email:** Resend
- **Auth:** Better Auth, hosted inside the project's own API
- **Auth methods:** email/password, social (Google, Microsoft), magic link, passkey, two-factor (TOTP)

Payments are NOT part of the infrastructure. Stripe is the default provider when a project needs payments, but it enters the plan only if the requirements call for it (Step 2, question 8).

A desktop project may have no infrastructure at all. See Step 2 question 3 and the routing table in Step 4.

## Step 1: Check for an Existing Plan

If `tasks/plan-repo.md` already exists, do not silently overwrite it. Tell the user a plan already exists, summarize its stack in two or three lines, and ask whether to:

- **Revise:** keep the prior requirements answers, re-ask only what changed, and re-research only the affected layers; or
- **Start fresh:** archive the old file to `tasks/plan-repo-<DATE>.md`, then proceed from Step 2.

## Step 2: Gather Project Requirements

If the skill was invoked with an argument, treat it as the project name or description: use it to answer question 1 (confirm your interpretation rather than asking) and ask only the remaining questions.

Ask the user these questions. Do NOT ask which hosting platform to use -- that is researched in Step 4. Do NOT ask what language or framework they want (you will recommend that).

### Project Shape
1. What does this project do? (one-sentence description)
2. Who are the users? (developers, end users, internal team, public)
3. **How is it delivered?** (web app in a browser, desktop app the user installs, or both -- a desktop app with a companion web surface)
4. What scale are you targeting? (personal project, startup MVP, production at scale, enterprise)

### Functional Requirements
5. Describe the UI (dashboard, marketing site, mobile-first app, real-time collaboration, data visualization, e-commerce, native-feeling desktop tool, etc.)
6. What data does it work with beyond user accounts? (content/CMS, real-time events, files/media, financial data, etc.)
7. Does it need real-time features? (websockets, live updates, collaborative editing, streaming)
8. Does it take payments? (If yes, default to Stripe unless the user names another provider. If no, payments stay out of the plan entirely: no Stripe env vars, no billing sections.)
9. What other external services does it integrate with? (list them)

### Desktop Follow-ups (ask only if question 3 said desktop or both)
10. Which operating systems must it support? (Windows, macOS, Linux -- and whether any is primary)
11. Does it need a server for anything? (user accounts, cross-device sync, licensing, telemetry, or nothing at all -- a fully local app is a valid answer)
12. Does it need OS-level capabilities? (filesystem access beyond a sandbox, tray or menu-bar presence, global shortcuts, background daemon, USB or serial devices, GPU work, bundled native binaries)
13. How will users get updates? (in-app auto-update, an app store, or a manually downloaded installer)

### Constraints
14. Any hard constraints on language or framework? (team only knows X, client requires Y)
15. Is this greenfield or does it need to integrate with an existing codebase?

Do NOT ask about timelines. Planning is phase-based, not date-based.

Record two facts from these answers before continuing, because Step 4 routes on them:

- **Delivery target:** web, desktop, or both (question 3)
- **Backend in scope:** true for any web target; for a desktop-only target, true only if question 11 named something a server has to do

## Step 3: Consult LL-G and BP (RULE 1 + RULE 3)

Load the knowledge bases BEFORE researching, so known problems and proven patterns inform the recommendation instead of being discovered after implementation.

1. Fetch `https://raw.githubusercontent.com/BoardPandas/LL-G/main/llms.txt` for the technology list.
2. Fetch the sub-index for every fixed technology present in LL-G (Better Auth at minimum) and read ALL HIGH-severity entries. Also fetch sub-indexes for seed candidates that appear in LL-G (e.g., TypeScript, Next.js, Tailwind CSS) and skim entry titles.
3. Fetch `https://raw.githubusercontent.com/BoardPandas/BP/main/llms.txt` and load the concern indexes relevant to stack selection (at minimum: database, deployment, environment; design-systems for UI-heavy projects).
4. Build two running lists:
   - **Selection inputs:** gotchas that should demote or disqualify a candidate (e.g., an ORM whose Better Auth adapter has a HIGH-severity gotcha, or a framework whose Workers adapter is known to be broken). Pass these to the relevant research subagents in Step 4.
   - **Plan seeds:** gotchas that apply to whatever stack is chosen. These pre-seed the plan's Lessons Learned / Gotchas section in Step 10.
5. After the stack is approved in Step 5, fetch sub-indexes for any chosen technologies not already loaded -- including the chosen platform profile and, for desktop projects, the chosen desktop framework -- and add their HIGH-severity entries to the plan seeds.
6. If LL-G or BP are unreachable, note that in the plan and continue. Do not halt.

## Step 4: Research Current Options

Research the layers that are not fixed using `explorer` subagents. Use the custom `explorer` agent (defined in `.claude/agents/`), never the built-in `Explore` type; the built-in loads every MCP tool schema and blows the context window.

Rules for every research prompt:

- Write the literal `<DATE>` into the prompt. Each subagent must use WebSearch to verify its information is current as of that date.
- The candidate lists below are **seeds, not menus**. They age. Instruct each subagent to add newer options that current search results surface, and to drop candidates that have been deprecated, merged, or abandoned since this skill was written.
- Pass along any Step 3 selection-input gotchas relevant to that layer so known problems can demote a candidate.
- If a subagent fails or returns thin or outdated results, note the gap and continue with the remaining evidence. Do not halt the skill.

### Routing

Which waves run depends on the delivery target and whether a backend is in scope. Later waves depend on earlier picks, so the waves are sequential; everything inside a wave runs in parallel.

| Wave | Web | Desktop, no backend | Desktop with backend, or both |
|------|-----|--------------------|-------------------------------|
| 1 | Platform Profile | Desktop Framework | Platform Profile + Desktop Framework |
| 2 | Language & Runtime, Frontend Framework | Desktop UI & Local Data | Language & Runtime, Frontend Framework, Desktop UI & Local Data |
| 3 | Backend Framework, UI Library, ORM & Data Layer, Tooling | Packaging & Distribution, Tooling | Backend Framework, UI Library, ORM & Data Layer, Packaging & Distribution, Tooling |

For a desktop target, the Desktop Framework result supplies the client language, so the Language & Runtime subagent scopes to the server side only. If the desktop framework and the server language end up different (a Tauri client with a Go API, say), that is fine -- say so explicitly in Step 5 rather than forcing one language across both.

### Wave 1: Platform Profile Subagent (runs whenever a backend is in scope)

"Compare two hosting profiles for [one-line project description] as of <DATE>: (A) Cloudflare -- Workers for frontend and API, D1 or Hyperdrive-fronted external Postgres, Workers KV and Durable Objects, Cloudflare Queues, Cron Triggers, native CDN/WAF; (B) Railway -- long-running container services for frontend and API, managed Railway Postgres and Redis, cron service type, persistent volumes, private networking, with a Cloudflare proxy in front for CDN/WAF. Both profiles use Cloudflare R2 for object storage, Resend for email, and Better Auth inside the API. The project's requirements are: [paste the Step 2 answers -- scale, data, real-time needs, integrations, and for desktop projects what the server is actually for]. Compare on: fit for these specific workloads, database semantics needed (SQLite via D1 versus real Postgres with extensions), background and long-running work, websocket support, cost shape at this traffic level, operational complexity, and Better Auth support on each. Report a recommendation, the single strongest argument against it, and any requirement that rules one profile out. WHY: we deploy on exactly one of these two profiles and need the one that fits this workload; the choice then constrains the language, framework, and ORM picks that follow."

Read `.claude/references/infrastructure.md` before writing this prompt and carry its constraints into the comparison -- particularly that Cloudflare has no Redis, that D1 caps at 10 GB, and that Workers cannot run long-lived processes or native npm bindings.

### Wave 1: Desktop Framework Subagent (runs for desktop or both)

"Research the current best frameworks for building an installable desktop application as of <DATE>, targeting [operating systems from question 10]. The app is: [one-line description]. It needs: [OS capabilities from question 12], [update mechanism from question 13], and [server needs from question 11, or 'no server']. Compare: maturity and maintenance activity, bundle size and memory footprint, rendering approach (system webview versus bundled Chromium versus own engine), access to native OS APIs, code signing and notarization story per OS, auto-update support, mobile reach if that matters later, hiring and ecosystem depth, and how well the team's likely existing skills transfer. Report a recommendation with a runner-up and the trade-off that separates them. WHY: this choice fixes the client language, the UI toolkit, and the packaging pipeline for the whole project, so it has to be made before anything else."

Seed candidates:
- **Web-tech shells:** Tauri (Rust core, system webview) vs Electron (bundled Chromium/Node) vs Wails (Go core, system webview) vs Neutralino
- **Own-renderer toolkits:** Flutter desktop (Dart/Skia) vs Compose Multiplatform (Kotlin) vs Avalonia or .NET MAUI (C#) vs Qt (C++/Python)
- **Rust-native UI:** egui vs Slint vs Dioxus desktop
- **Fully native:** Swift/SwiftUI on macOS, WinUI 3 on Windows, GTK on Linux -- worth recommending when only one OS matters and native feel is the product
- Key factors: does a system webview meet the UI needs, or does the app need pixel-identical rendering across OSes; does any required capability (USB/serial, GPU, background daemon, bundled binaries) rule an option out; and what the signing and notarization burden looks like on each target OS

### Wave 2: Language & Runtime Subagent (runs whenever a backend is in scope)

"Research the current state of [relevant languages] for the server side of an application deployed on the [chosen profile] profile, as of <DATE>. [For Cloudflare: the API runs as a Cloudflare Worker on V8 isolates with nodejs_compat, so runtimes and native npm bindings that cannot run there are disqualified. For Railway: the API runs as a long-running container, so any runtime that containerizes cleanly is eligible.] The backend must support Better Auth and connect to [D1 or Hyperdrive-fronted Postgres | Railway Postgres and Redis]. Compare: ecosystem maturity, Better Auth SDK support, [Workers runtime compatibility | container build and cold-start quality], and developer tooling quality. WHY: we need the best server language that actually runs on the profile we have chosen."

Seed candidates:
- **TypeScript (Node)** vs **TypeScript (Bun)** vs **Go** vs **Rust** vs **Python** vs **Elixir**
- On the Cloudflare profile this narrows hard: Workers run JavaScript/TypeScript and WASM. Non-JS languages are only viable via Cloudflare Containers, which is a reason to reconsider the profile rather than a reason to force the language.
- Consider: Better Auth has official SDKs for which languages?

### Wave 2: Frontend Framework Subagent (runs for web or both)

"Research the current best frontend frameworks for deployment on the [chosen profile] profile as of <DATE>. [For Cloudflare: the frontend ships as a Worker with Static Assets -- either a prebuilt SPA or SSR through the framework's Cloudflare adapter. Pages is legacy; do not recommend it. Report which frameworks have a first-party, actively maintained Workers adapter. For Railway: the frontend runs as a container, either static-served or an SSR Node/Bun server.] Compare: quality of the deployment path on that profile, SPA versus SSR versus hybrid trade-offs, build speed, ecosystem size, Better Auth client SDK support, and developer experience. WHY: the frontend has to deploy cleanly on the profile we have chosen and integrate with Better Auth client-side."

Seed candidates:
- **Next.js** vs **SvelteKit** vs **Nuxt** vs **Astro** vs **React Router v7 (formerly Remix)** vs **Solid Start** vs **React (SPA with Vite)**
- Key factor on Cloudflare: adapter quality and whether SSR features survive the Workers runtime. Key factor on Railway: how cleanly the framework containerizes.
- For a desktop project with a companion web surface, note which frameworks can share components with the desktop client's UI.

### Wave 2: Desktop UI & Local Data Subagent (runs for desktop or both)

"Research the current best UI approach and local data layer for a [chosen desktop framework] application as of <DATE>, on [target operating systems]. The app is: [one-line description]; its UI is [answer to question 5]. Cover: which UI toolkit or component library suits this framework, how to look native on each target OS without maintaining three UIs, the recommended local persistence layer (embedded SQLite and its bindings, key-value stores, or plain files) with migration tooling, secure storage of secrets and tokens in the OS keychain, and -- if the app has a server -- the offline-first sync pattern and conflict-resolution approach that fits. WHY: desktop users judge an app on native feel and on not losing their data offline, so the UI toolkit and the local store are the two decisions that shape the rest of the client."

Seed candidates:
- **Web-tech shells:** the same UI libraries as web (shadcn/ui, Mantine, Park UI) plus desktop-flavoured kits; consider native window chrome versus custom titlebars
- **Local data:** SQLite (via the framework's binding -- `tauri-plugin-sql`, `better-sqlite3`, `sqlx`), SQLite with a sync layer, embedded key-value stores, or plain JSON/TOML config files
- **Secrets:** OS keychain integration (`keytar`, `tauri-plugin-stronghold`, `keyring`), never plaintext on disk
- **Sync (only if a backend is in scope):** last-write-wins versus CRDTs (Yjs, Automerge) versus an explicit server-authoritative model

### Wave 3: Backend Framework Subagent (runs whenever a backend is in scope)

"Research the current best backend/API frameworks for [recommended language] on the [chosen profile] profile, as of <DATE>. The framework must support Better Auth middleware, connect to [the profile's database], and use the Cloudflare R2 S3-compatible API. [For Cloudflare: it must run on Workers -- report first-party Workers support, not just 'works in Node'. For Railway: it runs in a long-running container alongside Redis.] Compare: performance, middleware ecosystem, Better Auth integration quality, and [cold-start behaviour on Workers | container startup time]. WHY: the API hosts Better Auth endpoints alongside application logic and has to be a first-class citizen on our chosen profile."

Seed candidates (TypeScript):
- **Hono** vs **Express** vs **Fastify** vs **Elysia** vs **tRPC** (as API layer on top of one of the above)
- On Cloudflare, weight Workers-native support heavily; several of these run there only through compatibility shims.

### Wave 3: UI Library Subagent (runs for web or both)

"Research the current best UI component libraries and styling approaches for [frontend framework], as of <DATE>. Compare: component quality, accessibility out-of-box, theming/customization, bundle size, maintenance activity, design system maturity. WHY: We need a UI approach that gives the best developer experience and end-user quality for [project type]."

Seed candidates:
- **Component libraries:** shadcn/ui vs Radix vs Ark UI vs Mantine vs MUI vs Chakra vs Park UI
- **Styling:** Tailwind CSS vs CSS Modules vs vanilla-extract vs Panda CSS vs UnoCSS
- **Animation:** Framer Motion vs Motion One vs GSAP vs CSS-only

### Wave 3: ORM & Data Layer Subagent (runs whenever a backend is in scope)

"Research the current best ORM/query builder options for [recommended language] against [D1 (SQLite) | Postgres through Hyperdrive | Railway Postgres], as of <DATE>. Compare: type safety, migration tooling, query performance, [D1 driver support and Workers compatibility | connection pooling], and Better Auth database adapter support. WHY: the ORM has to work with the database our chosen profile gives us and support Better Auth's adapter."

Seed candidates (TypeScript):
- **Drizzle** vs **Prisma** vs **Kysely** vs **TypeORM**
- Key factors: which ORMs have a Better Auth database adapter, and -- on Cloudflare -- which have a real D1 driver rather than a Node-only Postgres driver.

### Wave 3: Packaging & Distribution Subagent (runs for desktop or both)

"Research the current packaging, signing, and update pipeline for a [chosen desktop framework] app on [target operating systems], as of <DATE>. Cover: installer formats per OS (MSI/NSIS, DMG/PKG, AppImage/deb/rpm/Flatpak), code signing requirements and current certificate costs, macOS notarization and stapling, Windows SmartScreen reputation, the recommended auto-update mechanism and how updates are signed and verified, CI that can build and sign for every target OS, and whether app-store distribution changes any of it. WHY: [update mechanism from question 13] -- unsigned or unnotarized desktop builds are blocked outright by modern OSes, so this pipeline has to be planned in Phase 1, not discovered at ship time."

Seed candidates:
- **Builders:** `tauri build`, electron-builder, Wails build, `flutter build`, `dotnet publish`
- **Update mechanisms:** Tauri updater, electron-updater / Squirrel, Sparkle (macOS), MSIX/App Installer (Windows), or a plain manifest-plus-artifacts bucket
- **Artifact hosting:** Cloudflare R2 for update manifests and installers -- static files, no compute on either profile
- **CI:** GitHub Actions matrix builds; note which OS runners are required for which signing step

### Wave 3: Tooling Subagent (always runs)

"Research the current recommended developer tooling for [recommended language(s) -- include the desktop client language if different from the server], as of <DATE>. Compare: speed, reliability, ecosystem compatibility. WHY: We need to populate tools.md with the fastest and most reliable tools for this stack."

Seed candidates:
- **Package managers:** npm vs pnpm vs yarn vs bun (plus cargo, go mod, uv, or the client language's equivalent)
- **Bundlers:** Vite vs Turbopack vs esbuild vs Rspack
- **Linters:** ESLint vs Biome vs oxc-lint (plus clippy, golangci-lint, ruff)
- **Formatters:** Prettier vs Biome vs dprint
- **Test runners:** Vitest vs Jest vs Bun test vs Playwright vs Cypress (plus the desktop framework's E2E driver: WebDriver for Tauri, Playwright or Spectron-successors for Electron)
- **Monorepo (if needed):** Turborepo vs Nx vs moon

## Step 5: Produce Stack Recommendation

Synthesize all subagent results into a recommendation. Include only the sections that this project's routing actually produced -- do not emit an empty Platform Profile section for a local-only desktop app, and do not emit a Desktop section for a web project.

```markdown
# Stack Recommendation

**Delivery target:** <web, desktop, or both>
**Backend in scope:** <yes -- for X and Y, or no, fully local>

## Platform Profile
**Recommended:** <Cloudflare, or Railway>
**Why:** <2-3 sentences tied to this project's actual requirements>
**Strongest argument against:** <the real trade-off being accepted>
**Runner-up:** <the other profile> (<what would flip the decision>)

| Layer | Choice |
|-------|--------|
| Frontend hosting | <Workers with Static Assets, or Railway container service> |
| Backend hosting | <Workers, or Railway container service> |
| Database | <D1, or Postgres via Hyperdrive, or Railway Postgres> |
| Cache / state | <Workers KV + Durable Objects, or Railway Redis> |
| Queues | <Cloudflare Queues, or Redis queue / worker service> |
| Cron | <Cron Triggers, or Railway cron service> |
| Object storage | Cloudflare R2 |
| Auth | Better Auth |
| Email | Resend |
| CDN | <native, or Cloudflare proxy in front of Railway> |

## Desktop Client
**Framework:** <choice> <version>
**Why:** <2-3 sentences, must reference the target OSes and the required OS capabilities>
**Runner-up:** <choice> (<trade-off>)
**Client language:** <language> (<note if it differs from the server language and why that is fine>)
**Local data:** <store> (<migrations, and where secrets live>)
**Sync model:** <offline-first strategy, or "n/a -- no server">
**Packaging:** <installer formats per OS>
**Signing:** <per-OS requirements and what has to be bought or provisioned>
**Updates:** <mechanism, and where artifacts are hosted>

## Language & Runtime
**Recommended:** <choice> <version>
**Why:** <2-3 sentences specific to this project + the chosen profile>
**Runner-up:** <choice> (<why it lost>)

## Frontend Framework
**Recommended:** <choice> <version>
**Serving mode:** <SPA (static assets), or SSR (adapter or server container)>
**Why:** <2-3 sentences, must reference the chosen profile's deployment path and justify the serving mode>
**Runner-up:** <choice> (<trade-off>)

## Backend Framework
**Recommended:** <choice> <version>
**Why:** <2-3 sentences, must reference the chosen profile + Better Auth>
**Runner-up:** <choice> (<trade-off>)

## UI Approach
**Component library:** <choice> (<why>)
**Styling:** <choice> (<why>)
**Rationale:** <how these choices work together; for "both" targets, whether the web and desktop UIs share components>

## ORM / Data Layer
**ORM:** <choice> (<why, must reference both the profile's database and Better Auth adapter support>)

## Developer Tooling
**Package manager:** <choice>
**Bundler:** <choice>
**Linter + Formatter:** <choice>
**Test runner:** <choice>

## Full Stack Summary
| Layer | Choice | Version | Why |
|-------|--------|---------|-----|
| Platform profile | ... | n/a | ... |
| Language | ... | ... | ... |
| Frontend framework | ... | ... | ... |
| Frontend serving mode | SPA or SSR | n/a | ... |
| Backend framework | ... | ... | ... |
| Desktop framework | ... | ... | ... |
| Local data store | ... | ... | ... |
| UI library | ... | ... | ... |
| Styling | ... | ... | ... |
| ORM | ... | ... | ... |
| Package mgr | ... | ... | ... |
| Linter | ... | ... | ... |
| Test runner | ... | ... | ... |
```

Two rows are not optional when they apply. The **serving mode** row drives the service topology and the cache rules, so it is an explicit decision rather than something implied by the framework choice. The **signing** line on a desktop plan drives Phase 1 work and real money, so it is stated up front rather than discovered at ship time.

**Present this to the user for approval before proceeding.** They may override specific choices, including the platform profile; accept overrides and adjust dependent choices if needed -- overriding the profile can invalidate the language, framework, and ORM picks, so say so and re-run the affected Wave 2 and Wave 3 subagents rather than keeping picks that no longer fit. After approval, complete Step 3 item 5 (fetch LL-G entries for the chosen technologies).

## Step 6: Generate README

Create a `README.md` with:

1. Project name and one-line description
2. Tech stack summary (chosen profile + recommended stack)
3. Architecture diagram (the one for the chosen profile from infrastructure.md, adapted with chosen framework names; for a local-only desktop app, a client-side diagram instead: UI layer, core, local store, OS integrations)
4. Prerequisites (required tools and versions -- include the desktop toolchain and per-OS build requirements when there is a desktop target)
5. Getting started (clone, install, run)
6. Project structure (planned folder layout based on framework conventions)
7. Environment variables needed (the profile's database and cache, R2, Better Auth, Resend; include the payment provider, e.g. Stripe, only if the project takes payments per Step 2 question 8)
8. Development phases:
   - Phase 1: Foundation (project setup, auth, database schema, deployment pipeline -- for desktop, also the signing and packaging pipeline)
   - Phase 2: Core features (primary functionality)
   - Phase 3: Polish (error handling, edge cases, testing)
   - Phase 4: Ship (production deployment, monitoring, documentation -- for desktop, release channels and the update feed)
9. Deployment section, matching the chosen profile:
   - **Cloudflare:** Worker deployment for frontend and API, bindings (D1/Hyperdrive, KV, R2, Queues), Cron Triggers, custom domain and routes. No CDN wiring -- it is native.
   - **Railway:** frontend and API service deploys, Postgres/Redis provisioning, cron service, volumes, plus the Cloudflare proxy in front (DNS CNAME, Full (Strict) TLS, ACME/proxy ordering).
   - **Desktop:** per-OS build commands, signing prerequisites, notarization, and how the update feed is published to R2.

## Step 7: Generate Design Guardrails

Create `.claude/references/design-guardrails.md` with rules specific to the chosen UI library and styling approach:

1. **Component rules:** Max component size, composition patterns, prop conventions for <chosen library>
2. **Styling rules:** Conventions for <chosen styling approach>, responsive breakpoints, dark mode strategy
3. **Accessibility:** WCAG AA minimum, required ARIA patterns, keyboard navigation, focus management
4. **Performance:** Bundle size budget, image optimization (WebP/AVIF), lazy loading rules, Core Web Vitals targets
5. **Auth UI patterns:** Better Auth sign-in/sign-up flow, social login buttons, magic link flow, passkey enrollment, 2FA setup
6. **Consistency:** Typography scale, spacing scale, color system usage per the chosen design approach

For a desktop target, add:

7. **Native feel:** window chrome and titlebar decisions, per-OS menu conventions, keyboard shortcut maps that respect each platform's modifier conventions, system theme and accent colour following, and what the app does on tray/dock/menu-bar
8. **Desktop states:** offline behaviour, first-run and onboarding, multi-window rules, and what the app shows while an update is downloading or pending restart

## Step 8: Generate Tools Reference

Create or update `.claude/references/tools.md` with the exact CLI tools for the chosen stack.

Constraints for anything server-side:

- There is NO local Docker, no local Postgres, no local Redis. Databases and services run remotely on the chosen profile.
- Development connects to remote services through environment variables, `wrangler dev` bindings (Cloudflare), or `railway run` / `railway connect` (Railway).
- Do NOT add docker, docker-compose, psql, or redis-cli.

A desktop target is the exception to "no local toolchain": desktop builds are local by nature, so the compiler, SDK, and per-OS signing tools all belong in tools.md.

Tools to include:

- Package manager commands
- Build and dev commands
- Framework CLI commands (frontend + backend)
- ORM/migration commands, against the profile's database
- `wrangler` commands -- R2 on both profiles; on the Cloudflare profile also Workers deploy, D1, KV, Queues, and bindings; on the Railway profile also DNS and CDN configuration
- `railway` CLI commands on the Railway profile (deploy, addons, `railway run`, `railway logs`, port-forwarding)
- Desktop toolchain when there is a desktop target: language toolchain (e.g. `rustup`/`cargo`, `go`, `dotnet`, `flutter`), the framework CLI (e.g. `tauri`, `electron-builder`), and per-OS signing tools (`codesign`/`notarytool` on macOS, `signtool` on Windows)
- Linter and formatter commands
- Test runner commands

For each tool: name, install command, version check command, common usage patterns.

Also preserve the **Available MCP Servers** section in tools.md; it documents all MCP integrations available to Claude Code (Cloudflare, GitHub, Slack, Gmail, Google Calendar, Notion, Railway, Doppler, NinjaOne, Zendesk, browser automation). Do not remove or overwrite this section.

## Step 9: Plan the Hierarchical CLAUDE.md Structure

Standard structure, by shape of project:

- Root `CLAUDE.md`: project-wide rules, full stack summary, shared conventions
- `frontend/CLAUDE.md` (or `apps/web/CLAUDE.md`): frontend conventions for the chosen profile (Worker with Static Assets, or container), UI component rules, styling rules
- `api/CLAUDE.md` (or `apps/api/CLAUDE.md`): API conventions for the chosen profile (Workers bindings and runtime limits, or container and private networking), Better Auth integration rules, database patterns
- `desktop/CLAUDE.md` (or `apps/desktop/CLAUDE.md`), when there is a desktop target: the boundary between UI and native core, which operations are allowed to touch the filesystem or OS APIs, local-store and migration rules, and the signing/update invariants that must not be broken

Plan these but do NOT create subfolder CLAUDE.md files until the folders exist.

## Step 10: Save the Plan

Save the complete plan to `tasks/plan-repo.md` with:

1. Project requirements (user's answers, including the delivery target and whether a backend is in scope)
2. Platform profile decision (which one, why, what was traded away) -- or an explicit "no infrastructure: local-only desktop app"
3. Stack recommendation (approved version, including the frontend serving-mode decision and, for desktop, the packaging/signing/update decisions)
4. Research findings summary (key data points that drove decisions)
5. Planned file structure
6. Planned CLAUDE.md hierarchy
7. Design guardrails summary
8. Phase-based development plan
9. Environment variables needed
10. Tools required
11. Lessons Learned / Gotchas section, pre-seeded with the plan-seed entries from Step 3 (each as a one-line summary with its LL-G path), plus an empty checklist for discoveries made during implementation

## Step 11: Report and Next Step

Print a summary of everything planned, then tell the user:

> Your project plan is saved to `tasks/plan-repo.md`. To initialize the project with Claude Code, say **"initialize repo"**. The init-repo skill will read your plan and use it to configure everything.

> **Reminder:** The plan ends with a Lessons Learned / Gotchas section. After each phase, route new discoveries to LL-G via `/add-lesson` so every repo and technician benefits. Do not let lessons sit only in local files.
