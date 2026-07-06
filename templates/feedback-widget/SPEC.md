# Feedback Widget: Design Spec (for adaptive installs)

This file is the **thinking layer** of the feedback-widget template. HANDOFF.md tells you how to install the reference implementation as-is; this file tells you what the widget must accomplish and what must never break, so you can **design the right implementation for the repo in front of you** instead of transplanting code.

Use this when the target repo's stack, conventions, or product needs differ from the reference (Next.js + shadcn + GitHub Issues), or whenever the operator asks for an adaptive install. When the stack matches the reference closely, prefer reusing the reference files: do not rewrite working code for its own sake.

---

## 1. Goal

Any authenticated user can report a problem or idea from anywhere in the app in under 30 seconds, and what arrives at the team is **actionable without a follow-up conversation**: it carries who, where, what, and (ideally) the browser's recent history of errors and failed requests.

## 2. Functional requirements

An implementation is complete when:

1. An always-visible entry point exists for signed-in users (header button in the reference; a command-palette action, help-menu item, or floating button are equally valid).
2. The form captures: category, severity, free-text message (bounded, with a minimum so "broken" alone is rejected).
3. Submission automatically attaches page context: URL, path, viewport, locale, user agent. The user never types this.
4. The submission lands in the team's triage system as a structured, labeled item (GitHub issue in the reference) carrying user identity and context.
5. Optional per-tier: screenshot attach/paste (tier 2), silent browser diagnostics (tier 3).
6. The user gets clear success/failure/rate-limited feedback in the UI.

## 3. Invariants (preserve these regardless of design)

These encode the security model and the failure-mode lessons. A redesign may change *how* each is satisfied, never *whether*.

**Security**
- S1. Both the submit and presign endpoints require authentication. Unfinished integrations must fail closed (the reference ships a 501 stub and hidden buttons, not a permissive default).
- S2. Server-side revalidation of the full payload with bounded field sizes (client validation is UX, not security).
- S3. Per-user rate limiting on submit and presign. The endpoint writes to an external system on your credentials; do not expose it unthrottled.
- S4. Uploaded-object references are ownership-bound: the storage key embeds the user id at presign time and the submit endpoint rejects keys outside that user's namespace. Never accept an arbitrary client-supplied storage key.
- S5. Captured telemetry is redacted **in the browser, before transport** (JWTs, bearer tokens, emails, long hex/tokens, sensitive query params). Storage inspection counts sizes only, never values.
- S6. The triage destination is private. Submissions contain user emails, ids, and internal URLs.
- S7. No secrets in the client bundle. Tracker tokens live server-side only.

**Resilience**
- R1. Instrumentation must never break the app: every telemetry hook wraps its work in try/catch and falls through to the original behavior.
- R2. Network capture must ignore its own traffic (`/api/feedback*`) and analytics ingest, or submissions record their own upload and analytics noise floods the buffer.
- R3. Tracker outage never fails the user: issue-create, screenshot-commit, and diagnostics-commit all degrade to logged warnings; the user still gets a success response. Missing tracker config = accept, validate, log, warn.
- R4. Everything rendered into the tracker item body is truncated/bounded (GitHub caps bodies at 65k); full detail goes into a linked artifact.
- R5. All ring buffers are capped (console/network/breadcrumb) so memory is bounded on long-lived tabs.

**UX**
- U1. Message minimum ~10 chars with visible counter; submit disabled below it.
- U2. Rate-limit responses surface as a friendly "wait N seconds", not a raw error.
- U3. Paste-to-attach must not hijack pasting *text* into a non-empty text field.
- U4. The feedback dialog itself never shows a feedback button (no recursion), nor do utility modals like command palettes.

## 4. Degrees of freedom (redesign per instance)

Decide these fresh for each repo, based on what the codebase already does:

| Dimension | Reference choice | Freely substitutable with |
|---|---|---|
| UI surface | shadcn Dialog | Slide-over, drawer, dedicated page, command-palette flow; whatever the app's design system uses |
| Form machinery | react-hook-form + zodResolver | The repo's existing form pattern; plain controlled state is fine for 3 fields |
| Server shape | Next.js route handlers | Server actions (note: presigned upload still needs an HTTP presign step or a signed-POST equivalent), tRPC, Express/Hono routes |
| Validation lib | Zod v4 | Whatever the repo validates with, provided S2's bounds survive |
| Categories/severities | 8 categories, 3 severities | Product-appropriate sets; keep label slugs and tracker labels in sync |
| Triage destination | GitHub Issues + repo-committed artifacts | Linear/Jira/etc. **only if** it supports API-created attachments or you keep artifacts in object storage with long-TTL links. The GitHub gotchas in HANDOFF.md §11 are GitHub-specific; a different tracker needs its own artifact-hosting answer, so investigate before committing to one |
| Storage | Generic S3 client | The repo's existing storage lib; or drop tier 2 entirely |
| Telemetry depth | Full tier 3 | Any subset; console+network capture is the highest-value slice |
| Analytics | No-op stubs | The repo's analytics, or nothing |
| Tenant context | Empty `context` array | Org/workspace/plan rows looked up server-side |

## 5. Hard-won constraints (do not re-derive these)

Read HANDOFF.md §11 (gotchas) in full before designing. The expensive ones:

- Private-repo images never render inline in GitHub issues; `download_url` tokens 404 in minutes. Contents-API commit + blob link is the only durable GitHub-hosted option.
- There is no PAT-authenticated API for GitHub's drag-and-drop issue attachments.
- Presigned-URL fallbacks rot; say so in the issue body when used.
- In-memory rate limiting is per-process; multi-instance deployments need Redis or equivalent.
- Console/fetch/history monkey-patching must be idempotent (guard with an install flag) or hot-reload double-patches.

## 6. Adaptive install procedure

1. **Read** this spec, HANDOFF.md §10–11 (security + gotchas), and skim the reference `files/`.
2. **Survey the target repo**: auth system and its session hooks; UI kit and dialog/form conventions; where validations, hooks, and API helpers live; existing rate-limit/logging/storage/analytics utilities; how similar features are structured. Reuse the repo's idioms over the template's.
3. **Choose the tier** and the §4 degrees of freedom; confirm the triage destination can host artifacts (§5).
4. **Write a short integration plan** (surface, endpoints, file placement, which reference files transfer verbatim vs get redesigned, which repo utilities replace the adapter stubs) and check it against every §3 invariant. Present it to the operator if they're available; otherwise proceed and note deviations in the summary.
5. **Implement.** Lift reference code wherever the stack matches; the telemetry lib, redaction, and GitHub helpers are framework-agnostic and rarely worth rewriting.
6. **Verify** with HANDOFF.md §12, adapting checklist items to the chosen design (every §3 invariant must map to at least one verified behavior).

---

_Relationship to HANDOFF.md: HANDOFF is the fast path (stack matches, install faithfully). SPEC is the judgment path (stack or product differs, design to fit). Both share §10–12 of HANDOFF as the source for security detail, gotchas, and verification._
